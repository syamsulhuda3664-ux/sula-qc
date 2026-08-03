export interface RCACategory {
  category: string;
  categoryKey: string;
  defectCount: number;
  percentage: number;
  rank: number;
}

export interface RCASubDefect {
  subDefect: string;
  category: string;
  categoryKey: string;
  defectCount: number;
  percentage: number;
}

export interface RCAStyle {
  style: string;
  defectCount: number;
  inspectionCount: number;
  defectRate: number;
  rank: number;
}

export interface RCAWeekly {
  weekStart: Date;
  weekEnd: Date;
  totalInspections: number;
  totalInspected: number;
  totalOK: number;
  totalNG: number;
  overallPassRate: number;
  topCategories: RCACategory[];
  subDefects: RCASubDefect[];
  topStyles: RCAStyle[];
}

/**
 * FQC defect category keys and their display names
 */
const DEFECT_CATEGORIES: { key: string; name: string }[] = [
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

/**
 * Sub-defect name definitions per category (index matches sub_defects array position)
 * These correspond to the 64 sub-defect columns in the FQC Excel format
 */
const SUBDEFECT_NAMES: string[] = [
  // Stitching (columns L-Z, indices 0-14)
  'Float thread / Discount / Skip stitch',
  'Missing false thread / Loose thread',
  'Missed stitching',
  'Pinhole',
  'Missing bartack',
  'Presser foot mark',
  'Backtack incomplete',
  'Wrong panel assembly',
  'Unfolded edge',
  'Velcro reversed',
  'Uneven edge',
  'Triangle piece uneven',
  'Thread color bleeding',
  'Thread tail',
  'Foam insertion incomplete',
  // Logo (columns AA-AD, indices 15-18)
  'Skewed',
  'Logo inverted',
  'Logo defective',
  'Logo detached',
  // Material (columns AE-AI, indices 19-23)
  'Color deviation',
  'Yarn pull',
  'Wrinkle',
  'Damage / Tear',
  'Open seam',
  // Hardware (columns AJ-AL, indices 24-26)
  'Scratch',
  'Poor function',
  'Missing accessory',
  // Appearance (columns AM-AQ, indices 27-31)
  'Stain / Oil stain',
  'Bone uneven',
  'Bag crooked',
  'Handle misaligned',
  'Missing rivet',
  // Zipper (columns AR-AU, indices 32-35)
  'Sharp / Stuck',
  'Zipper wavy',
  'Zipper puller reversed',
  'Wrong color',
  // Webbing (columns AV-AW, indices 36-37)
  'Webbing twisted',
  'Stitching off-center',
  // Other (columns AX-BC, indices 38-43)
  'Wash label reversed / Missing',
  'Wrong wash label',
  'Woven label reversed',
  'Woven label missing',
  'Lining reversed',
  'Transparent film defective',
  // Preparation (columns BD-BV, indices 44-62, 19 cols)
  'Rivet defective',
  'Accessory skewed',
  'Accessory paint peeling',
  'Bartack incomplete',
  'Bartack position off-standard',
  'Logo skewed',
  'Velcro skewed',
  'Velcro loose thread',
  'Trolley cover skewed',
  'Trolley cover distance short',
  'Webbing misaligned',
  'Webbing height off-position',
  'Stitching edge distance inconsistent',
  'Loose thread / Thread break',
  'Float thread / Skip stitch (computerized)',
  'Pattern stitch edge distance inconsistent',
  'Elastic band skewed',
  'Logo font detached',
  'Logo scratched',
  'Triangle piece reversed',
];

/**
 * Map sub-defect array index to category
 */
function getSubDefectCategory(index: number): { category: string; categoryKey: string } {
  if (index < 15) return { category: 'Stitching', categoryKey: 'defect_stitching' };
  if (index < 19) return { category: 'Logo', categoryKey: 'defect_logo' };
  if (index < 24) return { category: 'Material', categoryKey: 'defect_material' };
  if (index < 27) return { category: 'Hardware', categoryKey: 'defect_hardware' };
  if (index < 32) return { category: 'Appearance', categoryKey: 'defect_appearance' };
  if (index < 36) return { category: 'Zipper', categoryKey: 'defect_zipper' };
  if (index < 38) return { category: 'Webbing', categoryKey: 'defect_webbing' };
  if (index < 44) return { category: 'Other', categoryKey: 'defect_other' };
  if (index < 63) return { category: 'Preparation', categoryKey: 'defect_preparation' };
  // Index 63 (sub_triangle_reversed): merged into Stitching
  return { category: 'Stitching', categoryKey: 'defect_stitching' };
}

/**
 * Filter FQC records within a date range
 */
function filterRecordsByDateRange(
  records: any[],
  weekStart: Date,
  weekEnd: Date
): any[] {
  const startMs = new Date(weekStart).setHours(0, 0, 0, 0);
  const endMs = new Date(weekEnd).setHours(23, 59, 59, 999);

  return records.filter((r) => {
    const d = r.inspection_date instanceof Date
      ? r.inspection_date.getTime()
      : new Date(r.inspection_date).getTime();
    return d >= startMs && d <= endMs;
  });
}

/**
 * Generate a weekly Root Cause Analysis report from FQC records
 *
 * @param weekStart - Start date of the week (Monday)
 * @param weekEnd - End date of the week (Sunday)
 * @param fqcRecords - All FQC records (will be filtered by date range)
 * @returns RCAWeekly report
 */
export function generateWeeklyRCA(
  weekStart: Date,
  weekEnd: Date,
  fqcRecords: any[]
): RCAWeekly {
  const filteredRecords = filterRecordsByDateRange(fqcRecords, weekStart, weekEnd);

  // Aggregate totals
  let totalInspections = filteredRecords.length;
  let totalInspected = 0;
  let totalOK = 0;
  let totalNG = 0;
  let totalDefects = 0;

  // Aggregate defect counts by category
  const categoryDefects: Record<string, number> = {};
  DEFECT_CATEGORIES.forEach((cat) => {
    categoryDefects[cat.key] = 0;
  });

  // Aggregate sub-defect counts (index-based)
  const subDefectCounts: number[] = new Array(SUBDEFECT_NAMES.length).fill(0);

  // Aggregate style defect counts
  const styleDefects: Record<string, { defects: number; inspections: number; inspected: number }> = {};

  for (const record of filteredRecords) {
    const inspectedQty = Number(record.inspected_qty) || 0;
    const okQty = Number(record.ok_qty) || 0;
    const ngQty = Number(record.ng_qty) || 0;

    totalInspected += inspectedQty;
    totalOK += okQty;
    totalNG += ngQty;

    // Sum category defects (merge defect_stitch_defect into defect_stitching)
    DEFECT_CATEGORIES.forEach((cat) => {
      let val = Number(record[cat.key]) || 0;
      // Merge stitch_defect into stitching for display
      if (cat.key === 'defect_stitching') {
        val += Number(record.defect_stitch_defect) || 0;
      }
      categoryDefects[cat.key] += val;
      totalDefects += val;
    });

    // Sum sub-defects from sub_defects array
    if (Array.isArray(record.sub_defects)) {
      for (let i = 0; i < Math.min(record.sub_defects.length, subDefectCounts.length); i++) {
        subDefectCounts[i] += Number(record.sub_defects[i]) || 0;
      }
    }

    // Aggregate by style
    const style = record.style || 'Unknown';
    if (!styleDefects[style]) {
      styleDefects[style] = { defects: 0, inspections: 0, inspected: 0 };
    }
    // Compute total defects from category columns (no total_defects in DB)
    const recTotal = DEFECT_CATEGORIES.reduce((s, cat) => s + (Number(record[cat.key]) || 0), 0);
    styleDefects[style].defects += recTotal;
    styleDefects[style].inspections += 1;
    styleDefects[style].inspected += inspectedQty;
  }

  const overallPassRate = totalInspected > 0
    ? Math.round((totalOK / totalInspected) * 10000) / 10000
    : 1;

  // Top 3 categories by defect count
  const sortedCategories = DEFECT_CATEGORIES
    .map((cat) => ({
      category: cat.name,
      categoryKey: cat.key,
      defectCount: categoryDefects[cat.key],
      percentage: totalDefects > 0
        ? Math.round((categoryDefects[cat.key] / totalDefects) * 10000) / 100
        : 0,
      rank: 0,
    }))
    .filter((c) => c.defectCount > 0)
    .sort((a, b) => b.defectCount - a.defectCount);

  const topCategories = sortedCategories.slice(0, 3).map((c, i) => ({
    ...c,
    rank: i + 1,
  }));

  // Top 10 sub-defects for each of the top 3 categories
  const topCategoryKeys = new Set(topCategories.map((c) => c.categoryKey));
  const subDefects: RCASubDefect[] = [];

  for (let i = 0; i < subDefectCounts.length; i++) {
    if (subDefectCounts[i] === 0) continue;
    const { category, categoryKey } = getSubDefectCategory(i);
    // Only include sub-defects from the top 3 categories
    if (!topCategoryKeys.has(categoryKey)) continue;
    subDefects.push({
      subDefect: SUBDEFECT_NAMES[i] || `Sub-defect ${i + 1}`,
      category,
      categoryKey,
      defectCount: subDefectCounts[i],
      percentage: totalDefects > 0
        ? Math.round((subDefectCounts[i] / totalDefects) * 10000) / 100
        : 0,
    });
  }

  // Sort sub-defects by count, take top 10
  subDefects.sort((a, b) => b.defectCount - a.defectCount);
  const topSubDefects = subDefects.slice(0, 10);

  // Top 15 styles by defect count
  const topStyles = Object.entries(styleDefects)
    .map(([style, data]) => ({
      style,
      defectCount: data.defects,
      inspectionCount: data.inspections,
      defectRate: data.inspected > 0
        ? Math.round((data.defects / data.inspected) * 10000) / 100
        : 0,
      rank: 0,
    }))
    .filter((s) => s.defectCount > 0)
    .sort((a, b) => b.defectCount - a.defectCount)
    .slice(0, 15)
    .map((s, i) => ({
      ...s,
      rank: i + 1,
    }));

  return {
    weekStart,
    weekEnd,
    totalInspections,
    totalInspected,
    totalOK,
    totalNG,
    overallPassRate,
    topCategories,
    subDefects: topSubDefects,
    topStyles,
  };
}

export { DEFECT_CATEGORIES, SUBDEFECT_NAMES, getSubDefectCategory };
