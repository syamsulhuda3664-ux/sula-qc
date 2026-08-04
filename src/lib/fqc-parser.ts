import * as XLSX from 'xlsx';

/**
 * Column index constants for the FQC Excel format
 * Expected layout:
 *   Row 0-2+: Header rows (auto-detected)
 *   Data rows: A=date, B=line, C=inspector, D=style, E=orderNo, F=remark,
 *             G=orderQty, H=inspectedQty, I=okQty, J=ngQty, K=defectRate
 *   L-BW: Defect sub-categories (61 columns)
 *   Last data row(s): May include total/summary row(s) — auto-detected and skipped
 */
const COL = {
  date: 0,        // A
  line: 1,        // B
  inspector: 2,   // C
  style: 3,       // D
  orderNo: 4,     // E
  remark: 5,      // F
  orderQty: 6,    // G
  inspectedQty: 7, // H
  okQty: 8,       // I
  ngQty: 9,       // J
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
  preparationEnd: 73,   // BV (19 sub-defects)
  stitchDefect: 74,     // BW (1 sub-defect)
} as const;

const FIRST_DEFECT_COL = 11; // L
const LAST_DEFECT_COL = 74;  // BW
const TOTAL_SUBDEFECTS = LAST_DEFECT_COL - FIRST_DEFECT_COL + 1; // 64

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

export interface ParseDebugInfo {
  sheetName: string;
  totalRows: number;
  totalCols: number;
  detectedDataStart: number;
  detectedDataEnd: number;
  skippedRows: number[];
  firstRowCells: Record<string, unknown>;
  sampleDates: unknown[];
  errors: string[];
}

export interface ParsedSheet {
  sheetName: string;
  date: Date;
  dateStr: string;
  records: FQCRecord[];
  businessType: string;
  debug?: ParseDebugInfo;
}

/**
 * Read a numeric cell value, handling Excel percentage format.
 * If the cell is formatted as percentage (z contains '%') and the raw value is
 * between 0 and 1 (exclusive), it returns value * 100.
 * Otherwise returns the raw numeric value.
 */
function getNumericValue(sheet: XLSX.WorkSheet, row: number, col: number): number {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell || cell.t !== 'n') return 0;
  const val = cell.v as number;
  // Detect percentage format: cell.z often contains '%' for percentage cells
  // Also check cell.w (formatted text) for '%' sign
  if (cell.z && String(cell.z).includes('%')) {
    // Excel stores 3.5% as 0.035
    if (val > 0 && val < 1) return Math.round(val * 10000) / 100;
  }
  if (cell.w && cell.w.includes('%')) {
    if (val > 0 && val < 1) return Math.round(val * 10000) / 100;
  }
  return val;
}

function getCellValue(sheet: XLSX.WorkSheet, row: number, col: number): number | string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return 0;
  if (cell.t === 'n') return cell.v as number;
  if (cell.t === 'd') return cell.v as Date;
  if (cell.t === 's') return (cell.v as string).trim();
  if (cell.t === 'b') return cell.v ? 1 : 0;
  const num = Number(cell.v);
  return isNaN(num) ? String(cell.v).trim() : num;
}

function getCellRaw(sheet: XLSX.WorkSheet, row: number, col: number): { v: unknown; t: string; w?: string } | null {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return null;
  return { v: cell.v, t: cell.t, w: cell.w };
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

/**
 * Robust date parser — handles Excel serial numbers, Date objects, and various text formats.
 */
function parseDateValue(raw: number | string | Date): Date | null {
  // Already a Date object (xlsx with cellDates: true)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw;
  }

  // Excel serial number (days since 1900-01-01, with the 1900 leap year bug)
  if (typeof raw === 'number') {
    if (raw <= 0) return null;
    // Convert Excel serial to JS Date
    // Excel epoch is 1899-12-30 (due to the 1900 leap year bug)
    const epoch = new Date(1899, 11, 30);
    const ms = epoch.getTime() + raw * 86400000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // String date — try multiple formats
  if (typeof raw === 'string' && raw.length > 0) {
    // Try ISO format: 2025-01-15 or 2025/01/15
    let d = new Date(raw.replace(/\//g, '-'));
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d;

    // Try DD/MM/YYYY or DD-MM-YYYY
    const parts = raw.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number);
      if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
        // If first part > 31, it's YYYY
        if (a > 31) {
          d = new Date(a, b - 1, c);
        } else if (c > 31) {
          // DD/MM/YYYY
          d = new Date(c, b - 1, a);
        } else {
          // Ambiguous — try DD/MM/YYYY first (common in Indonesia/Asia)
          d = new Date(c, b - 1, a);
          if (isNaN(d.getTime()) || d.getFullYear() < 2020) {
            d = new Date(c, a - 1, b); // Try MM/DD/YYYY
          }
        }
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d;
      }
    }

    // Last resort: let JS parse it
    d = new Date(raw);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d;
  }

  return null;
}

