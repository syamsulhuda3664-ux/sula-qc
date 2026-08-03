import * as XLSX from 'xlsx';

/**
 * Column index constants for the FQC Excel format
 * Row 0: Title (skip)
 * Row 1: Category headers
 * Row 2: Sub-defect names (skip)
 * Row 3+: Data rows
 * Last row: Total (skip)
 */
const COL = {
  date: 0,       // A
  line: 1,       // B
  inspector: 2,  // C
  style: 3,      // D
  orderNo: 4,    // E
  remark: 5,     // F
  orderQty: 6,   // G
  inspectedQty: 7, // H
  okQty: 8,      // I
  ngQty: 9,      // J
  defectRate: 10, // K
  // Defect categories start at column L (index 11)
  stitchingStart: 11,  // L
  stitchingEnd: 25,    // Z  (15 sub-defects)
  logoStart: 26,       // AA
  logoEnd: 29,         // AD (4 sub-defects)
  materialStart: 30,   // AE
  materialEnd: 34,     // AI (5 sub-defects)
  hardwareStart: 35,   // AJ
  hardwareEnd: 37,     // AL (3 sub-defects)
  appearanceStart: 38, // AM
  appearanceEnd: 42,   // AQ (5 sub-defects)
  zipperStart: 43,     // AR
  zipperEnd: 46,       // AU (4 sub-defects)
  webbingStart: 47,    // AV
  webbingEnd: 48,      // AW (2 sub-defects)
  otherStart: 49,      // AX
  otherEnd: 54,        // BC (6 sub-defects)
  preparationStart: 55, // BD
  preparationEnd: 70,   // BV (16 sub-defects)
  stitchDefect: 71,     // BW (1 sub-defect)
} as const;

const FIRST_DEFECT_COL = 11; // L
const LAST_DEFECT_COL = 71;  // BW
const TOTAL_SUBDEFECTS = LAST_DEFECT_COL - FIRST_DEFECT_COL + 1; // 61

export interface FQCRecord {
  id?: string;
  inspection_date: Date;
  line: string;
  inspector: string;
  style: string;
  order_no: string;
  remark: string;
  order_qty: number;
  inspected_qty: number;
  ok_qty: number;
  ng_qty: number;
  defect_rate: number;
  business_type: string;
  // Category-level defect counts
  defect_stitching: number;
  defect_logo: number;
  defect_material: number;
  defect_hardware: number;
  defect_appearance: number;
  defect_zipper: number;
  defect_webbing: number;
  defect_other: number;
  defect_preparation: number;
  defect_stitch_defect: number;
  total_defects: number;
  // All 61 individual sub-defect values from column L to BW
  sub_defects: number[];
  created_at?: Date;
}

function getCellValue(sheet: XLSX.WorkSheet, row: number, col: number): number | string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return 0;
  if (cell.t === 'n') return cell.v as number;
  if (cell.t === 'd') return cell.v as Date;
  if (cell.t === 's') return (cell.v as string).trim();
  const num = Number(cell.v);
  return isNaN(num) ? (cell.v as string).trim() : num;
}

function sumRange(sheet: XLSX.WorkSheet, row: number, startCol: number, endCol: number): number {
  let sum = 0;
  for (let c = startCol; c <= endCol; c++) {
    const val = getCellValue(sheet, row, c);
    if (typeof val === 'number') {
      sum += val;
    }
  }
  return sum;
}

function extractSubDefects(sheet: XLSX.WorkSheet, row: number): number[] {
  const subDefects: number[] = [];
  for (let c = FIRST_DEFECT_COL; c <= LAST_DEFECT_COL; c++) {
    const val = getCellValue(sheet, row, c);
    subDefects.push(typeof val === 'number' ? val : 0);
  }
  return subDefects;
}

function deriveBusinessType(orderNo: string): string {
  if (orderNo.toUpperCase().startsWith('PTOEM')) return 'PTOEM';
  if (orderNo.toUpperCase().startsWith('PTB2C')) return 'PTB2C';
  if (orderNo.toUpperCase().startsWith('PTGH')) return 'PTGH';
  return 'OTHER';
}

function isTotalRow(sheet: XLSX.WorkSheet, row: number): boolean {
  const remark = String(getCellValue(sheet, row, COL.remark));
  return remark.includes('合计') || remark.toLowerCase().includes('total');
}

function isValidDataRow(sheet: XLSX.WorkSheet, row: number): boolean {
  const dateVal = getCellValue(sheet, row, COL.date);
  if (!dateVal || dateVal === 0) return false;
  const styleVal = getCellValue(sheet, row, COL.style);
  if (!styleVal || String(styleVal).trim() === '') return false;
  return true;
}

