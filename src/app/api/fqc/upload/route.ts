import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { parseFQCExcel } from '@/lib/fqc-parser';
import { mapInspectionToDb } from '@/lib/db-schema';
import { generateOQCLot } from '@/lib/oqc-generator';
import { generateIPQCRecords } from '@/lib/ipqc-generator';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Only Excel files (.xlsx, .xls) are accepted' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    console.log(`[FQC Upload] File: ${file.name}, Size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);

    let parsed;
    try {
      parsed = await parseFQCExcel(buffer);
    } catch (parseError) {
      console.error('[FQC Upload] Parse exception:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse Excel file', detail: String(parseError) },
        { status: 400 }
      );
    }

    console.log(`[FQC Upload] Parsed: ${parsed.records.length} records, businessType=${parsed.businessType}`);

    if (parsed.records.length === 0) {
      return NextResponse.json(
        { error: 'No valid inspection records found in the Excel file', debug: parsed.debug },
        { status: 400 }
      );
    }

    const inspectionDate = parsed.date;
    const dateStr = inspectionDate.toISOString().split('T')[0];

    // 1. Create daily upload record
    // DB columns: file_name (NOT filename), file_path, status
    const { data: upload, error: uploadError } = await adminClient
      .from('fqc_daily_uploads')
      .insert({
        upload_date: dateStr,
        file_name: file.name,
        file_path: '',
        business_type: parsed.businessType,
        record_count: parsed.records.length,
        status: 'completed',
        uploaded_by: auth.user!.id,
      })
      .select('id')
      .single();

    if (uploadError) {
      console.error('[FQC Upload] Create upload record error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to create upload record', detail: uploadError.message },
        { status: 500 }
      );
    }

    // 2. Insert FQC inspection records with correct DB column names
    // DB uses: production_line (not line), inspector_name (not inspector),
    //         style_code (not style), sub_* columns (not sub_defects array)
    const inspectionRows = parsed.records.map((r) =>
      mapInspectionToDb({
        upload_id: upload.id,
        inspection_date: dateStr,
        line: r.line,
        inspector: r.inspector,
        style: r.style,
        order_no: r.order_no,
        remark: r.remark,
        order_qty: r.order_qty,
        inspected_qty: r.inspected_qty,
        ok_qty: r.ok_qty,
        ng_qty: r.ng_qty,
        defect_rate: r.defect_rate,
        business_type: r.business_type,
        defect_stitching: r.defect_stitching,
        defect_logo: r.defect_logo,
        defect_material: r.defect_material,
        defect_hardware: r.defect_hardware,
        defect_appearance: r.defect_appearance,
        defect_zipper: r.defect_zipper,
        defect_webbing: r.defect_webbing,
        defect_other: r.defect_other,
        defect_preparation: r.defect_preparation,
        defect_stitch_defect: r.defect_stitch_defect,
        total_defects: r.total_defects,
        sub_defects: r.sub_defects,
      })
    );

    const { data: insertedInspections, error: inspError } = await adminClient
      .from('fqc_inspections')
      .insert(inspectionRows)
      .select('id, inspection_date, production_line, style_code, order_no');

    if (inspError) {
      console.error('[FQC Upload] Insert inspections error:', inspError);
      return NextResponse.json(
        { error: 'Failed to insert inspection records', detail: inspError.message },
        { status: 500 }
      );
    }

    // 3. OQC lot generation (non-fatal)
    let oqcDailyLot: { id: string } | null = null;
    let oqcCount = 0;
    try {
      const oqcLot = generateOQCLot(inspectionDate, parsed.records);
      const { data, error: oqcLotError } = await adminClient
        .from('oqc_daily_lots')
        .insert({
          lot_date: dateStr,
          business_type: oqcLot.businessType,
          total_orders: oqcLot.totalOrders,
          lot_size: oqcLot.lotSize,
          aql_code: oqcLot.aqlCode,
          sample_size: oqcLot.sampleSize,
          ac: oqcLot.ac,
          re: oqcLot.re,
          critical_defects: oqcLot.criticalDefects,
          major_defects: oqcLot.majorDefects,
          minor_defects: oqcLot.minorDefects,
          total_defects: oqcLot.totalDefects,
          sample_ok: oqcLot.sampleOk,
          pass_rate: oqcLot.passRate,
          disposition: oqcLot.disposition,
          release_qty: oqcLot.releaseQty,
          rework_qty: oqcLot.reworkQty,
          hold_qty: oqcLot.holdQty,
          remarks: oqcLot.remarks,
        })
        .select('id')
        .single();

      if (oqcLotError) {
        console.error('[FQC Upload] OQC lot error:', oqcLotError);
      } else if (data) {
        oqcDailyLot = data;
        oqcCount = 1;

        // 4. OQC lot orders (DB: style_code, production_line, inspector_name, fqc_ok_qty, oqc_sample)
        const oqcOrders = oqcLot.orders.map((o, idx) => ({
          lot_id: oqcDailyLot!.id,
          inspection_id: insertedInspections[idx]?.id || null,
          style_code: o.style,
          order_no: o.orderNo,
          production_line: '',
          inspector_name: '',
          order_qty: o.orderQty,
          fqc_ok_qty: o.okQty,
          oqc_sample: 0,
          disposition: '',
          remarks: '',
        }));
        await adminClient.from('oqc_lot_orders').insert(oqcOrders);

        // 5. OQC defects (DB: defect_category, defect_count — NO sub_defect column)
        const oqcDefects = oqcLot.defects.map((d) => ({
          lot_id: oqcDailyLot!.id,
          defect_category: d.category,
          defect_count: d.count,
          severity: d.severity,
        }));
        if (oqcDefects.length > 0) {
          await adminClient.from('oqc_defects').insert(oqcDefects);
        }
      }
    } catch (oqcErr) {
      console.error('[FQC Upload] OQC error (non-fatal):', oqcErr);
    }

    // 6. IPQC records (DB: production_line, style_code, check_count, ok_count, ng_count)
    let ipqcCount = 0;
    try {
      const ipqcRecords = generateIPQCRecords(
        insertedInspections.map((insp, idx) => ({
          ...parsed.records[idx],
          id: insp.id,
        }))
      );

      ipqcCount = ipqcRecords.length;
      if (ipqcRecords.length > 0) {
        const ipqcRows = ipqcRecords.map((r) => ({
          inspection_date: r.inspection_date instanceof Date ? r.inspection_date.toISOString().split('T')[0] : String(r.inspection_date),
          business_type: r.business_type,
          production_line: r.line,
          style_code: r.style,
          order_no: r.order_no,
          stage: r.stage,
          check_count: r.checked_qty,
          ok_count: r.pass_qty,
          ng_count: r.fail_qty,
          pass_rate: r.pass_rate,
          defect_category: '',
          defect_detail: JSON.stringify(r.defects || []),
        }));
        await adminClient.from('ipqc_records').insert(ipqcRows);
      }
    } catch (ipqcErr) {
      console.error('[FQC Upload] IPQC error (non-fatal):', ipqcErr);
    }

    return NextResponse.json(
      {
        message: 'Upload processed successfully',
        upload: {
          id: upload.id,
          date: dateStr,
          business_type: parsed.businessType,
          inspection_count: parsed.records.length,
          oqc_generated: oqcCount > 0,
          ipqc_generated: ipqcCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[FQC Upload] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error during file processing', detail: String(error) },
      { status: 500 }
    );
  }
}
