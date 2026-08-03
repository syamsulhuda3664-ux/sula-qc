export interface AQLResult {
  code: string;
  sampleSize: number;
  ac: number;
  re: number;
}

interface AQLRange {
  min: number;
  max: number;
  code: string;
  sampleSize: number;
  ac: number;
  re: number;
}

/**
 * ANSI/ASQ Z1.4 Level II, AQL 2.5 lookup table
 * Based on standard sampling plans for normal inspection.
 */
const AQL_TABLE: AQLRange[] = [
  { min: 2, max: 8, code: 'A', sampleSize: 2, ac: 0, re: 1 },
  { min: 9, max: 15, code: 'B', sampleSize: 3, ac: 0, re: 1 },
  { min: 16, max: 25, code: 'C', sampleSize: 5, ac: 1, re: 2 },
  { min: 26, max: 50, code: 'D', sampleSize: 8, ac: 1, re: 2 },
  { min: 51, max: 90, code: 'E', sampleSize: 13, ac: 1, re: 2 },
  { min: 91, max: 150, code: 'F', sampleSize: 20, ac: 1, re: 2 },
  { min: 151, max: 280, code: 'G', sampleSize: 32, ac: 2, re: 3 },
  { min: 281, max: 500, code: 'H', sampleSize: 50, ac: 3, re: 4 },
  { min: 501, max: 1200, code: 'J', sampleSize: 80, ac: 5, re: 6 },
  { min: 1201, max: 3200, code: 'K', sampleSize: 125, ac: 7, re: 8 },
  { min: 3201, max: 10000, code: 'L', sampleSize: 200, ac: 10, re: 11 },
  { min: 10001, max: 35000, code: 'M', sampleSize: 315, ac: 14, re: 15 },
  { min: 35001, max: 150000, code: 'N', sampleSize: 500, ac: 21, re: 22 },
  { min: 150001, max: 500000, code: 'P', sampleSize: 800, ac: 21, re: 22 },
];

/**
 * Get AQL code, sample size, accept (Ac), and reject (Re) numbers
 * based on lot size using ANSI/ASQ Z1.4 Level II, AQL 2.5
 */
export function getAQLCode(lotSize: number): AQLResult {
  if (lotSize < 2) {
    return { code: 'N/A', sampleSize: 0, ac: 0, re: 1 };
  }

  if (lotSize > 500000) {
    // For lot sizes above 500000, use the largest code P
    return { code: 'P', sampleSize: 800, ac: 21, re: 22 };
  }

  const entry = AQL_TABLE.find(
    (range) => lotSize >= range.min && lotSize <= range.max
  );

  if (!entry) {
    // Fallback: find the largest range that contains the lot size
    const lastEntry = AQL_TABLE[AQL_TABLE.length - 1];
    return {
      code: lastEntry.code,
      sampleSize: lastEntry.sampleSize,
      ac: lastEntry.ac,
      re: lastEntry.re,
    };
  }

  return {
    code: entry.code,
    sampleSize: entry.sampleSize,
    ac: entry.ac,
    re: entry.re,
  };
}

/**
 * Get the full AQL table for reference/display purposes
 */
export function getAQLTable(): AQLRange[] {
  return [...AQL_TABLE];
}

/**
 * Determine disposition based on defect count vs AQL limits
 */
export function determineDisposition(
  totalDefects: number,
  ac: number,
  re: number
): 'RELEASE' | 'REWORK' | 'HOLD' {
  if (totalDefects >= re) {
    return 'REWORK';
  }
  if (totalDefects <= ac) {
    return 'RELEASE';
  }
  return 'REWORK';
}
