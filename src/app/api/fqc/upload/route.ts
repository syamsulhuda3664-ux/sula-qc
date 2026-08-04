import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { parseFQCExcelMultiSheet, parseFQCExcel } from '@/lib/fqc-parser';
import { mapInspectionToDb } from '@/lib/db-schema';
import { generateOQCLot } from '@/lib/oqc-generator';
import { generateIPQCRecords } from '@/lib/ipqc-generator';

const UPLOAD_DIR = '/home/z/my-project/upload';

/** Save file to server filesystem and return the file path */
async function saveUploadedFile(file: File): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = join(UPLOAD_DIR, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

/** Process a single day's records: create upload entry, insert inspections, generate OQC/IPQC */
async function processSingleDay(
  records: any[],
  dateStr: string,
  sheetName: string,
  businessType: string,
  fileName: string,
  userId: string
) {
  // 1. Create daily upload record
  const { data: upload, error: uploadError } = await adminClient
    .from('fqc_daily_uploads')
    .insert({
      upload_date: dateStr,
      file_name: fileName,
      file_path: '',
      business_type: businessType,
      record_count: records.length,
      status: 'pending',
      uploaded_by: userId,
    })
    .select('id')
    .single();

  if (uploadError) {
    throw new Error(`Upload record error (${sheetName}): ${uploadError.message}`);
  }

  // 2. Insert FQC inspection records
  const inspectionRows = records.map((r) =>
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
    throw new Error(`Insert inspections error (${sheetName}): ${inspError.message}`);
  }

  // 3. OQC lot generation (non-fatal)
  let oqcGenerated = false;
  try {
    const inspectionDate = new Date(dateStr + 'T00:00:00');
    const oqcLot = generateOQCLot(inspectionDate, records);
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

    if (!oqcLotError && data) {
      oqcGenerated = true;
      const oqcOrders = oqcLot.orders.map((o, idx) => ({
        lot_id: data.id,
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

      const oqcDefects = oqcLot.defects.map((d) => ({
        lot_id: data.id,
        defect_category: d.category,
        defect_count: d.count,
        severity: d.severity,
      }));
      if (oqcDefects.length > 0) {
        await adminClient.from('oqc_defects').insert(oqcDefects);
      }
    }
  } catch (oqcErr) {
    console.error(`[FQC Upload] OQC error non-fatal (${sheetName}):`, oqcErr);
  }

  // 4. IPQC records (non-fatal)
  let ipqcCount = 0;
  try {
    const ipqcRecords = generateIPQCRecords(
      insertedInspections.map((insp, idx) => ({
        ...records[idx],
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
    console.error(`[FQC Upload] IPQC error non-fatal (${sheetName}):`, ipqcErr);
  }

  return {
    uploadId: upload.id,
    date: dateStr,
    sheetName,
    recordCount: records.length,
    oqcGenerated,
    ipqcGenerated: ipqcCount,
  };
}

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

    // Save file to server filesystem
    let filePath = '';
    try {
      filePath = await saveUploadedFile(file);
      console.log(`[FQC Upload] File saved to: ${filePath}`);
    } catch (saveErr) {
      console.error('[FQC Upload] File save error (non-fatal):', saveErr);
    }

    // Try multi-sheet parsing first
    let allSheets;
    try {
      allSheets = await parseFQCExcelMultiSheet(buffer);
    } catch (parseError) {
      console.error('[FQC Upload] Multi-sheet parse exception:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse Excel file', detail: String(parseError) },
        { status: 400 }
      );
    }

    // Fallback: if multi-sheet found nothing, try single-sheet
    if (allSheets.length === 0) {
      try {
        const singleResult = await parseFQCExcel(buffer);
        if (singleResult.records.length > 0) {
          allSheets = [{
            sheetName: 'Sheet1',
            date: singleResult.date,
            dateStr: singleResult.date.toISOString().split('T')[0],
            records: singleResult.records,
            businessType: singleResult.businessType,
            debug: singleResult.debug,
          }];
        }
      } catch {
        // ignore fallback error
      }
    }

    if (allSheets.length === 0) {
      return NextResponse.json(
        { error: 'No valid inspection records found in the Excel file' },
        { status: 400 }
      );
    }

    console.log(`[FQC Upload] Parsed ${allSheets.length} sheet(s), total ${allSheets.reduce((s, sh) => s + sh.records.length, 0)} records`);

    // Process each sheet (each day) independently
    const dayResults: any[] = [];
    const errors: string[] = [];

    for (const sheet of allSheets) {
      try {
        const result = await processSingleDay(
          sheet.records,
          sheet.dateStr,
          sheet.sheetName,
          sheet.businessType,
          file.name,
          auth.user!.id,
        );
        dayResults.push(result);
        console.log(`[FQC Upload] Sheet "${sheet.sheetName}" (${sheet.dateStr}): ${result.recordCount} records processed`);
      } catch (dayErr) {
        const msg = `Sheet "${sheet.sheetName}" (${sheet.dateStr}): ${dayErr instanceof Error ? dayErr.message : String(dayErr)}`;
        errors.push(msg);
        console.error(`[FQC Upload] Error processing sheet:`, msg);
      }
    }

    const totalRecords = dayResults.reduce((s, r) => s + r.recordCount, 0);
    const totalOQC = dayResults.filter((r) => r.oqcGenerated).length;
    const totalIPQC = dayResults.reduce((s, r) => s + r.ipqcGenerated, 0);

    // Determine overall business type (most common across all sheets)
    const btCounts: Record<string, number> = {};
    allSheets.forEach((s) => {
      if (s.businessType !== 'OTHER') {
        btCounts[s.businessType] = (btCounts[s.businessType] || 0) + 1;
      }
    });
    let overallBT = 'OTHER';
    let maxBT = 0;
    for (const [bt, count] of Object.entries(btCounts)) {
      if (count > maxBT) { maxBT = count; overallBT = bt; }
    }

    const isMultiSheet = allSheets.length > 1;

    return NextResponse.json(
      {
        message: isMultiSheet
          ? `Upload processed: ${allSheets.length} sheets (${totalRecords} records)`
          : 'Upload processed successfully',
        upload: {
          id: dayResults[0]?.uploadId || null,
          file_name: file.name,
          file_path: filePath,
          sheets: isMultiSheet ? dayResults : undefined,
          date: allSheets[0]?.dateStr || '',
          business_type: overallBT,
          inspection_count: totalRecords,
          sheet_count: allSheets.length,
          oqc_generated: totalOQC > 0,
          oqc_days: totalOQC,
          ipqc_generated: totalIPQC,
        },
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: errors.length === allSheets.length ? 500 : 201 }
    );
  } catch (error) {
    console.error('[FQC Upload] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error during file processing', detail: String(error) },
      { status: 500 }
    );
  }
}
