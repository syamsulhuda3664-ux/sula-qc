import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { extractLineSortKey } from '@/lib/utils';
import { generateIPQCFromFQC } from '@/lib/ipqc-generator';
import { mapInspectionRow } from '@/lib/db-schema';

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

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;
  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Only staff_qa can generate IPQC' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, date_from, date_to, business_type: bt } = body;

    if (action !== 'generate') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (!date_from || !date_to) {
      return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 });
    }

    // 1. Fetch FQC records for the date range
    let fqcQuery = adminClient
      .from('fqc_inspections')
      .select('*')
      .gte('inspection_date', date_from)
      .lte('inspection_date', date_to);

    if (bt && bt !== 'ALL') {
      fqcQuery = fqcQuery.eq('business_type', bt);
    }

    const { data: fqcRows, error: fqcError } = await fqcQuery;
    if (fqcError) {
      console.error('FQC fetch error:', fqcError);
      return NextResponse.json({ error: 'Failed to fetch FQC data' }, { status: 500 });
    }

    if (!fqcRows || fqcRows.length === 0) {
      return NextResponse.json({ error: 'No FQC data found for the selected period' }, { status: 400 });
    }

    // 2. Map DB rows to app-level names (line, inspector, style)
    const mappedFQC = fqcRows.map(r => mapInspectionRow(r as Record<string, unknown>));

    // 3. Generate IPQC records
    const generated = generateIPQCFromFQC(mappedFQC as Record<string, unknown>[]);

    // 4. Check existing IPQC records to skip duplicates
    const existing = await adminClient
      .from('ipqc_records')
      .select('inspection_date, business_type, stage, production_line, style_code')
      .gte('inspection_date', date_from)
      .lte('inspection_date', date_to);
    const existingSet = new Set<string>();
    for (const e of (existing.data || [])) {
      existingSet.add(`${e.inspection_date}__${e.business_type}__${e.stage}__${e.production_line}__${e.style_code}`);
    }

    // 5. Filter out duplicates, keep only new records
    const newRecords = generated.filter(r => {
      const key = `${r.inspection_date}__${r.business_type}__${r.stage}__${r.production_line}__${r.style_code}`;
      return !existingSet.has(key);
    });

    // 6. Insert new records in batches of 100
    let inserted = 0;
    for (let i = 0; i < newRecords.length; i += 100) {
      const batch = newRecords.slice(i, i + 100);
      const { error: insertError } = await adminClient
        .from('ipqc_records')
        .insert(batch);
      if (insertError) {
        console.error('IPQC insert error:', insertError);
        return NextResponse.json({
          error: `Insert failed at batch ${Math.floor(i / 100) + 1}: ${insertError.message}`,
          inserted,
          total: generated.length,
        }, { status: 500 });
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      message: `Generated ${generated.length} IPQC records (${inserted} new, ${generated.length - inserted} existing)`,
      generated: generated.length,
      inserted,
      skipped: generated.length - inserted,
    });
  } catch (error) {
    console.error('IPQC generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
