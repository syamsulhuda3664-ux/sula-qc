import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { parseFQCExcelMultiSheet, type ParsedSheet } from '@/lib/fqc-parser';
import { mapInspectionToDb } from '@/lib/db-schema';
import { generateOQCLot, type OQCLot } from '@/lib/oqc-generator';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Only staff_qa can upload FQC reports' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json({ error: 'Only .xlsx/.xls files are supported' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const sheets = await parseFQCExcelMultiSheet(buffer);

    if (sheets.length === 0) {
      return NextResponse.json({ error: 'No valid FQC data found in the file', debug: null }, { status: 400 });
    }

    const errors: string[] = [];
    const sheetResults: { date: string; sheetName: string; recordCount: number; oqcGenerated: boolean }[] = [];
    let totalInspectionCount = 0;

    for (const parsed of sheets) {
      const dateStr = parsed.dateStr;
      const bt = parsed.businessType;

      if (parsed.records.length === 0) {
        errors.push(`Sheet "${parsed.sheetName}": no valid records`);
        sheetResults.push({ date: dateStr, sheetName: parsed.sheetName, recordCount: 0, oqcGenerated: false });
        continue;
      }

      // ── Upsert FQC inspections ──
      // First delete existing records for this date + business_type to avoid duplicates
      await adminClient
        .from('fqc_inspections')
        .delete()
        .eq('inspection_date', dateStr)
        .eq('business_type', bt);

      const dbRows = parsed.records.map(r => {
        const row = mapInspectionToDb({
          ...r,
          inspection_date: dateStr,
          business_type: r.business_type,
        });
        return row;
      });

      const { error: insertError } = await adminClient
        .from('fqc_inspections')
        .insert(dbRows);

      if (insertError) {
        console.error(`Insert error for ${dateStr}:`, insertError);
        errors.push(`Sheet "${parsed.sheetName}" (${dateStr}): DB insert failed - ${insertError.message}`);
        sheetResults.push({ date: dateStr, sheetName: parsed.sheetName, recordCount: 0, oqcGenerated: false });
        continue;
      }

      totalInspectionCount += parsed.records.length;

      // ── Generate OQC lot for this date ──
      let oqcGenerated = false;
      try {
        const oqcLot = generateOQCLot(parsed.date, parsed.records.map(r => ({
          ...r,
          ok_qty: r.ok_qty,
          ng_qty: r.ng_qty,
          defect_stitching: r.defect_stitching,
          defect_stitch_defect: r.defect_stitch_defect,
          defect_logo: r.defect_logo,
          defect_material: r.defect_material,
          defect_hardware: r.defect_hardware,
          defect_appearance: r.defect_appearance,
          defect_zipper: r.defect_zipper,
          defect_webbing: r.defect_webbing,
          defect_other: r.defect_other,
          defect_preparation: r.defect_preparation,
        })));

        // Check hold-per-quarter constraint
        if (oqcLot.disposition === 'HOLD') {
          const quarter = Math.ceil((parsed.date.getMonth() + 1) / 3);
          const year = parsed.date.getFullYear();
          const qStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
          const qEnd = `${year}-${String(quarter * 3).padStart(2, '0')}-31`;

          const { count: existingHoldCount } = await adminClient
            .from('oqc_daily_lots')
            .select('*', { count: 'exact', head: true })
            .eq('disposition', 'HOLD')
            .eq('business_type', oqcLot.businessType)
            .gte('lot_date', qStart)
            .lte('lot_date', qEnd);

          if ((existingHoldCount || 0) > 0) {
            // Downgrade HOLD to REWORK (only 1 HOLD per quarter per BT)
            oqcLot.disposition = 'REWORK';
            oqcLot.reworkQty = oqcLot.lotSize;
            oqcLot.holdQty = 0;
            oqcLot.remarks = oqcLot.remarks.replace('HOLD:', 'DOWNGRADED from HOLD to REWORK (quarterly limit reached):');
          }
        }

        // Delete existing OQC lot for this date + BT
        await adminClient
          .from('oqc_daily_lots')
          .delete()
          .eq('lot_date', dateStr)
          .eq('business_type', bt);

        // Insert OQC lot
        const { error: oqcInsertError } = await adminClient
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
          });

        if (!oqcInsertError) {
          oqcGenerated = true;
        } else {
          console.error(`OQC insert error for ${dateStr}:`, oqcInsertError);
        }
      } catch (oqcErr) {
        console.error(`OQC generation error for ${dateStr}:`, oqcErr);
      }

      sheetResults.push({
        date: dateStr,
        sheetName: parsed.sheetName,
        recordCount: parsed.records.length,
        oqcGenerated,
      });
    }

    // Save upload record
    const uploadDate = new Date().toISOString().split('T')[0];
    await adminClient
      .from('fqc_daily_uploads')
      .insert({
        upload_date: uploadDate,
        file_name: file.name,
        sheet_count: sheets.length,
        inspection_count: totalInspectionCount,
        uploaded_by: auth.user!.id,
      });

    return NextResponse.json({
      upload: {
        file_name: file.name,
        sheet_count: sheets.length,
        inspection_count: totalInspectionCount,
        sheets: sheetResults,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('FQC upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
