import { getAQLCode } from './aql';

export type OQCDisposition = 'RELEASE' | 'REWORK' | 'HOLD';
export type OQCDefectCategory = 'Packaging' | 'Label' | 'Accessory' | 'Appearance' | 'Hardware' | 'Stitching' | 'Other';
export type OQCDefectSeverity = 'Critical' | 'Major' | 'Minor';

export interface OQCDefect {
  category: OQCDefectCategory;
  subDefect: string;
  count: number;
  severity: OQCDefectSeverity;
}

export interface OQCLotOrder {
  style: string;
  orderNo: string;
  orderQty: number;
  okQty: number;
  ngQty: number;
}

export interface OQCLot {
  lotDate: Date;
  businessType: string;
  totalOrders: number;
  lotSize: number;
  aqlCode: string;
  sampleSize: number;
  ac: number;
  re: number;
  criticalDefects: number;
  majorDefects: number;
  minorDefects: number;
  totalDefects: number;
  sampleOk: number;
  passRate: number;
  disposition: OQCDisposition;
  releaseQty: number;
  reworkQty: number;
  holdQty: number;
  remarks: string;
  orders: OQCLotOrder[];
  defects: OQCDefect[];
}

/**
 * OQC sub-defect definitions per category
 */
const OQC_SUBDEFECTS: Record<OQCDefectCategory, string[]> = {
  Packaging: [
    'Box damaged',
    'Wrong box size',
    'Missing polybag',
    'Polybag torn',
    'Missing silica gel',
    'Incorrect packing method',
  ],
  Label: [
    'Wrong care label',
    'Missing brand label',
    'Label misaligned',
    'Faded print',
    'Wrong barcode',
  ],
  Accessory: [
    'Missing accessory',
    'Wrong accessory',
    'Loose accessory',
    'Defective accessory',
  ],
  Appearance: [
    'Scratch',
    'Stain',
    'Color deviation',
    'Wrinkle',
    'Deformation',
    'Uneven stitching',
  ],
  Hardware: [
    'Zipper stuck',
    'Zipper missing pull',
    'Buckle defective',
    'Rivet loose',
    'Wheel defect',
    'Handle loose',
  ],
  Stitching: [
    'Skip stitch',
    'Thread loose',
    'Open seam',
    'Uneven stitch',
    'Wrong thread color',
  ],
  Other: [
    'Dimension out of spec',
    'Weight out of spec',
    'Smell/odor',
    'Other defect',
  ],
};

/**
 * Mapping from FQC defect categories to OQC defect categories
 * with a leakage factor indicating how likely FQC defects leak through to OQC
 */
const FQC_TO_OQC_MAPPING: {
  fqcCategory: string;
  oqcCategories: { category: OQCDefectCategory; weight: number }[];
}[] = [
  {
    fqcCategory: 'stitching',
    oqcCategories: [
      { category: 'Stitching', weight: 0.5 },
      { category: 'Appearance', weight: 0.3 },
      { category: 'Other', weight: 0.2 },
    ],
  },
  {
    fqcCategory: 'logo',
    oqcCategories: [
      { category: 'Label', weight: 0.6 },
      { category: 'Appearance', weight: 0.4 },
    ],
  },
  {
    fqcCategory: 'material',
    oqcCategories: [
      { category: 'Appearance', weight: 0.6 },
      { category: 'Other', weight: 0.4 },
    ],
  },
  {
    fqcCategory: 'hardware',
    oqcCategories: [
      { category: 'Hardware', weight: 0.8 },
      { category: 'Accessory', weight: 0.2 },
    ],
  },
  {
    fqcCategory: 'appearance',
    oqcCategories: [
      { category: 'Appearance', weight: 0.7 },
      { category: 'Packaging', weight: 0.3 },
    ],
  },
  {
    fqcCategory: 'zipper',
    oqcCategories: [
      { category: 'Hardware', weight: 0.8 },
      { category: 'Other', weight: 0.2 },
    ],
  },
  {
    fqcCategory: 'webbing',
    oqcCategories: [
      { category: 'Stitching', weight: 0.5 },
      { category: 'Accessory', weight: 0.3 },
      { category: 'Appearance', weight: 0.2 },
    ],
  },
  {
    fqcCategory: 'other',
    oqcCategories: [
      { category: 'Other', weight: 0.5 },
      { category: 'Label', weight: 0.3 },
      { category: 'Packaging', weight: 0.2 },
    ],
  },
  {
    fqcCategory: 'preparation',
    oqcCategories: [
      { category: 'Accessory', weight: 0.5 },
      { category: 'Other', weight: 0.3 },
      { category: 'Packaging', weight: 0.2 },
    ],
  },
];

