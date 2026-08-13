import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { parseFQCExcelMultiSheet, type ParsedSheet } from '@/lib/fqc-parser';
import { mapInspectionToDb, mapInspectionRow } from '@/lib/db-schema';
import { generateOQCLot, type OQCLot } from '@/lib/oqc-generator';
import { generateIPQCFromFQC } from '@/lib/ipqc-generator';

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
    const sheetResults: { date: string; sheetName: string; recordCount: number; oqcGenerated: boolean; ipqcGenerated: number }[] = [];
    let totalInspectionCount = 0;

    for (const parsed of sheets) {
      const dateStr = parsed.dateStr;

      if (parsed.records.length === 0) {
        errors.push(`Sheet "${parsed.sheetName}": no valid records`);
        sheetResults.push({ date: dateStr, sheetName: parsed.sheetName, recordCount: 0, oqcGenerated: false, ipqcGenerated: 0 });
        continue;
      }

      // ── Upsert FQC inspections ──
      // Delete existing FQC records for this date (all business types from this sheet)
      const sheetBts = [...new Set(parsed.records.map(r => r.business_type))];
      for (const sheetBt of sheetBts) {
        await adminClient
          .from('fqc_inspections')
          .delete()
          .eq('inspection_date', dateStr)
          .eq('business_type', sheetBt);
      }

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
        sheetResults.push({ date: dateStr, sheetName: parsed.sheetName, recordCount: 0, oqcGenerated: false, ipqcGenerated: 0 });
        continue;
      }

      totalInspectionCount += parsed.records.length;

      // ── Auto-generate IPQC from the newly inserted FQC data ──
      let ipqcInserted = 0;
      try {
        // Fetch the freshly inserted FQC rows from DB (with correct DB column names)
        const { data: freshFQC } = await adminClient
          .from('fqc_inspections')
          .select('*')
          .eq('inspection_date', dateStr);

        if (freshFQC && freshFQC.length > 0) {
          // Map DB rows to app-level field names for the generator
          const mappedFQC = freshFQC.map(r => mapInspectionRow(r as Record<string, unknown>));
          const generated = generateIPQCFromFQC(mappedFQC as Record<string, unknown>[]);

          // Delete existing IPQC for this date (since FQC was re-uploaded)
          for (const sheetBt of sheetBts) {
            await adminClient
              .from('ipqc_records')
              .delete()
              .eq('inspection_date', dateStr)
              .eq('business_type', sheetBt);
          }

          // Insert new IPQC records in batches of 100
          for (let i = 0; i < generated.length; i += 100) {
            const batch = generated.slice(i, i + 100);
            const { error: ipqcErr } = await adminClient
              .from('ipqc_records')
              .insert(batch);
            if (ipqcErr) {
              console.error(`IPQC auto-generate error for ${dateStr}:`, ipqcErr);
              errors.push(`IPQC auto-generate failed for ${dateStr}: ${ipqcErr.message}`);
            } else {
              ipqcInserted += batch.length;
            }
          }
        }
      } catch (ipqcGenErr) {
        console.error(`IPQC generation error for ${dateStr}:`, ipqcGenErr);
        errors.push(`IPQC generation error for ${dateStr}: ${ipqcGenErr instanceof Error ? ipqcGenErr.message : String(ipqcGenErr)}`);
      }

      // ── Group FQC records by business_type ──
      const groupedByBt: Record<string, typeof parsed.records> = {};
      for (const r of parsed.records) {
        const bt = r.business_type || 'OTHER';
        if (!groupedByBt[bt]) groupedByBt[bt] = [];
        groupedByBt[bt].push(r);
      }

      // ── Generate OQC lot PER business type ──
      let oqcLotsCount = 0;

      for (const [bt, btRecords] of Object.entries(groupedByBt)) {
        try {
          const oqcLot = generateOQCLot(parsed.date, btRecords.map(r => ({
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
              .eq('business_type', bt)
              .gte('lot_date', qStart)
              .lte('lot_date', qEnd);

            if ((existingHoldCount || 0) > 0) {
              oqcLot.disposition = 'REWORK';
              oqcLot.reworkQty = oqcLot.lotSize;
              oqcLot.holdQty = 0;
              oqcLot.remarks = oqcLot.remarks.replace('HOLD:', 'DOWNGRADED from HOLD to REWORK (quarterly limit reached):');
            }
          }

          // Delete existing OQC lot + its orders for this date + BT
          const { data: existingLot } = await adminClient
            .from('oqc_daily_lots')
            .select('id')
            .eq('lot_date', dateStr)
            .eq('business_type', bt);

          if (existingLot && existingLot.length > 0) {
            // Delete lot_orders and defects first (cascade should handle, but be safe)
            for (const lot of existingLot) {
              await adminClient.from('oqc_lot_orders').delete().eq('lot_id', lot.id);
              await adminClient.from('oqc_defects').delete().eq('lot_id', lot.id);
            }
            await adminClient
              .from('oqc_daily_lots')
              .delete()
              .eq('lot_date', dateStr)
              .eq('business_type', bt);
          }

          // Insert OQC lot
          const { data: newLot, error: oqcInsertError } = await adminClient
            .from('oqc_daily_lots')
            .insert({
              lot_date: dateStr,
              business_type: bt,
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

          if (oqcInsertError) {
            console.error(`OQC insert error for ${dateStr} [${bt}]:`, oqcInsertError);
            errors.push(`OQC insert failed for ${dateStr} [${bt}]: ${oqcInsertError.message}`);
            continue;
          }

          // ── Save OQC lot orders ──
          if (newLot && oqcLot.orders.length > 0) {
            const lotOrderRows = oqcLot.orders.map(order => ({
              lot_id: newLot.id,
              order_no: order.orderNo,
              style_code: order.style,
              order_qty: order.orderQty,
              fqc_ok_qty: order.okQty,
              disposition: oqcLot.disposition,
            }));

            const { error: orderInsertError } = await adminClient
              .from('oqc_lot_orders')
              .insert(lotOrderRows);

            if (orderInsertError) {
              console.error(`OQC lot orders insert error for ${dateStr} [${bt}]:`, orderInsertError);
              // Non-fatal — lot is still saved
            }
          }

          // ── Save OQC defects ──
          if (newLot && oqcLot.defects.length > 0) {
            const defectRows = oqcLot.defects.map(defect => ({
              lot_id: newLot.id,
              defect_category: defect.category,
              defect_count: defect.count,
              severity: defect.severity,
            }));

            const { error: defectInsertError } = await adminClient
              .from('oqc_defects')
              .insert(defectRows);

            if (defectInsertError) {
              console.error(`OQC defects insert error for ${dateStr} [${bt}]:`, defectInsertError);
              // Non-fatal — lot is still saved
            }
          }

          oqcLotsCount++;
        } catch (oqcErr) {
          console.error(`OQC generation error for ${dateStr} [${bt}]:`, oqcErr);
          errors.push(`OQC generation error for ${dateStr} [${bt}]: ${oqcErr instanceof Error ? oqcErr.message : String(oqcErr)}`);
        }
      }

      sheetResults.push({
        date: dateStr,
        sheetName: parsed.sheetName,
        recordCount: parsed.records.length,
        oqcGenerated: oqcLotsCount > 0,
        ipqcGenerated: ipqcInserted,
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
