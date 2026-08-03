import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

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
    const value = searchParams.get('value'); // e.g., '2026-07' for month, '2026-07' for quarter, '2026' for year
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
      // Default to current month
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    }

    // Fetch OQC lots for the period
    let query = adminClient
      .from('oqc_daily_lots')
      .select('*')
      .gte('lot_date', startDate)
      .lte('lot_date', endDate);

    if (businessType) {
      query = query.eq('business_type', businessType);
    }

    query = query.order('lot_date', { ascending: true });

    const { data: lots, error } = await query;
    if (error) {
      console.error('OQC rekap error:', error);
      return NextResponse.json({ error: 'Failed to fetch OQC data' }, { status: 500 });
    }

    const allLots = lots || [];

    // Aggregate summary
    const rekap = {
      period,
      value,
      date_range: { start: startDate, end: endDate },
      business_type: businessType || 'ALL',
      total_lots: allLots.length,
      total_lot_size: 0,
      total_sampled: 0,
      total_sample_ok: 0,
      total_defects: 0,
      critical_defects: 0,
      major_defects: 0,
      minor_defects: 0,
      release_lots: 0,
      rework_lots: 0,
      hold_lots: 0,
      release_qty: 0,
      rework_qty: 0,
      hold_qty: 0,
      avg_pass_rate: 0,
      daily_breakdown: [] as unknown[],
    };

    let totalPassRate = 0;
    const dailyMap: Record<string, {
      lot_date: string;
      lot_count: number;
      lot_size: number;
      sample_size: number;
      defects: number;
      pass_rate: number;
      disposition: string;
    }> = {};

    for (const lot of allLots) {
      rekap.total_lot_size += Number(lot.lot_size) || 0;
      rekap.total_sampled += Number(lot.sample_size) || 0;
      rekap.total_sample_ok += Number(lot.sample_ok) || 0;
      rekap.total_defects += Number(lot.total_defects) || 0;
      rekap.critical_defects += Number(lot.critical_defects) || 0;
      rekap.major_defects += Number(lot.major_defects) || 0;
      rekap.minor_defects += Number(lot.minor_defects) || 0;
      rekap.release_qty += Number(lot.release_qty) || 0;
      rekap.rework_qty += Number(lot.rework_qty) || 0;
      rekap.hold_qty += Number(lot.hold_qty) || 0;
      totalPassRate += Number(lot.pass_rate) || 0;

      if (lot.disposition === 'RELEASE') rekap.release_lots += 1;
      if (lot.disposition === 'REWORK') rekap.rework_lots += 1;
      if (lot.disposition === 'HOLD') rekap.hold_lots += 1;

      const date = lot.lot_date;
      if (!dailyMap[date]) {
        dailyMap[date] = { lot_date: date, lot_count: 0, lot_size: 0, sample_size: 0, defects: 0, pass_rate: 0, disposition: '' };
      }
      dailyMap[date].lot_count += 1;
      dailyMap[date].lot_size += Number(lot.lot_size) || 0;
      dailyMap[date].sample_size += Number(lot.sample_size) || 0;
      dailyMap[date].defects += Number(lot.total_defects) || 0;
      dailyMap[date].disposition = lot.disposition;
    }

    // Compute daily pass rates
    for (const day of Object.values(dailyMap)) {
      day.pass_rate = day.sample_size > 0
        ? Math.round(((day.sample_size - day.defects) / day.sample_size) * 10000) / 100
        : 100;
    }

    rekap.daily_breakdown = Object.values(dailyMap).sort((a, b) => a.lot_date.localeCompare(b.lot_date));
    rekap.avg_pass_rate = allLots.length > 0
      ? Math.round((totalPassRate / allLots.length) * 10000) / 100
      : 0;

    // Overall pass rate based on totals
    const overallPassRate = rekap.total_sampled > 0
      ? Math.round((rekap.total_sample_ok / rekap.total_sampled) * 10000) / 100
      : 0;
    rekap.avg_pass_rate = overallPassRate;

    return NextResponse.json(rekap);
  } catch (error) {
    console.error('OQC rekap error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
