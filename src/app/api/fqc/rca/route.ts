import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { generateWeeklyRCA } from '@/lib/rca-generator';
import { mapInspectionRow } from '@/lib/db-schema';

const BUSINESS_TYPES = ['PTOEM', 'PTB2C', 'PTGH'];

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Get strict monthly week periods.
 * Week 1 starts from the 1st of the month (whatever day of week).
 * Week 1 ends on the first Saturday on or after the 1st.
 * Subsequent weeks: Monday to Saturday.
 * If Saturday exceeds month end, cap at last day of month.
 */
function getStrictMonthWeeks(year: number, month: number): { start: string; end: string; weekNum: number }[] {
  const periods: { start: string; end: string; weekNum: number }[] = [];
  const lastDate = new Date(year, month, 0).getDate();
  const monthIdx = month - 1;

  let current = new Date(year, monthIdx, 1);
  let weekNum = 1;

  while (current.getDate() <= lastDate && current.getMonth() === monthIdx) {
    const weekStart = new Date(current);

    // Find Saturday, or cap at month end
    let weekEnd = new Date(current);
    while (weekEnd.getDay() !== 6 && weekEnd.getDate() < lastDate) {
      weekEnd.setDate(weekEnd.getDate() + 1);
    }
    if (weekEnd.getMonth() !== monthIdx) {
      weekEnd = new Date(year, monthIdx, lastDate);
    }

    periods.push({ start: fmt(weekStart), end: fmt(weekEnd), weekNum });
    weekNum++;

    if (weekEnd.getDay() === 6) {
      current = new Date(weekEnd);
      current.setDate(weekEnd.getDate() + 2); // Sat + 2 = Mon
    } else {
      break;
    }
  }

  return periods;
}

/**
 * Generate RCA for a single period + specific business type.
 */
async function generateRCAForPeriod(
  weekStart: string,
  weekEnd: string,
  businessType: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  // Check duplicate
  const { data: existing } = await adminClient
    .from('rca_weekly')
    .select('id')
    .eq('week_start', weekStart)
    .eq('week_end', weekEnd)
    .eq('business_type', businessType)
    .maybeSingle();

  if (existing) return null;

  // Fetch FQC records for the period + business type
  const { data: fqcRecords, error: fqcError } = await adminClient
    .from('fqc_inspections')
    .select('*')
    .gte('inspection_date', weekStart)
    .lte('inspection_date', weekEnd)
    .eq('business_type', businessType);

  if (fqcError || !fqcRecords || fqcRecords.length === 0) return null;

  const mappedRecords = fqcRecords.map(mapInspectionRow);
  const rca = generateWeeklyRCA(new Date(weekStart), new Date(weekEnd), mappedRecords);

  if (rca.totalInspected === 0) return null;

  const { data: inserted, error: insertError } = await adminClient
    .from('rca_weekly')
    .insert({
      week_start: weekStart,
      week_end: weekEnd,
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

  // Auto-insert action items from the generated RCA
  if (rca.actions && rca.actions.length > 0) {
    const actionRows = rca.actions.map((a: any) => ({
      rca_id: inserted.id,
      rank: a.rank,
      category: a.category,
      sub_defects: a.sub_defects || [],
      defect_qty: a.defect_qty || 0,
      style_codes: a.style_codes || [],
      root_cause: a.root_cause || null,
      impact: a.impact || null,
      process: a.process || null,
      corrective_action: a.corrective_action || null,
      preventive_action: a.preventive_action || null,
      responsible: null,
      due_date: null,
      status: 'pending',
      photo_before: null,
      photo_after: null,
      created_by: userId,
    }));

    const { error: actionError } = await adminClient
      .from('rca_actions')
      .insert(actionRows);

    if (actionError) {
      console.error('Auto-insert actions error:', actionError);
    }
  }

  return inserted;
}

/**
 * Determine unique months from a date range string like 'YYYY-MM-DD'
 */
function getMonthsInRange(dateFrom?: string, dateTo?: string): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];

  if (!dateFrom || !dateTo) {
    // Default: current month
    const now = new Date();
    return [{ year: now.getFullYear(), month: now.getMonth() + 1 }];
  }

  let [y, m] = dateFrom.split('-').map(Number);
  const [ey, em] = dateTo.split('-').map(Number);

  while (y < ey || (y === ey && m <= em)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  return months;
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
      const lastDay = fmt(new Date(year, m, 0));
      // week_start is always within the month now (strict periods)
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

      // Determine months to process
      const months = getMonthsInRange(date_from, date_to);

      // First: delete existing RCAs for these months + business types to allow clean regeneration
      for (const { year, month: m } of months) {
        const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
        const lastDay = fmt(new Date(year, m, 0));

        // Get RCA IDs to delete (for cleaning up actions)
        let getQuery = adminClient
          .from('rca_weekly')
          .select('id')
          .gte('week_start', firstDay)
          .lte('week_start', lastDay);
        if (bt && bt !== 'ALL') {
          getQuery = getQuery.eq('business_type', bt);
        }
        const { data: toDelete } = await getQuery;

        if (toDelete && toDelete.length > 0) {
          const ids = toDelete.map((r: { id: string }) => r.id);
          // Delete actions first (orphan cleanup)
          await adminClient.from('rca_actions').delete().in('rca_id', ids);
          // Then delete the RCA records
          let delQuery = adminClient.from('rca_weekly').delete().in('id', ids);
          const { error: delError } = await delQuery;
          if (delError) console.error('Delete old RCAs error:', delError);
        }
      }

      // Now generate RCAs using strict monthly week periods
      let created = 0;

      for (const { year, month: m } of months) {
        const weeks = getStrictMonthWeeks(year, m);

        for (const week of weeks) {
          for (const btKey of typesToGenerate) {
            const result = await generateRCAForPeriod(week.start, week.end, btKey, userId);
            if (result) created++;
          }
        }
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
