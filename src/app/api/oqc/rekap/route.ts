import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

const OQC_CATEGORIES = [
  { key: 'Packaging', zh: '包装问题', en: 'Packaging' },
  { key: 'Label', zh: '标签问题', en: 'Label' },
  { key: 'Accessory', zh: '配件问题', en: 'Accessory' },
  { key: 'Appearance', zh: '外观问题', en: 'Appearance' },
  { key: 'Hardware', zh: '五金问题', en: 'Hardware' },
  { key: 'Stitching', zh: '缝制问题', en: 'Stitching' },
  { key: 'Other', zh: '其它问题', en: 'Other' },
] as const;

const TYPICAL_DEFECTS: Record<string, { zh: string; en: string }> = {
  Packaging: {
    zh: '纸箱压扁 Carton crushed corner；封箱不牢 Carton seal weak；胶带起翘 Tape lifting',
    en: 'Carton crushed corner; Carton seal weak; Tape lifting; Missing polybag; Polybag torn; Incorrect packing method',
  },
  Label: {
    zh: 'SKU标贴错位 SKU label misaligned；条码无法扫描 Barcode unreadable；洗水标反向 Wash label reversed',
    en: 'Wrong care label; Missing brand label; Label misaligned; Faded print; Wrong barcode',
  },
  Accessory: {
    zh: '吊卡遗漏 Hangtag missing；防尘袋短缺 Dust bag short；说明书缺失 Manual missing',
    en: 'Missing accessory; Wrong accessory; Loose accessory; Defective accessory; Missing hangtag',
  },
  Appearance: {
    zh: '表面灰尘 Surface dust；线头外露 Thread exposed；轻微刮伤 Minor scratch',
    en: 'Scratch; Stain; Color deviation; Wrinkle; Deformation; Uneven stitching',
  },
  Hardware: {
    zh: '拉链涩 Zipper sticky；五金氧化 Hardware oxidation；铆钉松 Rivet loose',
    en: 'Zipper stuck; Zipper missing pull; Buckle defective; Rivet loose; Wheel defect',
  },
  Stitching: {
    zh: '跳针 Skip stitch；浮线 Loose thread；未回针 Missing backtack',
    en: 'Skip stitch; Thread loose; Open seam; Uneven stitch; Wrong thread color',
  },
  Other: {
    zh: '内包装错配 Wrong inner pack；多余杂物 Foreign object；气味重 Heavy odor',
    en: 'Dimension out of spec; Weight out of spec; Smell/odor; Other defect',
  },
};