/**
 * Seeded random number generator for deterministic results
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Pick a random item from an array using weighted random selection
 */
function weightedRandom<T extends { weight: number }>(
  items: T[],
  rand: () => number
): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let r = rand() * totalWeight;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Determine severity based on OQC defect category and a random factor
 * Most OQC defects are Minor, some Major, rare Critical
 */
function determineSeverity(category: OQCDefectCategory, rand: () => number): OQCDefectSeverity {
  const r = rand();
  switch (category) {
    case 'Hardware':
      // Hardware defects more likely to be Major
      if (r < 0.05) return 'Critical';
      if (r < 0.30) return 'Major';
      return 'Minor';
    case 'Stitching':
      if (r < 0.02) return 'Critical';
      if (r < 0.20) return 'Major';
      return 'Minor';
    case 'Appearance':
      if (r < 0.03) return 'Critical';
      if (r < 0.15) return 'Major';
      return 'Minor';
    case 'Packaging':
      if (r < 0.01) return 'Critical';
      if (r < 0.10) return 'Major';
      return 'Minor';
    case 'Label':
      if (r < 0.02) return 'Critical';
      if (r < 0.15) return 'Major';
      return 'Minor';
    case 'Accessory':
      if (r < 0.03) return 'Critical';
      if (r < 0.25) return 'Major';
      return 'Minor';
    default:
      if (r < 0.02) return 'Critical';
      if (r < 0.12) return 'Major';
      return 'Minor';
  }
}

/**
 * Generate an OQC lot from FQC records for a given date
 *
 * @param date - The lot date
 * @param fqcRecords - FQC records for this date
 * @returns OQCLot with synthetic OQC inspection results
 */
