export type IPQCStage = 'Cutting' | 'Sewing' | 'Assembly' | 'Finishing';

/**
 * Realistic sub-defects per IPQC stage (bilingual: used in defect_detail JSON)
 */
const STAGE_SUBDEFECTS: Record<IPQCStage, { category: string; subs: string[] }[]> = {
  Cutting: [
    { category: 'Material', subs: ['Color deviation 色差', 'Fabric defect 布疵', 'Incorrect material 错料', 'Grain direction wrong 纹路错'] },
    { category: 'Dimension', subs: ['Size out of spec 尺寸超差', 'Pattern misalignment 对位偏移', 'Edge fraying 毛边'] },
    { category: 'Preparation', subs: ['Missing parts 漏部件', 'Incorrect parts count 部件数量错', 'Parts mixed up 部件混料'] },
  ],
  Sewing: [
    { category: 'Stitching', subs: ['Skip stitch 跳针', 'Uneven stitch 针距不均', 'Wrong stitch type 针法错误', 'Thread break 断线', 'Bobbin issue 底线问题'] },
    { category: 'Appearance', subs: ['Wrinkle 起皱', 'Puckering 起扭', 'Oil stain 油渍'] },
  ],
  Assembly: [
    { category: 'Hardware', subs: ['Zipper installed wrong 拉链装错', 'Buckle misaligned 扣具偏位', 'Missing rivet 漜铆钉', 'Handle attachment loose 提手松动'] },
    { category: 'Accessory', subs: ['Missing accessory 漏配件', 'Wrong accessory 配件错', 'Accessory position off 配件位置偏'] },
    { category: 'Stitching', subs: ['Open seam at joint 接口开线', 'Reinforcement missing 漜加固', 'Backtack missing 漜回针'] },
  ],
  Finishing: [
    { category: 'Appearance', subs: ['Thread tail 线头', 'Stain/spot 污渍', 'Scratch 划伤', 'Glue residue 胶水残留', 'Deformation 变形'] },
    { category: 'Label', subs: ['Missing label 漜标', 'Label misaligned 标签歪斜', 'Wrong label content 标签内容错'] },
    { category: 'Packaging', subs: ['Polybag missing 漜胶袋', 'Incorrect tag 吊牌错', 'Silica gel missing 漜干燥剂'] },
  ],
};

/**
 * FQC defect DB column → IPQC stage distribution.
 * Weight = probability the defect originates from this stage.
 */
const FQC_DEFECT_TO_STAGES: Record<string, { stage: IPQCStage; category: string; weight: number }[]> = {
  defect_stitching: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.70 },
    { stage: 'Assembly', category: 'Stitching', weight: 0.20 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.10 },
  ],
  defect_stitch_defect: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.75 },
    { stage: 'Assembly', category: 'Stitching', weight: 0.25 },
  ],
  defect_logo: [
    { stage: 'Assembly', category: 'Appearance', weight: 0.60 },
    { stage: 'Finishing', category: 'Label', weight: 0.40 },
  ],
  defect_material: [
    { stage: 'Cutting', category: 'Material', weight: 0.80 },
    { stage: 'Sewing', category: 'Appearance', weight: 0.20 },
  ],
  defect_hardware: [
    { stage: 'Assembly', category: 'Hardware', weight: 0.80 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.20 },
  ],
  defect_appearance: [
    { stage: 'Sewing', category: 'Appearance', weight: 0.25 },
    { stage: 'Assembly', category: 'Appearance', weight: 0.30 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.45 },
  ],
  defect_zipper: [
    { stage: 'Assembly', category: 'Hardware', weight: 0.80 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.20 },
  ],
  defect_webbing: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.50 },
    { stage: 'Assembly', category: 'Accessory', weight: 0.30 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.20 },
  ],
  defect_other: [
    { stage: 'Finishing', category: 'Appearance', weight: 0.40 },
    { stage: 'Cutting', category: 'Dimension', weight: 0.30 },
    { stage: 'Assembly', category: 'Accessory', weight: 0.30 },
  ],
  defect_preparation: [
    { stage: 'Cutting', category: 'Preparation', weight: 0.70 },
    { stage: 'Assembly', category: 'Accessory', weight: 0.30 },
  ],
};

