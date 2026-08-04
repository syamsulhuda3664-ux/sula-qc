import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { generateWeeklyRCA } from '@/lib/rca-generator';
import { mapInspectionRow } from '@/lib/db-schema';

const BUSINESS_TYPES = ['PTOEM', 'PTB2C', 'PTGH'];

/**
 * Calculate the Monday-Saturday week range for a given date.
 */
function getMondaySaturdayRange(dateStr: string): { monday: string; saturday: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  return { monday: fmt(monday), saturday: fmt(saturday) };
}

/**
 * Generate RCA for a single Mon-Sat period + specific business type.
 */
async function generateRCAForPeriod(
  monday: string,
  saturday: string,
  businessType: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  // Check duplicate: same week_start + week_end + business_type
  let existsQuery = adminClient
    .from('rca_weekly')
    .select('id')
    .eq('week_start', monday)
    .eq('week_end', saturday)
    .eq('business_type', businessType);

  const { data: existing } = await existsQuery.maybeSingle();
  if (existing) return null;

  // Fetch FQC records for the week + business type
  let query = adminClient
    .from('fqc_inspections')
    .select('*')
    .gte('inspection_date', monday)
    .lte('inspection_date', saturday)
    .eq('business_type', businessType);

  const { data: fqcRecords, error: fqcError } = await query;
  if (fqcError || !fqcRecords || fqcRecords.length === 0) return null;

  const mappedRecords = fqcRecords.map(mapInspectionRow);
  const rca = generateWeeklyRCA(new Date(monday), new Date(saturday), mappedRecords);

  if (rca.totalInspected === 0) return null;

  const { data: inserted, error: insertError } = await adminClient
    .from('rca_weekly')
    .insert({
      week_start: monday,
      week_end: saturday,
      business_type: businessType,
      total_inspections: rca.totalInspections,
      total_inspected: rca.totalInspected,
      total_ok: rca.totalOK,
      total_ng: rca.totalNG,
      overall_pass_rate: rca.overallPassRate,
      top_categories: rca.topCategories,
      top_sub_defects: rca.subDefects,
      top_styles: rca.topStyles,
      status: 'pending',
      created_by: userId,
    })
    .select('id, week_start, week_end, business_type')
    .single();

  if (insertError || !inserted) {
    console.error('Generate RCA error:', insertError);
    return null;
  }

  return inserted;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const bt = searchParams.get('business_type');

    let query = adminClient
      .from('rca_weekly')
      .select(`
        *,
        rca_actions (*)
      `)
      .order('week_start', { ascending: true });

    if (month) {
      const [yearStr, monthStr] = month.split('-');
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(year, m, 0).toISOString().split('T')[0];
      // Use gte on week_start only (week may spill into next month)
      query = query.gte('week_start', firstDay).lte('week_start', lastDay);
    }

    if (bt && bt !== 'ALL') {
      query = query.eq('business_type', bt);
    }

    const { data, error } = await query;

    if (error) {
      console.error('List RCA error:', error);
      return NextResponse.json({ error: 'Failed to fetch RCA records' }, { status: 500 });
    }

    return NextResponse.json({ records: data || [] });
  } catch (error) {
    console.error('List RCA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { action } = body;
    const userId = auth.user!.id;

    // AUTO-GENERATE
    if (action === 'auto-generate') {
      const { date_from, date_to, business_type: bt } = body;

      // Determine which business types to generate for
      const typesToGenerate = bt && bt !== 'ALL' ? [bt] : BUSINESS_TYPES;

      // Find all unique week periods from inspection dates
      const dateQueryBase = adminClient
        .from('fqc_inspections')
        .select('inspection_date, business_type')
        .order('inspection_date', { ascending: true });

      if (date_from) dateQueryBase.gte('inspection_date', date_from);
      if (date_to) dateQueryBase.lte('inspection_date', date_to);

      const { data: dateRows } = await dateQueryBase;
      if (!dateRows || dateRows.length === 0) {
        return NextResponse.json({ message: 'No inspection data found', created: 0 });
      }

      // Collect unique (week, businessType) pairs
      const pairSet = new Set<string>();
      for (const row of dateRows) {
        const rowBt = String(row.business_type || '');
        if (!typesToGenerate.includes(rowBt)) continue;
        const d = String(row.inspection_date).split('T')[0];
        const { monday, saturday } = getMondaySaturdayRange(d);
        pairSet.add(`${monday}__${saturday}__${rowBt}`);
      }

      let created = 0;
      for (const key of pairSet) {
        const [monday, saturday, btKey] = key.split('__');
        const result = await generateRCAForPeriod(monday, saturday, btKey, userId);
        if (result) created++;
      }

      return NextResponse.json({
        message: `Auto-generated ${created} RCA(s)`,
        created,
      });
    }

    // MANUAL GENERATE
    const { weekStart, weekEnd, business_type: bt } = body;

    if (!weekStart || !weekEnd || !bt) {
      return NextResponse.json(
        { error: 'weekStart, weekEnd, and business_type are required' },
        { status: 400 }
      );
    }

    const result = await generateRCAForPeriod(weekStart, weekEnd, bt, userId);

    if (!result) {
      const { data: existing } = await adminClient
        .from('rca_weekly')
        .select('id')
        .eq('week_start', weekStart)
        .eq('week_end', weekEnd)
        .eq('business_type', bt)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'RCA already exists for this week', existing_id: existing.id },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'No inspection data found for this week' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { rca: result, message: 'Weekly RCA generated successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Generate RCA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { getMondaySaturdayRange };