/**
 * Check if a row looks like a total/summary row.
 * Checks multiple columns, not just the remark column.
 */
function isTotalRow(sheet: XLSX.WorkSheet, row: number, maxCol: number): boolean {
  const totalKeywords = ['合计', 'total', 'TOTAL', 'Total', ' Grand Total', 'Subtotal', 'subtotal', ' keseluruhan', 'jumlah', 'JUMLAH'];

  // Check first several columns for total keywords
  for (let c = 0; c <= Math.min(maxCol, 10); c++) {
    const val = String(getCellValue(sheet, row, c)).toLowerCase();
    for (const kw of totalKeywords) {
      if (val.includes(kw.toLowerCase())) return true;
    }
  }

  // Also check if column A has a date but columns D (style) is empty and columns G-J have large numbers (sums)
  const styleVal = getCellValue(sheet, row, COL.style);
  const orderQty = Number(getCellValue(sheet, row, COL.orderQty));
  const inspectedQty = Number(getCellValue(sheet, row, COL.inspectedQty));

  if ((!styleVal || String(styleVal).trim() === '') && orderQty > 100 && inspectedQty > 100) {
    return true;
  }

  return false;
}

/**
 * Check if a row is a valid data row (has date and style code).
 */
function isValidDataRow(sheet: XLSX.WorkSheet, row: number): boolean {
  const dateVal = getCellValue(sheet, row, COL.date);
  const styleVal = getCellValue(sheet, row, COL.style);

  // Must have a style code
  if (!styleVal || String(styleVal).trim() === '') return false;

  // Date must be present and parseable
  if (!dateVal || dateVal === 0) return false;

  const parsedDate = parseDateValue(dateVal);
  if (!parsedDate) return false;

  return true;
}

/**
 * Auto-detect where data rows begin by scanning for the first row
 * that has both a valid date (col A) and a style code (col D).
 * Scans from row 0 up to row 20 (max header depth).
 */
function detectDataStartRow(sheet: XLSX.WorkSheet, maxRow: number): { row: number; reason: string } {
  for (let r = 0; r <= Math.min(maxRow, 20); r++) {
    const dateVal = getCellValue(sheet, r, COL.date);
    const styleVal = getCellValue(sheet, r, COL.style);
    const parsedDate = parseDateValue(dateVal);

    if (parsedDate && styleVal && String(styleVal).trim() !== '') {
      // Verify it's not a header row — check if col G (orderQty) is numeric
      const orderQty = getCellValue(sheet, r, COL.orderQty);
      if (typeof orderQty === 'number' && orderQty > 0) {
        return { row: r, reason: `Found valid data at row ${r} (date=${parsedDate.toISOString().split('T')[0]}, style=${styleVal}, orderQty=${orderQty})` };
      }
    }
  }
  return { row: 3, reason: 'Default: no valid data row found in first 21 rows, using row 3' };
}

/**
 * Auto-detect where data rows end by scanning backwards from the last row
 * to find the last valid data row (before any total/summary rows).
 */
function detectDataEndRow(sheet: XLSX.WorkSheet, maxRow: number, minRow: number): number {
  for (let r = maxRow; r >= minRow; r--) {
    if (isValidDataRow(sheet, r) && !isTotalRow(sheet, r, 10)) {
      return r;
    }
  }
  return maxRow;
}

/**
 * Parse a single sheet from an FQC Excel workbook.
 * Internal helper used by both parseFQCExcel (single-sheet) and parseFQCExcelMultiSheet.
 */