/** Deterministic PRNG (Lehmer / Park-Miller) */
function seededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Hash a string into a numeric seed */
function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h) || 1;
}

export interface IPQCGeneratedRow {
  inspection_date: string;       // YYYY-MM-DD
  production_line: string;
  inspector_name: string;
  style_code: string;
  order_no: string;
  business_type: string;
  stage: IPQCStage;
  check_count: number;
  ok_count: number;
  ng_count: number;
  pass_rate: number;           // e.g. 95.67 (percentage)
  total_defects: number;
  defect_category: string;      // primary category e.g. "Stitching"
  defect_detail: string;        // JSON string of defect items
}

/**
 * Generate IPQC records from FQC DB rows.
 *
 * Key realism constraints:
 * - IPQC checks 25-50% of FQC inspected qty (spot check during production)
 * - IPQC pass rate is 2-6% higher than FQC (issues caught & fixed in-process)
 * - IPQC total defects = 2-4x FQC defects (more caught, but fixed before FQC)
 * - Defect categories match the stage where they logically occur
 * - Same FQC input always produces the same IPQC output (deterministic)
 */
export function generateIPQCFromFQC(
  fqcRows: Record<string, unknown>[],
): IPQCGeneratedRow[] {
  const results: IPQCGeneratedRow[] = [];

  // Group FQC rows by date + business_type for seed stability
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of fqcRows) {
    const date = String(row.inspection_date || '').split('T')[0];
    const bt = String(row.business_type || 'OTHER');
    const key = `${date}__${bt}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  for (const [groupKey, rows] of grouped) {
    const baseSeed = hashSeed(groupKey);
    let seedIdx = baseSeed;

    // Aggregate FQC stats for this group
    let totalInspected = 0, totalOK = 0, totalNG = 0, totalDefects = 0;
    const fqcDefectSums: Record<string, number> = {};

    for (const row of rows) {
      totalInspected += Number(row.inspected_qty) || 0;
      totalOK += Number(row.ok_qty) || 0;
      totalNG += Number(row.ng_qty) || 0;
      totalDefects += Number(row.total_defects) || 0;

      for (const col of Object.keys(FQC_DEFECT_TO_STAGES)) {
        fqcDefectSums[col] = (fqcDefectSums[col] || 0) + (Number(row[col]) || 0);
      }
    }

    const fqcPassRate = totalInspected > 0 ? totalOK / totalInspected : 1;
    const rng = seededRng(seedIdx++);

    // ── Determine which stages to generate ──
    // Score each stage by weighted FQC defect contribution
    const stageScores: Record<string, number> = { Cutting: 0, Sewing: 0, Assembly: 0, Finishing: 0 };
    for (const [col, mappings] of Object.entries(FQC_DEFECT_TO_STAGES)) {
      const count = fqcDefectSums[col] || 0;
      for (const m of mappings) stageScores[m.stage] += count * m.weight;
    }

    // Always generate for top 2-3 stages, but ensure all 4 stages appear over time
    const sorted = (Object.entries(stageScores) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const numStages = totalDefects > 0
      ? 2 + Math.round(rng() * 1.2)   // 2-3 stages when defects exist
      : 2;                                // 2 stages when no defects
    const selectedStages = sorted.slice(0, Math.min(numStages, 4)).map(([s]) => s as IPQCStage);

    // ── Pick a representative FQC row for line/inspector/style/order ──
    // Use different rows for different stages to add variety
    const stageRowMap: Record<string, Record<string, unknown>> = {};
    for (const stage of selectedStages) {
      stageRowMap[stage] = pick(rows, seededRng(seedIdx++));
    }

    // ── Generate IPQC record per selected stage ──
    for (const stage of selectedStages) {
      const sRng = seededRng(seedIdx++);
      const srcRow = stageRowMap[stage];
      const dateStr = String(srcRow.inspection_date || '').split('T')[0];

      // Checked qty: 25-50% of FQC inspected (spot check)
      const checkRatio = 0.25 + sRng() * 0.25;
      const checkCount = Math.max(5, Math.round(totalInspected * checkRatio / selectedStages.length));

      // Pass rate: 2-6% higher than FQC (IPQC catches & fixes issues)
      const ipqcPassRate = Math.min(0.995, Math.max(0.90, fqcPassRate + 0.02 + sRng() * 0.04 + (sRng() - 0.5) * 0.02));
      const okCount = Math.round(checkCount * ipqcPassRate);
      const ngCount = checkCount - okCount;

      // ── Generate synthetic defects for this stage ──
      // IPQC catches 2-4x more defects than what leaks to FQC
      const defectMultiplier = 2.5 + sRng() * 1.5;
      const stageDefectBudget = Math.max(0, Math.round(
        (stageScores[stage] || 0) * defectMultiplier / (selectedStages.length * 0.7)
      ));

      // If FQC had zero defects for this group, still generate small random defects (realistic noise)
      const baseDefects = totalDefects === 0
        ? Math.round(sRng() * 2)  // 0-2 random defects
        : stageDefectBudget;

      const defects: { category: string; subDefect: string; count: number }[] = [];
      let defectTotal = 0;
      const stageCats = STAGE_SUBDEFECTS[stage] || [];

      if (baseDefects > 0 && stageCats.length > 0) {
        let remaining = Math.min(baseDefects, ngCount * 3); // cap at 3x NG count
        if (remaining <= 0) remaining = Math.max(1, baseDefects); // ensure some defects even if NG=0

        for (const cat of stageCats) {
          if (remaining <= 0) break;
          // Weighted category selection — first categories get more defects
          const catBudget = Math.round(remaining * (0.3 + sRng() * 0.5));
          if (catBudget <= 0) continue;

          let catRemaining = Math.min(catBudget, remaining);
          const shuffled = [...cat.subs].sort(() => sRng() - 0.5);

          for (let i = 0; i < shuffled.length && catRemaining > 0; i++) {
            const isLast = i === shuffled.length - 1;
            const count = isLast
              ? catRemaining
              : Math.max(0, Math.round(catRemaining * (0.2 + sRng() * 0.5)));
            if (count > 0) {
              defects.push({ category: cat.category, subDefect: shuffled[i], count });
              defectTotal += count;
              catRemaining -= count;
              remaining -= count;
            }
          }
        }
      }

      // Primary defect category for the record
      const primaryCat = defects.length > 0
        ? defects.reduce((a, b) => a.count >= b.count ? a : b).category
        : (stageCats[0]?.category || '');

      // Build defect_detail JSON string (matching existing export format)
      const defectDetail = defects.length > 0
        ? JSON.stringify(defects.map(d => ({
            category: d.category,
            subDefect: d.subDefect,
            count: d.count,
          })))
        : '';

      results.push({
        inspection_date: dateStr,
        production_line: String(srcRow.production_line || srcRow.line || ''),
        inspector_name: String(srcRow.inspector_name || srcRow.inspector || ''),
        style_code: String(srcRow.style_code || srcRow.style || ''),
        order_no: String(srcRow.order_no || ''),
        business_type: String(srcRow.business_type || 'OTHER'),
        stage,
        check_count: checkCount,
        ok_count: okCount,
        ng_count: ngCount,
        pass_rate: Math.round(ipqcPassRate * 10000) / 100, // store as percentage e.g. 95.67
        total_defects: defectTotal,
        defect_category: primaryCat,
        defect_detail: defectDetail,
      });
    }
  }

  return results;
}
