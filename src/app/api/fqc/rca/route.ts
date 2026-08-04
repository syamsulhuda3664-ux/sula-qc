import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { generateWeeklyRCA } from '@/lib/rca-generator';
import { mapInspectionRow } from '@/lib/db-schema';

/**
 * Calculate the Monday-Saturday week range for a given date.
 * Returns { monday, saturday } as YYYY-MM-DD strings.
 */
function getMondaySaturdayRange(dateStr: string): { monday: string; saturday: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  // If Sunday (0), go back 1 day to Saturday's week
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  return { monday: fmt(monday), saturday: fmt(saturday) };
}

/**
 * Get all Monday-Saturday week periods in a given month.
 * A week belongs to a month if its Monday falls within that month.
 */
function getWeekPeriodsInMonth(year: number, month: number): { monday: string; saturday: string; weekNum: number }[] {
  const periods: { monday: string; saturday: string; weekNum: number }[] = [];
  // Start from the 1st of the month
  const firstDay = new Date(year, month - 1, 1);
  const day = firstDay.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() + diff);

  // If firstMonday is in previous month, start from next Monday
  if (firstMonday.getMonth() !== month - 1) {
    firstMonday.setDate(firstMonday.getDate() + 7);
  }

  let weekNum = 1;
  let current = new Date(firstMonday);
  while (current.getMonth() === month - 1) {
    const saturday = new Date(current);
    saturday.setDate(current.getDate() + 5);
    periods.push({
      monday: current.toISOString().split('T')[0],
      saturday: saturday.toISOString().split('T')[0],
      weekNum,
    });
    weekNum++;
    current.setDate(current.getDate() + 7);
  }
  return periods;
}

/**
 * Generate RCA for a single Mon-Sat period if data exists.
 * Returns the created RCA or null if no data/already exists.
 */
async function generateRCAForPeriod(
  monday: string,
  saturday: string,
  businessType: string | null,
  userId: string
): Promise<Record<string, unknown> | null> {
  // Check if already exists
  const { data: existing } = await adminClient
    .from('rca_weekly')
    .select('id')
    .eq('week_start', monday)
    .eq('week_end', saturday)
    .maybeSingle();

  if (existing) return null;

  // Fetch FQC records for the week
  let query = adminClient
    .from('fqc_inspections')
    .select('*')
    .gte('inspection_date', monday)
    .lte('inspection_date', saturday);

  if (businessType && businessType !== 'ALL') {
    query = query.eq('business_type', businessType);
  }

  const { data: fqcRecords, error: fqcError } = await query;
  if (fqcError || !fqcRecords || fqcRecords.length === 0) return null;

  const mappedRecords = fqcRecords.map(mapInspectionRow);
  const rca = generateWeeklyRCA(new Date(monday), new Date(saturday), mappedRecords);

  if (rca.totalInspected === 0) return null;

  // Insert
  const { data: inserted, error: insertError } = await adminClient
    .from('rca_weekly')
    .insert({
      week_start: monday,
      week_end: saturday,
      business_type: businessType === 'ALL' ? null : businessType,
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
    .select('id, week_start, week_end')
    .single();

  if (insertError || !inserted) {
    console.error('Auto-generate RCA error:', insertError);
    return null;
  }

  return inserted;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // format: YYYY-MM

    let query = adminClient
      .from('rca_weekly')
      .select(`
        *,
        rca_actions (*)
      `)
      .order('week_start', { ascending: false });

    if (month) {
      const [yearStr, monthStr] = month.split('-');
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      // Get first and last day of month
      const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(year, m, 0).toISOString().split('T')[0];
      query = query.gte('week_start', firstDay).lte('week_end', lastDay);
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

    // AUTO-GENERATE: Generate RCAs for all periods that have data but no RCA yet
    if (action === 'auto-generate') {
      const { date_from, date_to, business_type } = body;
      const userId = auth.user!.id;

      // Find all unique inspection dates in the range
      let dateQuery = adminClient
        .from('fqc_inspections')
        .select('inspection_date')
        .order('inspection_date', { ascending: true });

      if (date_from) dateQuery = dateQuery.gte('inspection_date', date_from);
      if (date_to) dateQuery = dateQuery.lte('inspection_date', date_to);
      if (business_type && business_type !== 'ALL') {
        dateQuery = dateQuery.eq('business_type', business_type);
      }

      const { data: dateRows } = await dateQuery;
      if (!dateRows || dateRows.length === 0) {
        return NextResponse.json({ message: 'No inspection data found', created: 0 });
      }

      // Collect unique week periods from the dates
      const weekSet = new Set<string>();
      for (const row of dateRows) {
        const d = String(row.inspection_date).split('T')[0];
        const { monday, saturday } = getMondaySaturdayRange(d);
        weekSet.add(`${monday}__${saturday}`);
      }

      let created = 0;
      for (const key of weekSet) {
        const [monday, saturday] = key.split('__');
        const result = await generateRCAForPeriod(monday, saturday, business_type || null, userId);
        if (result) created++;
      }

      return NextResponse.json({
        message: `Auto-generated ${created} RCA(s)`,
        created,
      });
    }

    // MANUAL GENERATE: Generate for a specific week
    const { weekStart, weekEnd, business_type: bt } = body;

    if (!weekStart || !weekEnd) {
      return NextResponse.json(
        { error: 'weekStart and weekEnd are required' },
        { status: 400 }
      );
    }

    const result = await generateRCAForPeriod(weekStart, weekEnd, bt || null, auth.user!.id);

    if (!result) {
      // Check if it's because it already exists
      const { data: existing } = await adminClient
        .from('rca_weekly')
        .select('id')
        .eq('week_start', weekStart)
        .eq('week_end', weekEnd)
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

export { getMondaySaturdayRange, getWeekPeriodsInMonth, generateRCAForPeriod };
