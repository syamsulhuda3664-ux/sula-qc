import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { extractLineSortKey } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const businessType = searchParams.get('business_type');
    const productionLine = searchParams.get('production_line');
    const stage = searchParams.get('stage');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '100', 10), 500);

    let query = adminClient
      .from('ipqc_records')
      .select('*')
      .order('inspection_date', { ascending: false });

    let countQuery = adminClient
      .from('ipqc_records')
      .select('*', { count: 'exact', head: true });

    if (dateFrom) {
      query = query.gte('inspection_date', dateFrom);
      countQuery = countQuery.gte('inspection_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('inspection_date', dateTo);
      countQuery = countQuery.lte('inspection_date', dateTo);
    }
    if (businessType) {
      query = query.eq('business_type', businessType);
      countQuery = countQuery.eq('business_type', businessType);
    }
    if (productionLine) {
      query = query.eq('production_line', productionLine);
      countQuery = countQuery.eq('production_line', productionLine);
    }
    if (stage) {
      query = query.eq('stage', stage);
      countQuery = countQuery.eq('stage', stage);
    }

    const { count: totalCount } = await countQuery;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: records, error } = await query;

    if (error) {
      console.error('IPQC records error:', error);
      return NextResponse.json({ error: 'Failed to fetch IPQC records' }, { status: 500 });
    }

    const allRecords = records || [];

    // Compute subtotals
    const subtotals = {
      total_records: allRecords.length,
      total_checked: 0,
      total_pass: 0,
      total_fail: 0,
      total_defects: 0,
      avg_pass_rate: 0,
      by_stage: {} as Record<string, { count: number; checked: number; pass: number; fail: number; defects: number; pass_rate: number }>,
    };

    const stages = ['Cutting', 'Sewing', 'Assembly', 'Finishing'];
    for (const s of stages) {
      subtotals.by_stage[s] = { count: 0, checked: 0, pass: 0, fail: 0, defects: 0, pass_rate: 0 };
    }

    for (const r of allRecords) {
      const checked = Number(r.check_count) || 0;
      const pass = Number(r.ok_count) || 0;
      const fail = Number(r.ng_count) || 0;
      const defects = Number(r.total_defects) || 0;
      const stageName = r.stage || 'Unknown';

      subtotals.total_checked += checked;
      subtotals.total_pass += pass;
      subtotals.total_fail += fail;
      subtotals.total_defects += defects;

      if (subtotals.by_stage[stageName]) {
        subtotals.by_stage[stageName].count += 1;
        subtotals.by_stage[stageName].checked += checked;
        subtotals.by_stage[stageName].pass += pass;
        subtotals.by_stage[stageName].fail += fail;
        subtotals.by_stage[stageName].defects += defects;
      }
    }

    subtotals.avg_pass_rate = subtotals.total_checked > 0
      ? Math.round((subtotals.total_pass / subtotals.total_checked) * 10000) / 100
      : 0;

    for (const s of stages) {
      const stageData = subtotals.by_stage[s];
      stageData.pass_rate = stageData.checked > 0
        ? Math.round((stageData.pass / stageData.checked) * 10000) / 100
        : 0;
    }

    // Map DB rows to app-level field names for the frontend
    const mappedRecords = allRecords.map((r: Record<string, unknown>) => ({
      ...r,
      line: r.production_line,
      inspector: r.inspector_name,
      style: r.style_code,
      checked_qty: r.check_count,
      pass_qty: r.ok_count,
      fail_qty: r.ng_count,
      detail: r.defect_detail,
    })).sort((a, b) => {
      const dateComp = String(b.inspection_date || '').localeCompare(String(a.inspection_date || ''));
      if (dateComp !== 0) return dateComp;
      return extractLineSortKey(String(a.line || '')).localeCompare(extractLineSortKey(String(b.line || '')));
    });

    return NextResponse.json({
      records: mappedRecords as any[],
      subtotals,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount || allRecords.length,
        total_pages: Math.ceil((totalCount || allRecords.length) / pageSize),
      },
    });
  } catch (error) {
    console.error('IPQC records error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