export function generateOQCLot(date: Date, fqcRecords: any[]): OQCLot {
  // Create a seed from the date for deterministic generation
  const dateSeed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const rand = seededRandom(dateSeed);

  // Calculate total lot size as sum of OK quantities from FQC
  const lotSize = fqcRecords.reduce((sum: number, r: any) => sum + (r.ok_qty || 0), 0);

  // Determine business type from majority of FQC records
  const businessTypes: Record<string, number> = {};
  fqcRecords.forEach((r: any) => {
    const bt = r.business_type || 'OTHER';
    businessTypes[bt] = (businessTypes[bt] || 0) + 1;
  });
  let businessType = 'OTHER';
  let maxCount = 0;
  for (const [bt, count] of Object.entries(businessTypes)) {
    if (count > maxCount) {
      maxCount = count;
      businessType = bt;
    }
  }

  // Get AQL code and sample size
  const aql = getAQLCode(lotSize);
  const sampleSize = Math.min(aql.sampleSize, lotSize);

  // Build orders list from FQC records
  const orders: OQCLotOrder[] = fqcRecords.map((r: any) => ({
    style: r.style || '',
    orderNo: r.order_no || '',
    orderQty: r.order_qty || 0,
    okQty: r.ok_qty || 0,
    ngQty: r.ng_qty || 0,
  }));

  // Aggregate FQC defect profile
  const fqcDefectProfile: Record<string, number> = {
    stitching: 0,
    logo: 0,
    material: 0,
    hardware: 0,
    appearance: 0,
    zipper: 0,
    webbing: 0,
    other: 0,
    preparation: 0,
  };

  fqcRecords.forEach((r: any) => {
    // Merge defect_stitch_defect into stitching
    fqcDefectProfile.stitching += (r.defect_stitching || 0) + (r.defect_stitch_defect || 0);
    fqcDefectProfile.logo += r.defect_logo || 0;
    fqcDefectProfile.material += r.defect_material || 0;
    fqcDefectProfile.hardware += r.defect_hardware || 0;
    fqcDefectProfile.appearance += r.defect_appearance || 0;
    fqcDefectProfile.zipper += r.defect_zipper || 0;
    fqcDefectProfile.webbing += r.defect_webbing || 0;
    fqcDefectProfile.other += r.defect_other || 0;
    fqcDefectProfile.preparation += r.defect_preparation || 0;
  });

  const totalFQCDefects = Object.values(fqcDefectProfile).reduce((a, b) => a + b, 0);

  // Apply leakage factor: 5-15% of FQC defects leak through to OQC
  const leakageFactor = 0.05 + rand() * 0.10;
  const expectedOQCDefects = Math.round(totalFQCDefects * leakageFactor);

  // Distribute expected OQC defects across OQC categories based on FQC profile
  const oqcDefectDistribution: Record<OQCDefectCategory, number> = {
    Packaging: 0,
    Label: 0,
    Accessory: 0,
    Appearance: 0,
    Hardware: 0,
    Stitching: 0,
    Other: 0,
  };

  for (const mapping of FQC_TO_OQC_MAPPING) {
    const fqcCount = fqcDefectProfile[mapping.fqcCategory] || 0;
    const leakedCount = fqcCount * leakageFactor;
    for (const oqcCat of mapping.oqcCategories) {
      oqcDefectDistribution[oqcCat.category] += leakedCount * oqcCat.weight;
    }
  }

  // Add some base-level OQC defects (packaging/label issues that FQC doesn't catch)
  const baseOQCDefects = Math.max(0, Math.round(sampleSize * 0.005 * rand()));
  oqcDefectDistribution.Packaging += baseOQCDefects * 0.4;
  oqcDefectDistribution.Label += baseOQCDefects * 0.3;
  oqcDefectDistribution.Accessory += baseOQCDefects * 0.3;

  // Generate individual OQC defects
  const defects: OQCDefect[] = [];
  let totalDefects = 0;
  let criticalDefects = 0;
  let majorDefects = 0;
  let minorDefects = 0;

  for (const [category, rawCount] of Object.entries(oqcDefectDistribution)) {
    const count = Math.round(rawCount);
    if (count <= 0) continue;

    const subDefectList = OQC_SUBDEFECTS[category as OQCDefectCategory];

    // Distribute count across sub-defects
    let remaining = count;
    for (let i = 0; i < subDefectList.length && remaining > 0; i++) {
      // Use geometric-like distribution: first sub-defects get more
      const share = i === subDefectList.length - 1
        ? remaining
        : Math.max(1, Math.round(remaining * (1 - i / subDefectList.length) * 0.6 * (0.5 + rand() * 0.5)));
      const actualCount = Math.min(share, remaining);

      if (actualCount > 0) {
        const severity = determineSeverity(category as OQCDefectCategory, rand);
        defects.push({
          category: category as OQCDefectCategory,
          subDefect: subDefectList[i],
          count: actualCount,
          severity,
        });

        totalDefects += actualCount;
        switch (severity) {
          case 'Critical':
            criticalDefects += actualCount;
            break;
          case 'Major':
            majorDefects += actualCount;
            break;
          case 'Minor':
            minorDefects += actualCount;
            break;
        }
        remaining -= actualCount;
      }
    }
  }

  // Calculate pass rate
  const sampleOk = Math.max(0, sampleSize - totalDefects);
  const passRate = sampleSize > 0 ? sampleOk / sampleSize : 1;

  // Determine disposition
  // Internal control pass rate target: 98.5%
  // AQL target pass rate: 97.8%
  const INTERNAL_CONTROL_RATE = 0.985;
  const hasCriticalDefect = criticalDefects > 0;

  let disposition: OQCDisposition;
  if (totalDefects >= aql.re || hasCriticalDefect) {
    // Exceeds AQL reject number or has critical defect
    disposition = hasCriticalDefect && criticalDefects >= 2 ? 'HOLD' : 'REWORK';
  } else if (passRate < INTERNAL_CONTROL_RATE) {
    // Below internal control threshold
    disposition = 'REWORK';
  } else {
    disposition = 'RELEASE';
  }

  // Calculate quantities
  const releaseQty = disposition === 'RELEASE' ? lotSize : 0;
  const reworkQty = disposition === 'REWORK' ? lotSize : 0;
  const holdQty = disposition === 'HOLD' ? lotSize : 0;

  // Generate remarks
  const remarks: string[] = [];
  if (disposition === 'REWORK') {
    remarks.push(`Total defects (${totalDefects}) require rework before shipment`);
  } else if (disposition === 'HOLD') {
    remarks.push(`HOLD: Critical defects found. Requires management review`);
  }
  if (totalDefects > 0) {
    const topDefect = defects.reduce((max, d) => d.count > max.count ? d : max, defects[0]);
    if (topDefect) {
      remarks.push(`Top issue: ${topDefect.category} - ${topDefect.subDefect} (${topDefect.count})`);
    }
  }

  return {
    lotDate: date,
    businessType,
    totalOrders: fqcRecords.length,
    lotSize,
    aqlCode: aql.code,
    sampleSize,
    ac: aql.ac,
    re: aql.re,
    criticalDefects,
    majorDefects,
    minorDefects,
    totalDefects,
    sampleOk,
    passRate: Math.round(passRate * 10000) / 10000,
    disposition,
    releaseQty,
    reworkQty,
    holdQty,
    remarks: remarks.join('. '),
    orders,
    defects,
  };
}

export { OQC_SUBDEFECTS, FQC_TO_OQC_MAPPING };
