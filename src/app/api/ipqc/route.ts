import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

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
    const orderNo = searchParams.get('order_no');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '200', 10), 500);

    let query = adminClient
      .from('ipqc_records')
      .select('*')
      .order('inspection_date', { ascending: false })
      .order('order_no', { ascending: true })
      .order('session_no', { ascending: true });

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
      query = query.eq('process_stage', stage);
      countQuery = countQuery.eq('process_stage', stage);
    }
    if (orderNo) {
      query = query.eq('order_no', orderNo);
      countQuery = countQuery.eq('order_no', orderNo);
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
      total_sessions: 0,
      total_checked: 0,
      total_pass: 0,
      total_fail: 0,
      sessions_with_finding: 0,
      avg_pass_rate: 0,
      by_stage: {} as Record<string, { sessions: number; checked: number; pass: number; fail: number; findings: number; pass_rate: number }>,
    };

    const stages = ['Cutting', 'Sewing', 'Assembly', 'Finishing'];
    for (const s of stages) {
      subtotals.by_stage[s] = { sessions: 0, checked: 0, pass: 0, fail: 0, findings: 0, pass_rate: 0 };
    }

    // Track unique (date + order) combos for session count
    const uniqueOrders = new Set<string>();

    for (const r of allRecords) {
      const checked = Number(r.check_count) || 0;
      const pass = Number(r.ok_count) || 0;
      const fail = Number(r.ng_count) || 0;
      const stageName = r.process_stage || 'Unknown';
      const hasFinding = r.finding && String(r.finding).length > 0;

      subtotals.total_checked += checked;
      subtotals.total_pass += pass;
      subtotals.total_fail += fail;
      if (hasFinding) subtotals.sessions_with_finding++;

      uniqueOrders.add(`${r.inspection_date}__${r.order_no}`);

      if (subtotals.by_stage[stageName]) {
        subtotals.by_stage[stageName].sessions += 1;
        subtotals.by_stage[stageName].checked += checked;
        subtotals.by_stage[stageName].pass += pass;
        subtotals.by_stage[stageName].fail += fail;
        if (hasFinding) subtotals.by_stage[stageName].findings += 1;
      }
    }

    subtotals.total_sessions = uniqueOrders.size;
    subtotals.avg_pass_rate = subtotals.total_checked > 0
      ? Math.round((subtotals.total_pass / subtotals.total_checked) * 10000) / 100
      : 0;

    for (const s of stages) {
      const stageData = subtotals.by_stage[s];
      stageData.pass_rate = stageData.checked > 0
        ? Math.round((stageData.pass / stageData.checked) * 10000) / 100
        : 0;
    }

    return NextResponse.json({
      records: allRecords,
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