function getPeriodRange(period: string, value: string) {
  const [yearStr, monthStr] = value.split('-').map(Number);
  const year = yearStr || new Date().getFullYear();
  const month = monthStr || new Date().getMonth() + 1;

  let startDate: string;
  let endDate: string;

  switch (period) {
    case 'month': {
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      break;
    }
    case 'quarter': {
      const quarter = Math.ceil(month / 3);
      const qStartMonth = (quarter - 1) * 3 + 1;
      const qEndMonth = quarter * 3;
      startDate = `${year}-${String(qStartMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(year, qEndMonth, 0).getDate();
      endDate = `${year}-${String(qEndMonth).padStart(2, '0')}-${lastDay}`;
      break;
    }
    case 'year': {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
      break;
    }
    default:
      return null;
  }

  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const value = searchParams.get('value');
    const businessType = searchParams.get('business_type');

    let startDate: string | undefined;
    let endDate: string | undefined;

    if (value) {
      const range = getPeriodRange(period, value);
      if (range) {
        startDate = range.startDate;
        endDate = range.endDate;
      }
    }

    if (!startDate || !endDate) {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    }

    // ── Fetch OQC lots ──
    let query = adminClient
      .from('oqc_daily_lots')
      .select('*')
      .gte('lot_date', startDate)
      .lte('lot_date', endDate);

    if (businessType && businessType !== 'ALL') {
      query = query.eq('business_type', businessType);
    }
    query = query.order('lot_date', { ascending: true });

    const { data: lots, error } = await query;
    if (error) {
      console.error('OQC rekap error:', error);
      return NextResponse.json({ error: 'Failed to fetch OQC data' }, { status: 500 });
    }

    const allLots = lots || [];
    const lotIds = allLots.map((l: any) => l.id);

    // ── Fetch OQC defects for these lots ──
    let defectQuery = adminClient
      .from('oqc_defects')
      .select('*')
      .in('lot_id', lotIds);

    const { data: defectRows } = await defectQuery;
    const allDefects = defectRows || [];

    // ── Aggregate summary ──
    let totalLotSize = 0, totalSampled = 0, totalSampleOk = 0, totalDefects = 0;
    let criticalDefects = 0, majorDefects = 0, minorDefects = 0;
    let releaseLots = 0, reworkLots = 0, holdLots = 0;
    let releaseQty = 0, reworkQty = 0, holdQty = 0;

    // Daily breakdown (per-lot detail like the Excel)
    const dailyBreakdown: Record<string, {
      lot_date: string;
      lot_count: number;
      lot_size: number;
      sample_size: number;
      sample_ok: number;
      ac: number;
      re_val: number;
      critical: number;
      major: number;
      minor: number;
      defects: number;
      pass_rate: number;
      release_qty: number;
      rework_qty: number;
      hold_qty: number;
      disposition: string;
      remarks: string;
    }> = {};

    for (const lot of allLots) {
      const ls = Number(lot.lot_size) || 0;
      const ss = Number(lot.sample_size) || 0;
      const so = Number(lot.sample_ok) || 0;
      const td = Number(lot.total_defects) || 0;

      totalLotSize += ls;
      totalSampled += ss;
      totalSampleOk += so;
      totalDefects += td;
      criticalDefects += Number(lot.critical_defects) || 0;
      majorDefects += Number(lot.major_defects) || 0;
      minorDefects += Number(lot.minor_defects) || 0;
      releaseQty += Number(lot.release_qty) || 0;
      reworkQty += Number(lot.rework_qty) || 0;
      holdQty += Number(lot.hold_qty) || 0;

      const disp = lot.disposition || '';
      if (disp === 'RELEASE') releaseLots++;
      else if (disp === 'REWORK') reworkLots++;
      else if (disp === 'HOLD') holdLots++;

      const date = (lot.lot_date as string)?.split('T')[0] || '';
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          lot_date: date, lot_count: 0, lot_size: 0, sample_size: 0, sample_ok: 0,
          ac: Number(lot.ac) || 0, re_val: Number(lot.re) || 0,
          critical: 0, major: 0, minor: 0, defects: 0, pass_rate: 100,
          release_qty: 0, rework_qty: 0, hold_qty: 0, disposition: '', remarks: '',
        };
      }
      const d = dailyBreakdown[date];
      d.lot_count += 1;
      d.lot_size += ls;
      d.sample_size += ss;
      d.sample_ok += so;
      d.critical += Number(lot.critical_defects) || 0;
      d.major += Number(lot.major_defects) || 0;
      d.minor += Number(lot.minor_defects) || 0;
      d.defects += td;
      d.release_qty += Number(lot.release_qty) || 0;
      d.rework_qty += Number(lot.rework_qty) || 0;
      d.hold_qty += Number(lot.hold_qty) || 0;
      if (disp) d.disposition = disp;
      if (lot.remarks) d.remarks = lot.remarks;
    }

    // Compute daily pass rates
    for (const day of Object.values(dailyBreakdown)) {
      day.pass_rate = day.sample_size > 0
        ? Math.round(((day.sample_size - day.defects) / day.sample_size) * 10000) / 100
        : 100;
    }

    const overallPassRate = totalSampled > 0
      ? Math.round((totalSampleOk / totalSampled) * 10000) / 100
      : 0;

    // ── Defect category summary (from oqc_defects table) ──
    const categoryMap: Record<string, { count: number; critical: number; major: number; minor: number }> = {};
    for (const cat of OQC_CATEGORIES) {
      categoryMap[cat.key] = { count: 0, critical: 0, major: 0, minor: 0 };
    }

    // Build lot-date lookup for monthly breakdown
    const lotDateMap: Record<string, string> = {};
    for (const lot of allLots) {
      lotDateMap[lot.id] = (lot.lot_date as string)?.split('T')[0] || '';
    }

    // Monthly sub-breakdown for defect categories (for quarter view)
    const monthCategoryMap: Record<string, Record<string, number>> = {};

    for (const def of allDefects) {
      const cat = def.defect_category as string;
      const cnt = Number(def.defect_count) || 0;
      const sev = def.severity as string;

      if (!categoryMap[cat]) categoryMap[cat] = { count: 0, critical: 0, major: 0, minor: 0 };
      categoryMap[cat].count += cnt;
      if (sev === 'Critical') categoryMap[cat].critical += cnt;
      else if (sev === 'Major') categoryMap[cat].major += cnt;
      else categoryMap[cat].minor += cnt;

      // Monthly sub-breakdown
      const lotDate = lotDateMap[def.lot_id] || '';
      if (lotDate) {
        const month = lotDate.substring(0, 7); // "2026-04"
        if (!monthCategoryMap[month]) monthCategoryMap[month] = {};
        monthCategoryMap[month][cat] = (monthCategoryMap[month][cat] || 0) + cnt;
      }
    }

    const defectCategories = OQC_CATEGORIES
      .map((cat) => ({
        category: cat.key,
        count: categoryMap[cat.key]?.count || 0,
        percentage: totalDefects > 0 ? Math.round(((categoryMap[cat.key]?.count || 0) / totalDefects) * 10000) / 100 : 0,
        critical: categoryMap[cat.key]?.critical || 0,
        major: categoryMap[cat.key]?.major || 0,
        minor: categoryMap[cat.key]?.minor || 0,
        typical_defects: TYPICAL_DEFECTS[cat.key] || { zh: '', en: '' },
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    // Monthly breakdown for the defect categories (for quarter/year views)
    const months = Object.keys(monthCategoryMap).sort();
    const categoryMonthlyData: { month: string; categories: Record<string, number> }[] =
      months.map((month) => ({
        month,
        categories: { ...monthCategoryMap[month] },
      }));

    return NextResponse.json({
      period,
      value,
      date_range: { start: startDate, end: endDate },
      business_type: businessType || 'ALL',
      summary: {
        total_lots: allLots.length,
        total_lot_size: totalLotSize,
        total_sampled: totalSampled,
        total_sample_ok: totalSampleOk,
        total_defects: totalDefects,
        critical_defects: criticalDefects,
        major_defects: majorDefects,
        minor_defects: minorDefects,
        pass_rate: overallPassRate,
        release_lots: releaseLots,
        rework_lots: reworkLots,
        hold_lots: holdLots,
        release_qty: releaseQty,
        rework_qty: reworkQty,
        hold_qty: holdQty,
      },
      daily_breakdown: Object.values(dailyBreakdown).sort((a, b) => a.lot_date.localeCompare(b.lot_date)),
      defect_categories: defectCategories,
      category_monthly_data: categoryMonthlyData,
    });
  } catch (error) {
    console.error('OQC rekap error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
