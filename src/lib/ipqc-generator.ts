export type IPQCStage = 'Cutting' | 'Sewing' | 'Assembly' | 'Finishing';

export interface IPQCDefect {
  category: string;
  subDefect: string;
  count: number;
}

export interface IPQCRecord {
  id?: string;
  inspection_date: Date;
  stage: IPQCStage;
  line: string;
  inspector: string;
  style: string;
  order_no: string;
  business_type: string;
  checked_qty: number;
  pass_qty: number;
  fail_qty: number;
  pass_rate: number;
  defects: IPQCDefect[];
  total_defects: number;
  fqc_record_id?: string;
  created_at?: Date;
}

/**
 * IPQC sub-defects per stage and category
 */
const IPQC_STAGE_DEFECTS: Record<IPQCStage, Record<string, string[]>> = {
  Cutting: {
    'Material': ['Color deviation', 'Fabric defect', 'Incorrect material', 'Grain direction wrong'],
    'Dimension': ['Size out of spec', 'Pattern misalignment', 'Edge fraying'],
    'Preparation': ['Missing parts', 'Incorrect parts count', 'Parts mixed up'],
  },
  Sewing: {
    'Stitching': ['Skip stitch', 'Uneven stitch', 'Wrong stitch type', 'Thread break', 'Bobbin issue'],
    'Assembly': ['Panel misalignment', 'Wrong sequence', 'Component reversed'],
    'Appearance': ['Wrinkle', 'Puckering', 'Oil stain from machine'],
  },
  Assembly: {
    'Hardware': ['Zipper installed wrong', 'Buckle misaligned', 'Missing rivet', 'Handle attachment loose'],
    'Stitching': ['Open seam at joint', 'Reinforcement missing', 'Backtack missing'],
    'Accessory': ['Missing accessory', 'Wrong accessory placed', 'Accessory position off'],
  },
  Finishing: {
    'Appearance': ['Thread tail', 'Stain/spot', 'Scratch', 'Glue residue', 'Deformation'],
    'Label': ['Missing label', 'Label misaligned', 'Wrong label content'],
    'Packaging': ['Polybag missing', 'Incorrect tag', 'Silica gel missing'],
  },
};

/**
 * Mapping from FQC defect categories to IPQC stages.
 * Each FQC defect category maps to one or more IPQC stages where it would be caught.
 */
const FQC_TO_IPQC_STAGE: Record<string, { stage: IPQCStage; category: string; weight: number }[]> = {
  stitching: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.7 },
    { stage: 'Assembly', category: 'Stitching', weight: 0.2 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.1 },
  ],
  logo: [
    { stage: 'Assembly', category: 'Appearance', weight: 0.6 },
    { stage: 'Finishing', category: 'Label', weight: 0.4 },
  ],
  material: [
    { stage: 'Cutting', category: 'Material', weight: 0.8 },
    { stage: 'Sewing', category: 'Appearance', weight: 0.2 },
  ],
  hardware: [
    { stage: 'Assembly', category: 'Hardware', weight: 0.8 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.2 },
  ],
  appearance: [
    { stage: 'Sewing', category: 'Appearance', weight: 0.3 },
    { stage: 'Assembly', category: 'Appearance', weight: 0.3 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.4 },
  ],
  zipper: [
    { stage: 'Assembly', category: 'Hardware', weight: 0.8 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.2 },
  ],
  webbing: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.5 },
    { stage: 'Assembly', category: 'Assembly', weight: 0.3 },
    { stage: 'Finishing', category: 'Appearance', weight: 0.2 },
  ],
  other: [
    { stage: 'Finishing', category: 'Appearance', weight: 0.5 },
    { stage: 'Cutting', category: 'Dimension', weight: 0.3 },
    { stage: 'Assembly', category: 'Accessory', weight: 0.2 },
  ],
  preparation: [
    { stage: 'Cutting', category: 'Preparation', weight: 0.7 },
    { stage: 'Assembly', category: 'Accessory', weight: 0.3 },
  ],
  stitchDefect: [
    { stage: 'Sewing', category: 'Stitching', weight: 0.8 },
    { stage: 'Assembly', category: 'Stitching', weight: 0.2 },
  ],
};

/**
 * Seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Generate IPQC records from FQC records.
 * For each FQC record, generates 1-2 IPQC records at earlier production stages.
 * IPQC pass rate is slightly higher (90-97%) since IPQC catches issues early.
 */