function parseSingleSheet(
  workbook: XLSX.WorkBook,
  sheetName: string
): { date: Date; records: FQCRecord[]; businessType: string; debug: ParseDebugInfo } {
  const debug: ParseDebugInfo = {
    sheetName,
    totalRows: 0,
    totalCols: 0,
    detectedDataStart: 0,
    detectedDataEnd: 0,
    skippedRows: [],
    firstRowCells: {},
    sampleDates: [],
    errors: [],
  };

  const sheet = workbook.Sheets[sheetName];

  if (!sheet || !sheet['!ref']) {
    debug.errors.push(`Sheet "${sheetName}" has no data range (!ref is empty)`);
    return { date: new Date(), records: [], businessType: 'OTHER', debug };
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  debug.totalRows = range.e.r - range.s.r + 1;
  debug.totalCols = range.e.c - range.s.c + 1;

  // Collect sample data from first few rows for debugging
  for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
    const rowKey = `row${r}`;
    debug.firstRowCells[rowKey] = {};
    for (let c = 0; c <= Math.min(range.e.c, 11); c++) {
      const raw = getCellRaw(sheet, r, c);
      if (raw) {
        const colLetter = XLSX.utils.encode_col(c);
        debug.firstRowCells[rowKey][colLetter] = {
          type: raw.t,
          value: raw.t === 'd' ? (raw.v as Date).toISOString() : raw.v,
          formatted: raw.w || undefined,
        };
      }
    }
  }

  // Auto-detect data start row
  const { row: dataStartRow, reason: startReason } = detectDataStartRow(sheet, range.e.r);
  debug.detectedDataStart = dataStartRow;
  debug.errors.push(`Data start detection: ${startReason}`);

  // Auto-detect data end row
  const dataEndRow = detectDataEndRow(sheet, range.e.r, dataStartRow);
  debug.detectedDataEnd = dataEndRow;

  const records: FQCRecord[] = [];
  let sheetDate = new Date();
  const businessTypes = new Set<string>();

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    // Skip total/summary rows
    if (isTotalRow(sheet, r, Math.min(range.e.c, 10))) {
      debug.skippedRows.push(r);
      continue;
    }

    // Skip invalid data rows
    if (!isValidDataRow(sheet, r)) {
      const dateVal = getCellValue(sheet, r, COL.date);
      const styleVal = getCellValue(sheet, r, COL.style);
      if (dateVal !== 0 && dateVal && String(dateVal).trim() !== '') {
        debug.skippedRows.push(r);
        const parsedDate = parseDateValue(dateVal);
        debug.errors.push(`Row ${r} skipped: date=${String(dateVal)} (parsed=${parsedDate ? 'ok' : 'FAIL'}), style=${String(styleVal)}`);
      }
      continue;
    }

    const rawDate = getCellValue(sheet, r, COL.date);
    const inspectionDate = parseDateValue(rawDate);

    if (!inspectionDate) {
      debug.errors.push(`Row ${r}: date parse failed for value ${JSON.stringify(rawDate)}`);
      continue;
    }

    // Collect sample dates for debugging
    if (debug.sampleDates.length < 5) {
      debug.sampleDates.push({
        row: r,
        raw: String(rawDate),
        parsed: inspectionDate.toISOString().split('T')[0],
      });
    }

    // Use the first valid date as the sheet date
    if (records.length === 0) {
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
      defectStitching + defectLogo + defectMaterial + defectHardware +
      defectAppearance + defectZipper + defectWebbing + defectOther +
      defectPreparation + defectStitchDefect;

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
      defect_rate: getNumericValue(sheet, r, COL.defectRate),
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

  if (records.length === 0) {
    debug.errors.push(`No valid records found. Scanned rows ${dataStartRow} to ${dataEndRow}. Total sheet rows: ${range.e.r + 1}.`);
  }

  // Determine primary business type from records
  let primaryBusinessType = 'OTHER';
  if (businessTypes.size === 1) {
    primaryBusinessType = Array.from(businessTypes)[0];
  } else if (businessTypes.size > 1) {
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

  return { date: sheetDate, records, businessType: primaryBusinessType, debug };
}

export async function parseFQCExcel(
  buffer: ArrayBuffer
): Promise<{ date: Date; records: FQCRecord[]; businessType: string; debug?: ParseDebugInfo }> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const result = parseSingleSheet(workbook, sheetName);
  return result;
}

/**
 * Parse ALL sheets in an Excel file. Each sheet is treated as one day's report.
 * Returns an array of ParsedSheet, one per sheet that contains valid records.
 */
export async function parseFQCExcelMultiSheet(
  buffer: ArrayBuffer
): Promise<ParsedSheet[]> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const results: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const parsed = parseSingleSheet(workbook, sheetName);
    if (parsed.records.length > 0) {
      results.push({
        sheetName,
        date: parsed.date,
        dateStr: parsed.date.toISOString().split('T')[0],
        records: parsed.records,
        businessType: parsed.businessType,
        debug: parsed.debug,
      });
    }
  }

  return results;
}

/**
 * Get the sub-defect name mapping for column index to name.
 * Returns an array of 61 strings mapping column index (0-60) to sub-defect name.
 */
export function getSubDefectNames(sheet: XLSX.WorkSheet): string[] {
  const names: string[] = [];
  for (let c = FIRST_DEFECT_COL; c <= LAST_DEFECT_COL; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    const cell = sheet[addr];
    if (cell && cell.v) {
      const raw = String(cell.v).trim();
      const chineseMatch = raw.match(/^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef、，。]+/);
      names.push(chineseMatch ? chineseMatch[0] : raw);
    } else {
      names.push(`sub_defect_${c}`);
    }
  }
  return names;
}

export { COL, FIRST_DEFECT_COL, LAST_DEFECT_COL, TOTAL_SUBDEFECTS };
