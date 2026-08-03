import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { mapInspectionRow } from '@/lib/db-schema';
import { sortProductionLines, extractLineSortKey } from '@/lib/utils';

function getDateRange(period: string, refDate?: string) {
  const now = refDate ? new Date(refDate) : new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'day': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      const dayOfWeek = now.getDay() || 7;
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'year': {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    }
    default:
      return null;
  }

  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const refDate = searchParams.get('ref_date');
    const businessType = searchParams.get('business_type');
    const productionLine = searchParams.get('production_line');
    const styleCode = searchParams.get('style_code');
    const orderNo = searchParams.get('order_no');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '100', 10), 500);

    let startDate: string | undefined;
    let endDate: string | undefined;

    if (period) {
      const range = getDateRange(period, refDate || undefined);
      if (range) {
        startDate = range.start;
        endDate = range.end;
      }
    }

    if (dateFrom) startDate = dateFrom;
    if (dateTo) endDate = dateTo;

    // Build query
    let query = adminClient
      .from('fqc_inspections')
      .select('*')
      .order('inspection_date', { ascending: false });

    if (startDate) {
      query = query.gte('inspection_date', startDate);
    }
    if (endDate) {
      query = query.lte('inspection_date', endDate);
    }
    if (businessType) {
      query = query.eq('business_type', businessType);
    }
    if (productionLine) {
      query = query.eq('production_line', productionLine);
    }
    if (styleCode) {
      query = query.ilike('style_code', `%${styleCode}%`);
    }
    if (orderNo) {
      query = query.ilike('order_no', `%${orderNo}%`);
    }

    // Get total count with same filters
    let countQuery = adminClient
      .from('fqc_inspections')
      .select('*', { count: 'exact', head: true });

    if (startDate) {
      countQuery = countQuery.gte('inspection_date', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('inspection_date', endDate);
    }
    if (businessType) {
      countQuery = countQuery.eq('business_type', businessType);
    }
    if (productionLine) {
      countQuery = countQuery.eq('production_line', productionLine);
    }
    if (styleCode) {
      countQuery = countQuery.ilike('style_code', `%${styleCode}%`);
    }
    if (orderNo) {
      countQuery = countQuery.ilike('order_no', `%${orderNo}%`);
    }

    const { count: totalCount } = await countQuery;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: records, error } = await query;

    if (error) {
      console.error('FQC inspections error:', error);
      return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 });
    }

    // Map DB rows to app-shaped objects (production_line→line, inspector_name→inspector, style_code→style, sub_*→sub_defects)
    let allRecords = (records || []).map(mapInspectionRow);

    // Sort: by date desc first, then by production line in factory order
    allRecords = allRecords.sort((a, b) => {
      const dateComp = String(b.inspection_date || '').localeCompare(String(a.inspection_date || ''));
      if (dateComp !== 0) return dateComp;
      // Same date: sort by production line
      const keyA = extractLineSortKey(String(a.line || ''));
      const keyB = extractLineSortKey(String(b.line || ''));
      return keyA.localeCompare(keyB);
    });
    const subtotals = {
      total_records: allRecords.length,
      total_order_qty: 0,
      total_inspected_qty: 0,
      total_ok_qty: 0,
      total_ng_qty: 0,
      avg_defect_rate: 0,
      total_defects: 0,
      defect_stitching: 0,
      defect_logo: 0,
      defect_material: 0,
      defect_hardware: 0,
      defect_appearance: 0,
      defect_zipper: 0,
      defect_webbing: 0,
      defect_other: 0,
      defect_preparation: 0,
    };

    for (const r of allRecords) {
      subtotals.total_order_qty += Number(r.order_qty) || 0;
      subtotals.total_inspected_qty += Number(r.inspected_qty) || 0;
      subtotals.total_ok_qty += Number(r.ok_qty) || 0;
      subtotals.total_ng_qty += Number(r.ng_qty) || 0;
      // Compute total_defects from category columns (DB has no total_defects column)
      // Merge defect_stitch_defect into defect_stitching
      const rowTotal = ((Number(r.defect_stitching) || 0) + (Number(r.defect_stitch_defect) || 0))
        + (Number(r.defect_logo) || 0)
        + (Number(r.defect_material) || 0)
        + (Number(r.defect_hardware) || 0)
        + (Number(r.defect_appearance) || 0)
        + (Number(r.defect_zipper) || 0)
        + (Number(r.defect_webbing) || 0)
        + (Number(r.defect_other) || 0)
        + (Number(r.defect_preparation) || 0);
      subtotals.total_defects += rowTotal;
      r.total_defects = rowTotal; // attach for frontend use
      // Merge defect_stitch_defect into defect_stitching for per-row display
      r.defect_stitching = (Number(r.defect_stitching) || 0) + (Number(r.defect_stitch_defect) || 0);
      subtotals.defect_stitching += Number(r.defect_stitching) || 0;
      subtotals.defect_logo += Number(r.defect_logo) || 0;
      subtotals.defect_material += Number(r.defect_material) || 0;
      subtotals.defect_hardware += Number(r.defect_hardware) || 0;
      subtotals.defect_appearance += Number(r.defect_appearance) || 0;
      subtotals.defect_zipper += Number(r.defect_zipper) || 0;
      subtotals.defect_webbing += Number(r.defect_webbing) || 0;
      subtotals.defect_other += Number(r.defect_other) || 0;
      subtotals.defect_preparation += Number(r.defect_preparation) || 0;
    }

    subtotals.avg_defect_rate =
      subtotals.total_inspected_qty > 0
        ? Math.round((subtotals.total_ng_qty / subtotals.total_inspected_qty) * 10000) / 100
        : 0;

    return NextResponse.json({
      records: allRecords as any[],
      subtotals,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount || allRecords.length,
        total_pages: Math.ceil((totalCount || allRecords.length) / pageSize),
      },
    });
  } catch (error) {
    console.error('FQC inspections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