export function generateIPQCRecords(fqcRecords: any[]): IPQCRecord[] {
  const ipqcRecords: IPQCRecord[] = [];
  let seedCounter = 42;

  for (const fqc of fqcRecords) {
    // Generate 1-2 IPQC records per FQC record
    const numRecords = 1 + Math.round(seededRandom(seedCounter++)() * 0.6);

    // Determine which stages to generate for based on FQC defect profile
    const fqcDefectProfile: Record<string, number> = {
      stitching: fqc.defect_stitching || 0,
      logo: fqc.defect_logo || 0,
      material: fqc.defect_material || 0,
      hardware: fqc.defect_hardware || 0,
      appearance: fqc.defect_appearance || 0,
      zipper: fqc.defect_zipper || 0,
      webbing: fqc.defect_webbing || 0,
      other: fqc.defect_other || 0,
      preparation: fqc.defect_preparation || 0,
      stitchDefect: fqc.defect_stitch_defect || 0,
    };

    const totalFQCDefects = Object.values(fqcDefectProfile).reduce((a, b) => a + b, 0);
    const fqcPassRate = fqc.inspected_qty > 0
      ? fqc.ok_qty / fqc.inspected_qty
      : 1;

    // Aggregate defect scores per IPQC stage
    const stageScores: Record<IPQCStage, number> = {
      Cutting: 0,
      Sewing: 0,
      Assembly: 0,
      Finishing: 0,
    };

    for (const [fqcCat, mappings] of Object.entries(FQC_TO_IPQC_STAGE)) {
      const fqcCount = fqcDefectProfile[fqcCat] || 0;
      for (const mapping of mappings) {
        stageScores[mapping.stage] += fqcCount * mapping.weight;
      }
    }

    // Select the top stages by defect score
    const sortedStages = (Object.entries(stageScores) as [IPQCStage, number][])
      .sort(([, a], [, b]) => b - a);

    // Select stages to generate IPQC records for
    const selectedStages: IPQCStage[] = [];
    for (let i = 0; i < Math.min(numRecords, sortedStages.length); i++) {
      selectedStages.push(sortedStages[i][0]);
    }

    // If no stages selected, default to Sewing and Finishing
    if (selectedStages.length === 0) {
      selectedStages.push('Sewing', 'Finishing');
    }

    for (const stage of selectedStages) {
      const rand = seededRandom(seedCounter++);

      // IPQC pass rate is higher than FQC (90-97%)
      // Base IPQC pass rate is derived from FQC but improved
      const ipqcPassRateBase = Math.min(0.97, fqcPassRate + 0.03 + rand() * 0.05);
      // Add some random variation
      const ipqcPassRate = Math.min(1, Math.max(0.88, ipqcPassRateBase + (rand() - 0.5) * 0.04));

      // IPQC checks fewer items than FQC (spot check)
      const checkedQty = Math.max(5, Math.round(fqc.inspected_qty * (0.3 + rand() * 0.4)));
      const passQty = Math.round(checkedQty * ipqcPassRate);
      const failQty = checkedQty - passQty;

      // Generate defects for this IPQC stage
      const defects: IPQCDefect[] = [];
      let totalDefects = 0;

      // Get defect categories for this stage
      const stageDefects = IPQC_STAGE_DEFECTS[stage];
      const stageScore = stageScores[stage] || 0;

      // IPQC should catch some defects that would otherwise become FQC defects
      // Catch rate: IPQC catches more defects than what leaks to FQC
      const catchRate = 0.6 + rand() * 0.3; // 60-90% catch rate
      const expectedDefects = Math.max(0, Math.round(stageScore * catchRate / selectedStages.length));

      if (expectedDefects > 0) {
        // Distribute defects across categories
        for (const [category, subDefects] of Object.entries(stageDefects)) {
          const catShare = rand();
          const catDefects = Math.round(expectedDefects * catShare);
          if (catDefects <= 0) continue;

          // Distribute across sub-defects
          let remaining = Math.min(catDefects, failQty - totalDefects);
          for (let i = 0; i < subDefects.length && remaining > 0; i++) {
            const count = i === subDefects.length - 1
              ? remaining
              : Math.max(0, Math.round(remaining * (0.3 + rand() * 0.4)));
            if (count > 0) {
              defects.push({
                category,
                subDefect: subDefects[i],
                count,
              });
              totalDefects += count;
              remaining -= count;
            }
          }
        }
      }

      // Generate IPQC inspection date (1-3 days before FQC date)
      const fqcDate = fqc.inspection_date instanceof Date
        ? fqc.inspection_date
        : new Date(fqc.inspection_date);
      const ipqcDate = new Date(fqcDate);
      ipqcDate.setDate(ipqcDate.getDate() - (1 + Math.floor(rand() * 3)));

      ipqcRecords.push({
        inspection_date: ipqcDate,
        stage,
        line: fqc.line || '',
        inspector: fqc.inspector || '',
        style: fqc.style || '',
        order_no: fqc.order_no || '',
        business_type: fqc.business_type || 'OTHER',
        checked_qty: checkedQty,
        pass_qty: passQty,
        fail_qty: failQty,
        pass_rate: Math.round(ipqcPassRate * 10000) / 10000,
        defects,
        total_defects: totalDefects,
        fqc_record_id: fqc.id,
        created_at: new Date(),
      });
    }
  }

  return ipqcRecords;
}

export { IPQC_STAGE_DEFECTS, FQC_TO_IPQC_STAGE };
