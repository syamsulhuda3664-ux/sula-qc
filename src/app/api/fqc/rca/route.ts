import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { generateWeeklyRCA, type RCALang } from '@/lib/rca-generator';
import { mapInspectionRow } from '@/lib/db-schema';

const BUSINESS_TYPES = ['PTOEM', 'PTB2C', 'PTGH'];

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Get strict monthly week periods.
 */
function getStrictMonthWeeks(year: number, month: number): { start: string; end: string; weekNum: number }[] {
  const periods: { start: string; end: string; weekNum: number }[] = [];
  const lastDate = new Date(year, month, 0).getDate();
  const monthIdx = month - 1;

  let current = new Date(year, monthIdx, 1);
  let weekNum = 1;

  while (current.getDate() <= lastDate && current.getMonth() === monthIdx) {
    const weekStart = new Date(current);
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
      current.setDate(weekEnd.getDate() + 2);
    } else {
      break;
    }
  }

  return periods;
}

/**
 * Determine unique months from a date range string like 'YYYY-MM-DD'
 */
function getMonthsInRange(dateFrom?: string, dateTo?: string): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];

  if (!dateFrom || !dateTo) {
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

/**
 * Get user's language from role for template generation.
 */
function getLangFromRole(role?: string): RCALang {
  if (role === 'manager_qc' || role === 'manager_umum') return 'zh';
  return 'id';
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
    const userRole = auth.user?.role;
    const lang = getLangFromRole(userRole);

    // ═══════════════════════════════════════════════════════════
    // AUTO-GENERATE — produces draft data, does NOT save to DB
    // ═══════════════════════════════════════════════════════════
    if (action === 'auto-generate') {
      const { date_from, date_to, business_type: bt } = body;

      const typesToGenerate = bt && bt !== 'ALL' ? [bt] : BUSINESS_TYPES;
      const months = getMonthsInRange(date_from, date_to);

      // First: delete existing DRAFT-ONLY data (no saved RCAs are touched)
      // We only delete if the user is regenerating — saved RCAs stay
      // Actually, for regeneration: delete existing saved RCAs too (old behavior)
      for (const { year, month: m } of months) {
        const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
        const lastDay = fmt(new Date(year, m, 0));

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
          await adminClient.from('rca_actions').delete().in('rca_id', ids);
          let delQuery = adminClient.from('rca_weekly').delete().in('id', ids);
          const { error: delError } = await delQuery;
          if (delError) console.error('Delete old RCAs error:', delError);
        }
      }

      // Generate draft RCAs (NOT saved to DB)
      const draftRcas: Record<string, unknown>[] = [];

      for (const { year, month: m } of months) {
        const weeks = getStrictMonthWeeks(year, m);

        for (const week of weeks) {
          for (const btKey of typesToGenerate) {
            // Generate with user's language for templates
            const { data: fqcRecords } = await adminClient
              .from('fqc_inspections')
              .select('*')
              .gte('inspection_date', week.start)
              .lte('inspection_date', week.end)
              .eq('business_type', btKey);

            if (!fqcRecords || fqcRecords.length === 0) continue;

            const mappedRecords = fqcRecords.map(mapInspectionRow);
            const rca = generateWeeklyRCA(new Date(week.start), new Date(week.end), mappedRecords, lang);

            if (rca.totalInspected === 0) continue;

            draftRcas.push({
              draft_id: `${week.start}__${btKey}`,
              week_start: week.start,
              week_end: week.end,
              business_type: btKey,
              total_inspections: rca.totalInspections,
              total_inspected: rca.totalInspected,
              total_ok: rca.totalOK,
              total_ng: rca.totalNG,
              overall_pass_rate: rca.overallPassRate,
              top_categories: rca.topCategories,
              top_sub_defects: rca.subDefects,
              top_styles: rca.topStyles,
              actions: rca.actions,
              status: 'draft',
              is_draft: true,
            });
          }
        }
      }

      return NextResponse.json({
        message: `Generated ${draftRcas.length} draft RCA(s) — click Save to store`,
        created: draftRcas.length,
        draft_rcas: draftRcas,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // SAVE DRAFT — saves a single draft RCA to DB
    // ═══════════════════════════════════════════════════════════
    if (action === 'save-draft') {
      const { week_start, week_end, business_type, total_inspections, total_inspected, total_ok, total_ng, overall_pass_rate, top_categories, top_sub_defects, top_styles, actions } = body;

      if (!week_start || !week_end || !business_type) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Check duplicate
      const { data: existing } = await adminClient
        .from('rca_weekly')
        .select('id')
        .eq('week_start', week_start)
        .eq('week_end', week_end)
        .eq('business_type', business_type)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'RCA already saved for this period', existing_id: existing.id }, { status: 409 });
      }

      // Insert rca_weekly
      const { data: inserted, error: insertError } = await adminClient
        .from('rca_weekly')
        .insert({
          week_start,
          week_end,
          business_type,
          total_inspections: total_inspections || 0,
          total_inspected: total_inspected || 0,
          total_ok: total_ok || 0,
          total_ng: total_ng || 0,
          overall_pass_rate: overall_pass_rate || 100,
          top_categories: top_categories || [],
          top_sub_defects: top_sub_defects || [],
          top_styles: top_styles || [],
          status: 'pending',
          created_by: userId,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('Save draft RCA error:', insertError);
        return NextResponse.json({ error: 'Failed to save RCA' }, { status: 500 });
      }

      // Insert rca_actions
      if (Array.isArray(actions) && actions.length > 0) {
        const actionRows = actions.map((a: Record<string, unknown>) => ({
          rca_id: inserted.id,
          rank: a.rank || 0,
          category: a.category || null,
          sub_defects: a.sub_defects || [],
          defect_qty: a.defect_qty || 0,
          style_codes: a.style_codes || [],
          root_cause: a.root_cause || null,
          impact: a.impact || null,
          process: a.process || null,
          corrective_action: a.corrective_action || null,
          preventive_action: a.preventive_action || null,
          responsible: a.responsible || null,
          due_date: a.due_date || null,
          status: a.status || 'pending',
          photo_before: a.photo_before || null,
          photo_after: a.photo_after || null,
          created_by: userId,
        }));

        const { error: actionError } = await adminClient
          .from('rca_actions')
          .insert(actionRows);

        if (actionError) {
          console.error('Save actions error:', actionError);
        }
      }

      return NextResponse.json({
        id: inserted.id,
        message: 'RCA saved successfully',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('RCA POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
