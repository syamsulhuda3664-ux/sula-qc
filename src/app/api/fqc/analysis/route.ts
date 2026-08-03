import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { SUBDEFECT_NAMES, getSubDefectCategory } from '@/lib/rca-generator';

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
  { key: 'defect_stitch_defect', name: 'Stitch Defect' },
];

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const businessType = searchParams.get('business_type');

    // Build base query
    let query = adminClient
      .from('fqc_inspections')
      .select('*');

    if (dateFrom) query = query.gte('inspection_date', dateFrom);
    if (dateTo) query = query.lte('inspection_date', dateTo);
    if (businessType) query = query.eq('business_type', businessType);

    const { data: records, error } = await query;
    if (error) {
      console.error('FQC analysis error:', error);
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    const allRecords = records || [];

    // Section A: Category Summary
    const categoryTotals: Record<string, number> = {};
    let grandTotalDefects = 0;

    for (const cat of DEFECT_CATEGORIES) {
      categoryTotals[cat.key] = 0;
    }

    for (const r of allRecords) {
      for (const cat of DEFECT_CATEGORIES) {
        const val = Number(r[cat.key]) || 0;
        categoryTotals[cat.key] += val;
        grandTotalDefects += val;
      }
    }

    const categorySummary = DEFECT_CATEGORIES.map((cat) => ({
      category: cat.name,
      categoryKey: cat.key,
      defectCount: categoryTotals[cat.key],
      percentage: grandTotalDefects > 0
        ? Math.round((categoryTotals[cat.key] / grandTotalDefects) * 10000) / 100
        : 0,
    })).sort((a, b) => b.defectCount - a.defectCount);

    // Section B: Top 20 Sub-defects
    const subDefectCounts: number[] = new Array(SUBDEFECT_NAMES.length).fill(0);

    for (const r of allRecords) {
      if (Array.isArray(r.sub_defects)) {
        for (let i = 0; i < Math.min(r.sub_defects.length, subDefectCounts.length); i++) {
          subDefectCounts[i] += Number(r.sub_defects[i]) || 0;
        }
      }
    }

    const subDefectList = subDefectCounts
      .map((count, index) => ({
        index,
        name: SUBDEFECT_NAMES[index] || `Sub-defect ${index + 1}`,
        count,
        ...getSubDefectCategory(index),
        percentage: grandTotalDefects > 0
          ? Math.round((count / grandTotalDefects) * 10000) / 100
          : 0,
      }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Section C: Top 15 by Style
    const styleAgg: Record<string, { defects: number; inspected: number; inspections: number }> = {};

    for (const r of allRecords) {
      const style = r.style || 'Unknown';
      if (!styleAgg[style]) {
        styleAgg[style] = { defects: 0, inspected: 0, inspections: 0 };
      }
      styleAgg[style].defects += Number(r.total_defects) || 0;
      styleAgg[style].inspected += Number(r.inspected_qty) || 0;
      styleAgg[style].inspections += 1;
    }

    const topStyles = Object.entries(styleAgg)
      .map(([style, data]) => ({
        style,
        defectCount: data.defects,
        inspectionCount: data.inspections,
        totalInspected: data.inspected,
        defectRate: data.inspected > 0
          ? Math.round((data.defects / data.inspected) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => b.defectCount - a.defectCount)
      .slice(0, 15);

    return NextResponse.json({
      filters: { date_from: dateFrom, date_to: dateTo, business_type: businessType },
      total_records: allRecords.length,
      grand_total_defects: grandTotalDefects,
      section_a: { category_summary: categorySummary },
      section_b: { top_sub_defects: subDefectList },
      section_c: { top_styles: topStyles },
    });
  } catch (error) {
    console.error('FQC analysis error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