export async function parseFQCExcel(
  buffer: ArrayBuffer
): Promise<{ date: Date; records: FQCRecord[]; businessType: string }> {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  const records: FQCRecord[] = [];
  let sheetDate = new Date();
  const businessTypes = new Set<string>();

  // Data rows start at row 3 (after title, headers, sub-defects)
  // Last row is total row - skip it
  const dataStartRow = 3;
  const dataEndRow = range.e.r - 1; // Exclude last row (total)

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    // Skip empty or invalid rows
    if (!isValidDataRow(sheet, r)) continue;
    // Skip total row just in case it's not the last row
    if (isTotalRow(sheet, r)) continue;

    const rawDate = getCellValue(sheet, r, COL.date);
    const inspectionDate = rawDate instanceof Date
      ? rawDate
      : new Date();

    // Use the first valid date as the sheet date
    if (records.length === 0 && inspectionDate instanceof Date) {
      sheetDate = inspectionDate;
    }

    const orderNo = String(getCellValue(sheet, r, COL.orderNo) || '').trim();
    const businessType = deriveBusinessType(orderNo);
    if (businessType !== 'OTHER') {
      businessTypes.add(businessType);
    }

    const defectStitching = sumRange(sheet, r, COL.stitchingStart, COL.stitchingEnd);
    const defectLogo = sumRange(sheet, r, COL.logoStart, COL.logoEnd);
    const defectMaterial = sumRange(sheet, r, COL.materialStart, COL.materialEnd);
    const defectHardware = sumRange(sheet, r, COL.hardwareStart, COL.hardwareEnd);
    const defectAppearance = sumRange(sheet, r, COL.appearanceStart, COL.appearanceEnd);
    const defectZipper = sumRange(sheet, r, COL.zipperStart, COL.zipperEnd);
    const defectWebbing = sumRange(sheet, r, COL.webbingStart, COL.webbingEnd);
    const defectOther = sumRange(sheet, r, COL.otherStart, COL.otherEnd);
    const defectPreparation = sumRange(sheet, r, COL.preparationStart, COL.preparationEnd);
    const defectStitchDefect = Number(getCellValue(sheet, r, COL.stitchDefect)) || 0;

    const totalDefects =
      defectStitching +
      defectLogo +
      defectMaterial +
      defectHardware +
      defectAppearance +
      defectZipper +
      defectWebbing +
      defectOther +
      defectPreparation +
      defectStitchDefect;

    const subDefects = extractSubDefects(sheet, r);

    records.push({
      inspection_date: inspectionDate,
      line: String(getCellValue(sheet, r, COL.line) || '').trim(),
      inspector: String(getCellValue(sheet, r, COL.inspector) || '').trim(),
      style: String(getCellValue(sheet, r, COL.style) || '').trim(),
      order_no: orderNo,
      remark: String(getCellValue(sheet, r, COL.remark) || '').trim(),
      order_qty: Number(getCellValue(sheet, r, COL.orderQty)) || 0,
      inspected_qty: Number(getCellValue(sheet, r, COL.inspectedQty)) || 0,
      ok_qty: Number(getCellValue(sheet, r, COL.okQty)) || 0,
      ng_qty: Number(getCellValue(sheet, r, COL.ngQty)) || 0,
      defect_rate: Number(getCellValue(sheet, r, COL.defectRate)) || 0,
      business_type: businessType,
      defect_stitching: defectStitching,
      defect_logo: defectLogo,
      defect_material: defectMaterial,
      defect_hardware: defectHardware,
      defect_appearance: defectAppearance,
      defect_zipper: defectZipper,
      defect_webbing: defectWebbing,
      defect_other: defectOther,
      defect_preparation: defectPreparation,
      defect_stitch_defect: defectStitchDefect,
      total_defects: totalDefects,
      sub_defects: subDefects,
      created_at: new Date(),
    });
  }

  // Determine primary business type from records
  let primaryBusinessType = 'OTHER';
  if (businessTypes.size === 1) {
    primaryBusinessType = Array.from(businessTypes)[0];
  } else if (businessTypes.size > 1) {
    // Use the most common business type
    const typeCounts: Record<string, number> = {};
    records.forEach((r) => {
      const bt = r.business_type;
      if (bt !== 'OTHER') {
        typeCounts[bt] = (typeCounts[bt] || 0) + 1;
      }
    });
    let maxCount = 0;
    for (const [bt, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        primaryBusinessType = bt;
      }
    }
  }

  return {
    date: sheetDate,
    records,
    businessType: primaryBusinessType,
  };
}

/**
 * Get the sub-defect name mapping for column index to name.
 * Returns an array of 61 strings mapping column index (0-60) to sub-defect name.
 */
export function getSubDefectNames(sheet: XLSX.WorkSheet): string[] {
  const names: string[] = [];
  for (let c = FIRST_DEFECT_COL; c <= LAST_DEFECT_COL; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c }); // Row 2 (0-indexed) = row 3 in Excel
    const cell = sheet[addr];
    if (cell && cell.v) {
      const raw = String(cell.v).trim();
      // Extract Chinese name (before English/Indonesian text)
      const chineseMatch = raw.match(/^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef、，。]+/);
      names.push(chineseMatch ? chineseMatch[0] : raw);
    } else {
      names.push(`sub_defect_${c}`);
    }
  }
  return names;
}

export { COL, FIRST_DEFECT_COL, LAST_DEFECT_COL, TOTAL_SUBDEFECTS };
