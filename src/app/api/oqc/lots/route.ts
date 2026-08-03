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
    const disposition = searchParams.get('disposition');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '50', 10), 200);

    let query = adminClient
      .from('oqc_daily_lots')
      .select(`
        *,
        oqc_lot_orders (*),
        oqc_defects (*)
      `)
      .order('lot_date', { ascending: false });

    let countQuery = adminClient
      .from('oqc_daily_lots')
      .select('*', { count: 'exact', head: true });

    if (dateFrom) {
      query = query.gte('lot_date', dateFrom);
      countQuery = countQuery.gte('lot_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('lot_date', dateTo);
      countQuery = countQuery.lte('lot_date', dateTo);
    }
    if (businessType) {
      query = query.eq('business_type', businessType);
      countQuery = countQuery.eq('business_type', businessType);
    }
    if (disposition) {
      query = query.eq('disposition', disposition);
      countQuery = countQuery.eq('disposition', disposition);
    }

    const { count: totalCount } = await countQuery;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error } = await query;

    if (error) {
      console.error('OQC lots error:', error);
      return NextResponse.json({ error: 'Failed to fetch OQC lots' }, { status: 500 });
    }

    // Compute summary for the filtered set
    const lots = data || [];
    const summary = {
      total_lots: 0,
      total_lot_size: 0,
      total_sample_size: 0,
      total_defects: 0,
      release_count: 0,
      rework_count: 0,
      hold_count: 0,
      total_release_qty: 0,
      total_rework_qty: 0,
      total_hold_qty: 0,
    };

    for (const lot of lots) {
      summary.total_lots += 1;
      summary.total_lot_size += Number(lot.lot_size) || 0;
      summary.total_sample_size += Number(lot.sample_size) || 0;
      summary.total_defects += Number(lot.total_defects) || 0;
      summary.total_release_qty += Number(lot.release_qty) || 0;
      summary.total_rework_qty += Number(lot.rework_qty) || 0;
      summary.total_hold_qty += Number(lot.hold_qty) || 0;
      if (lot.disposition === 'RELEASE') summary.release_count += 1;
      if (lot.disposition === 'REWORK') summary.rework_count += 1;
      if (lot.disposition === 'HOLD') summary.hold_count += 1;
    }

    return NextResponse.json({
      lots,
      summary,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount || lots.length,
        total_pages: Math.ceil((totalCount || lots.length) / pageSize),
      },
    });
  } catch (error) {
    console.error('OQC lots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
