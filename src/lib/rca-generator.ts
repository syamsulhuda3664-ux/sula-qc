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

export interface RCAAction {
  rank: number;
  category: string;
  sub_defects: string[];
  defect_qty: number;
  style_codes: string[];
  root_cause: string;
  impact: string;
  process: string;
  corrective_action: string;
  preventive_action: string;
  responsible: string;
  due_date: string;
  status: string;
  photo_before: string;
  photo_after: string;
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
  actions: RCAAction[];
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
  return { category: 'Stitching', categoryKey: 'defect_stitching' };
}

/**
 * Sub-defect index ranges per category
 */
const CATEGORY_SUB_RANGES: Record<string, [number, number]> = {
  defect_stitching: [0, 15],
  defect_logo: [15, 19],
  defect_material: [19, 24],
  defect_hardware: [24, 27],
  defect_appearance: [27, 32],
  defect_zipper: [32, 36],
  defect_webbing: [36, 38],
  defect_other: [38, 44],
  defect_preparation: [44, 63],
};

/**
 * Pre-defined RCA action templates per defect category.
 * These are used to auto-generate action items when RCA is created.
 */
const ACTION_TEMPLATES: Record<string, {
  root_cause: string;
  impact: string;
  process: string;
  corrective_action: string;
  preventive_action: string;
}> = {
  Stitching: {
    root_cause: 'Mesin jahit tidak terkalibrasi, tensi benang tidak konsisten, atau operator kurang trained pada proses stitching yang diminta.',
    impact: 'Mengurangi kekuatan jahitan, tampilan tidak rapi, dan berpotensi robek saat penggunaan.',
    process: 'Stitching / Sewing',
    corrective_action: 'Lakukan kalibrasi ulang mesin jahit, perbaiki tensi benang, dan berikan training ulang ke operator.',
    preventive_action: 'Implementasi jadwal maintenance mesin harian, buat SOP standar tensi benang per jenis material, dan lakukan audit proses stitching secara berkala.',
  },
  Logo: {
    root_cause: 'Penempatan logo tidak akurat (positioning jig longgar), suhu/tekanan press kurang tepat, atau material logo bermasalah.',
    impact: 'Brand image terganggu, produk dianggap tidak original atau kurang berkualitas oleh customer.',
    process: 'Logo Attachment / Heat Press',
    corrective_action: 'Perbaiki jig positioning, sesuaikan parameter heat press, dan ganti material logo yang defect.',
    preventive_action: 'Buat jadwal pengecekan jig positioning mingguan, dokumentasi parameter heat press per jenis logo, dan lakukan incoming inspection material logo.',
  },
  Material: {
    root_cause: 'Material dari supplier tidak sesuai spesifikasi (lot perbedaan warna), penyimpanan kurang baik, atau cutting process salah.',
    impact: 'Produk tidak match dengan sample yang disetujui, perlu rework atau reject, meningkatkan biaya produksi.',
    process: 'Material Receiving / Cutting',
    corrective_action: 'Lakukan sortasi material yang sudah masuk, ajukan klaim ke supplier untuk lot yang tidak sesuai, dan perbaiki proses cutting.',
    preventive_action: 'Perketat incoming QC untuk material, buat color standard card untuk perbandingan, dan lakukan cutting trial sebelum produksi massal.',
  },
  Hardware: {
    root_cause: 'Hardware dari supplier berkualitas rendah, proses plating tidak sempurna, atau handling kasar saat assembly.',
    impact: 'Fungsi hardware terganggu (zipper stuck, buckle rusak), produk tidak layak jual, complain dari customer.',
    process: 'Hardware Installation / Assembly',
    corrective_action: 'Ganti hardware yang defect, lakukan pengecekan fungsi 100% sebelum install, dan perbaiki handling saat proses assembly.',
    preventive_action: 'Buat standar kualitas minimum hardware dari supplier, lakukan incoming inspection batch sampling, dan sediakan jig untuk pemasangan hardware.',
  },
  Appearance: {
    root_cause: 'Kondisi area kerja kotor, handling kasar oleh operator, atau proses finishing tidak standar.',
    impact: 'Produk terlihat tidak bersih/cacat secara visual, menurunkan persepsi kualitas produk secara keseluruhan.',
    process: 'Finishing / Packing',
    corrective_action: 'Bersihkan area kerja, lakukan rework untuk stain yang bisa dihilangkan, dan perbaiki proses finishing.',
    preventive_action: 'Implementasi 5S di area produksi, gunakan sarung tangan saat handling, dan buat visual standard untuk acceptance appearance.',
  },
  Zipper: {
    root_cause: 'Zipper dari supplier bermasalah (slider defect, tape kaku), proses penyambungan kurang presisi, atau jig pemasangan longgar.',
    impact: 'Zipper tidak berfungsi dengan baik, produk tidak bisa digunakan, potensi return tinggi dari customer.',
    process: 'Zipper Sewing / Attachment',
    corrective_action: 'Ganti zipper yang defect, perbaiki jig pemasangan, dan sesuaikan parameter jahitan zipper.',
    preventive_action: 'Lakukan pull test dan slider test pada sample zipper dari setiap batch, buat jig pemasangan standar, dan lakukan training operator.',
  },
  Webbing: {
    root_cause: 'Webbing tidak dipotong sesuai ukuran, jig pemasangan meleset, atau proses sewing webbing tidak center.',
    impact: 'Pemasangan webbing tidak simetris, mengurangi estetika dan fungsi produk, potensi rework tinggi.',
    process: 'Webbing Cutting / Sewing',
    corrective_action: 'Potong ulang webbing sesuai spesifikasi, perbaiki jig pemasangan, dan lakukan pengecekan center sewing.',
    preventive_action: 'Buat cutting jig untuk webbing, lakukan first piece inspection sebelum produksi, dan buat visual guide untuk pemasangan.',
  },
  Other: {
    root_cause: 'Label salah pasang atau salah cetak, lining terbalik saat assembly, atau aksesoris pelengkap tidak sesuai spesifikasi.',
    impact: 'Informasi produk tidak sesuai (label salah), tampilan interior kurang rapi, atau ketidaksesuaian dengan sample.',
    process: 'Labeling / Lining / Accessories',
    corrective_action: 'Perbaiki pemasangan label dan lining, ganti aksesoris yang tidak sesuai, dan lakukan pengecekan ulang terhadap sample.',
    preventive_action: 'Buat panduan visual untuk pemasangan label dan lining, lakukan pengecekan aksesoris sebelum digunakan, dan terapkan first piece check.',
  },
  Preparation: {
    root_cause: 'Proses persiapan material/semi-finished goods tidak teliti, jig/bartack positioning menyimpang, atau proses komputerisasi (logo font, pattern stitch) kurang presisi.',
    impact: 'Kualitas produk turun sebelum masuk proses akhir, memerlukan waktu rework yang signifikan, meningkatkan WIP.',
    process: 'Preparation / Pre-assembly',
    corrective_action: 'Perbaiki positioning jig dan bartack, sesuaikan parameter mesin komputerisasi, dan lakukan rework pada item yang belum memenuhi standar.',
    preventive_action: 'Buat jadwal kalibrasi jig mingguan, dokumentasi parameter mesin komputerisasi, dan terapkan inspection checkpoint setiap sub-proses preparation.',
  },
};

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
 * @param weekStart - Start date of the week
 * @param weekEnd - End date of the week
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
    const recTotal = DEFECT_CATEGORIES.reduce((s, cat) => s + (Number(record[cat.key]) || 0), 0);
    styleDefects[style].defects += recTotal;
    styleDefects[style].inspections += 1;
    styleDefects[style].inspected += inspectedQty;
  }

  // FIX: Pass rate as percentage (95.12 not 0.9512)
  const overallPassRate = totalInspected > 0
    ? Math.round((totalOK / totalInspected) * 100 * 100) / 100
    : 100;

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

  // Collect sub-defects per category (top 5 per category, not global top 10)
  const topCategoryKeys = new Set(topCategories.map((c) => c.categoryKey));
  const allSubDefects: RCASubDefect[] = [];

  for (let i = 0; i < subDefectCounts.length; i++) {
    if (subDefectCounts[i] === 0) continue;
    const { category, categoryKey } = getSubDefectCategory(i);
    if (!topCategoryKeys.has(categoryKey)) continue;
    allSubDefects.push({
      subDefect: SUBDEFECT_NAMES[i] || `Sub-defect ${i + 1}`,
      category,
      categoryKey,
      defectCount: subDefectCounts[i],
      percentage: totalDefects > 0
        ? Math.round((subDefectCounts[i] / totalDefects) * 10000) / 100
        : 0,
    });
  }

  // Sort within each category and take top 5 per category
  const topSubDefects = allSubDefects
    .sort((a, b) => b.defectCount - a.defectCount)
    .reduce<RCASubDefect[]>((acc, s) => {
      const countInCategory = acc.filter(x => x.categoryKey === s.categoryKey).length;
      if (countInCategory < 5) acc.push(s);
      return acc;
    }, []);

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

  // Auto-generate action items for top 3 categories
  const actions: RCAAction[] = topCategories.map((cat, i) => {
    const template = ACTION_TEMPLATES[cat.category] || ACTION_TEMPLATES['Other'];
    // Get sub-defect names for this category
    const range = CATEGORY_SUB_RANGES[cat.categoryKey];
    const catSubDefects: string[] = [];
    if (range) {
      for (let si = range[0]; si < range[1] && si < subDefectCounts.length; si++) {
        if (subDefectCounts[si] > 0) {
          catSubDefects.push(SUBDEFECT_NAMES[si]);
        }
      }
    }
    // Get top 3 styles for this category (from overall top styles)
    const actionStyleCodes = topStyles.slice(0, 5).map(s => s.style);

    return {
      rank: i + 1,
      category: cat.category,
      sub_defects: catSubDefects,
      defect_qty: cat.defectCount,
      style_codes: actionStyleCodes,
      root_cause: template.root_cause,
      impact: template.impact,
      process: template.process,
      corrective_action: template.corrective_action,
      preventive_action: template.preventive_action,
      responsible: '',
      due_date: '',
      status: 'pending',
      photo_before: '',
      photo_after: '',
    };
  });

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
    actions,
  };
}

export { DEFECT_CATEGORIES, SUBDEFECT_NAMES, getSubDefectCategory, ACTION_TEMPLATES };
