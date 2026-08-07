import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { SUBDEFECT_NAMES, SUBDEFECT_NAMES_ZH, getSubDefectCategory } from '@/lib/rca-generator';

// ── Date range helper (mirrors FQC inspections) ──
function getDateRange(period: string) {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'day': {
      // Minimum 7 days for meaningful chart data
      start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      const dow = now.getDay() || 7;
      start = new Date(now); start.setDate(now.getDate() - dow + 1); start.setHours(0, 0, 0, 0);
      end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
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

const DEFECT_CATEGORIES = [
  { key: 'defect_stitching', name: 'Stitching' },
  { key: 'defect_logo', name: 'Logo' },
  { key: 'defect_material', name: 'Material' },
  { key: 'defect_hardware', name: 'Hardware' },
  { key: 'defect_appearance', name: 'Appearance' },
  { key: 'defect_zipper', name: 'Zipper' },
  { key: 'defect_webbing', name: 'Webbing' },
  { key: 'defect_other', name: 'Other' },
  { key: 'defect_preparation', name: 'Preparation' },
];

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';
    const businessType = searchParams.get('business_type');

    const range = getDateRange(period);
    if (!range) return NextResponse.json({ error: 'Invalid period' }, { status: 400 });

    // ── Fetch ALL FQC inspections for the period (no pagination) ──
    let fqcQuery = adminClient
      .from('fqc_inspections')
      .select('*')
      .gte('inspection_date', range.start)
      .lte('inspection_date', range.end)
      .order('inspection_date', { ascending: true });

    if (businessType && businessType !== 'ALL') {
      fqcQuery = fqcQuery.eq('business_type', businessType);
    }

    const { data: fqcRecords, error: fqcError } = await fqcQuery;
    if (fqcError) {
      console.error('Dashboard FQC error:', fqcError);
      return NextResponse.json({ error: 'Failed to fetch FQC data' }, { status: 500 });
    }

    const fqc = fqcRecords || [];

    // ── Fetch ALL OQC lots for the period ──
    let oqcQuery = adminClient
      .from('oqc_daily_lots')
      .select('*')
      .gte('lot_date', range.start)
      .lte('lot_date', range.end)
      .order('lot_date', { ascending: true });

    if (businessType && businessType !== 'ALL') {
      oqcQuery = oqcQuery.eq('business_type', businessType);
    }

    const { data: oqcRecords, error: oqcError } = await oqcQuery;
    if (oqcError) {
      console.error('Dashboard OQC error:', oqcError);
      return NextResponse.json({ error: 'Failed to fetch OQC data' }, { status: 500 });
    }

    const oqc = oqcRecords || [];

    // ═══════════════════════════════════════════════════
    // 1. KPI Totals
    // ═══════════════════════════════════════════════════
    let totalInspected = 0, totalOK = 0, totalNG = 0, totalDefects = 0;
    const fqcDateMap: Record<string, { inspected: number; ok: number; ng: number; defects: number; catDefs: Record<string, number> }> = {};

    for (const r of fqc) {
      const insp = Number(r.inspected_qty) || 0;
      const ok = Number(r.ok_qty) || 0;
      const ng = Number(r.ng_qty) || 0;
      const d = (r.inspection_date as string)?.split('T')[0] || 'Unknown';

      totalInspected += insp;
      totalOK += ok;
      totalNG += ng;

      if (!fqcDateMap[d]) fqcDateMap[d] = { inspected: 0, ok: 0, ng: 0, defects: 0, catDefs: {} };
      fqcDateMap[d].inspected += insp;
      fqcDateMap[d].ok += ok;
      fqcDateMap[d].ng += ng;

      // Per-category defects
      const catDefs = fqcDateMap[d].catDefs;
      for (const cat of DEFECT_CATEGORIES) {
        let val = Number(r[cat.key]) || 0;
        if (cat.key === 'defect_stitching') val += Number(r.defect_stitch_defect) || 0;
        catDefs[cat.name] = (catDefs[cat.name] || 0) + val;
        totalDefects += val;
      }
      fqcDateMap[d].defects = Object.values(catDefs).reduce((s, v) => s + v, 0);
    }

    // OQC totals
    let oqcTotalLots = 0, oqcReleaseLots = 0, oqcReworkLots = 0, oqcHoldLots = 0;
    const oqcDateMap: Record<string, { release: number; rework: number; hold: number; lotSize: number; sampled: number; sampleOk: number; defects: number }> = {};

    for (const lot of oqc) {
      const d = (lot.lot_date as string)?.split('T')[0] || 'Unknown';
      oqcTotalLots++;
      if (lot.disposition === 'RELEASE') oqcReleaseLots++;
      else if (lot.disposition === 'REWORK') oqcReworkLots++;
      else if (lot.disposition === 'HOLD') oqcHoldLots++;

      if (!oqcDateMap[d]) oqcDateMap[d] = { release: 0, rework: 0, hold: 0, lotSize: 0, sampled: 0, sampleOk: 0, defects: 0 };
      oqcDateMap[d].lotSize += Number(lot.lot_size) || 0;
      oqcDateMap[d].sampled += Number(lot.sample_size) || 0;
      oqcDateMap[d].sampleOk += Number(lot.sample_ok) || 0;
      oqcDateMap[d].defects += Number(lot.total_defects) || 0;
      if (lot.disposition === 'RELEASE') oqcDateMap[d].release++;
      else if (lot.disposition === 'REWORK') oqcDateMap[d].rework++;
      else if (lot.disposition === 'HOLD') oqcDateMap[d].hold++;
    }

    // ═══════════════════════════════════════════════════
    // 2. FQC Daily Breakdown (sorted ascending by date)
    // ═══════════════════════════════════════════════════
    const fqcDaily = Object.entries(fqcDateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        inspected: v.inspected,
        ok: v.ok,
        ng: v.ng,
        passRate: v.inspected > 0 ? Math.round((v.ok / v.inspected) * 10000) / 100 : 0,
        defects: v.defects,
      }));

    // ═══════════════════════════════════════════════════
    // 3. OQC Daily Breakdown (sorted ascending by date)
    // ═══════════════════════════════════════════════════
    const oqcDaily = Object.entries(oqcDateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        release: v.release,
        rework: v.rework,
        hold: v.hold,
        totalLots: v.release + v.rework + v.hold,
        lotSize: v.lotSize,
        sampled: v.sampled,
        passRate: v.sampled > 0 ? Math.round((v.sampleOk / v.sampled) * 10000) / 100 : 0,
        defects: v.defects,
      }));

    // ═══════════════════════════════════════════════════
    // 4. Defect Category Summary (for donut)
    // ═══════════════════════════════════════════════════
    const catTotals: Record<string, number> = {};
    for (const cat of DEFECT_CATEGORIES) catTotals[cat.name] = 0;

    for (const r of fqc) {
      for (const cat of DEFECT_CATEGORIES) {
        let val = Number(r[cat.key]) || 0;
        if (cat.key === 'defect_stitching') val += Number(r.defect_stitch_defect) || 0;
        catTotals[cat.name] += val;
      }
    }

    const defectCategories = DEFECT_CATEGORIES
      .map((cat) => ({
        category: cat.name,
        count: catTotals[cat.name],
        percentage: totalDefects > 0 ? Math.round((catTotals[cat.name] / totalDefects) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ═══════════════════════════════════════════════════
    // 5. Defect Category Daily Trend (for stacked area)
    // ═══════════════════════════════════════════════════
    const allDates = [...new Set([...Object.keys(fqcDateMap), ...Object.keys(oqcDateMap)])].sort();
    const defectDailyTrend = allDates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const cat of DEFECT_CATEGORIES) {
        row[cat.name] = fqcDateMap[date]?.catDefs?.[cat.name] || 0;
      }
      return row;
    });

    // ═══════════════════════════════════════════════════
    // 6. Top Sub-Defects (from sub_defects JSON array)
    // ═══════════════════════════════════════════════════
    const subDefectCounts: number[] = new Array(SUBDEFECT_NAMES.length).fill(0);

    for (const r of fqc) {
      if (Array.isArray(r.sub_defects)) {
        for (let i = 0; i < Math.min(r.sub_defects.length, subDefectCounts.length); i++) {
          subDefectCounts[i] += Number(r.sub_defects[i]) || 0;
        }
      }
    }

    const topDefects = subDefectCounts
      .map((count, index) => ({
        name: SUBDEFECT_NAMES[index] || `Sub-${index + 1}`,
        count,
      }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ═══════════════════════════════════════════════════
    // Response
    // ═══════════════════════════════════════════════════
    return NextResponse.json({
      period,
      dateRange: range,
      kpi: {
        totalInspected,
        totalOK,
        totalNG,
        passRate: totalInspected > 0 ? Math.round((totalOK / totalInspected) * 10000) / 100 : 0,
        totalDefects,
        oqcTotalLots,
        oqcReleaseLots,
        oqcReworkLots,
        oqcHoldLots,
      },
      fqcDaily,
      oqcDaily,
      defectCategories,
      defectDailyTrend,
      topDefects,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
