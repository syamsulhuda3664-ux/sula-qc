import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { extractLineSortKey } from './utils';
import { SUBDEFECT_DB_COLUMNS } from './db-schema';
import { SUBDEFECT_NAMES, SUBDEFECT_NAMES_ZH, getSubDefectCategory, CATEGORY_ZH, ACTION_TEMPLATES } from './rca-generator';
import { SUBDEFECT_ACTION_TEMPLATES } from './rca-subdefect-templates';
import { SUBDEFECT_ACTION_TEMPLATES_ZH } from './rca-subdefect-templates-zh';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportLang = 'zh' | 'en';

export interface ExportFilters {
  businessType?: string;
  dateFrom?: string;
  dateTo?: string;
  period?: string;
  productionLine?: string;
}

export interface ExcelExportResult {
  buffer: Uint8Array;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create a new workbook and apply the text watermark across the top rows */
function createBook(): XLSX.WorkBook {
  return XLSX.utils.book_new();
}

/**
 * Write a "SULA-QC" watermark in the title row.
 * Since xlsx has no native image watermark, we place large light-grey text
 * across the title row that reads "SULA-QC" as a diagonal hint.
 * We achieve this by adding extra cells with very light fill and a large-font
 * text string that overlaps the title area.
 */
function applyTextWatermark(
  ws: XLSX.WorkSheet,
  row: number,
  colStart: number,
  colEnd: number,
  text: string = 'SULA-QC',
): void {
  // Place the watermark text in a cell spanning the middle of the range
  const midCol = Math.floor((colStart + colEnd) / 2);
  const addr = XLSX.utils.encode_cell({ r: row, c: midCol });
  if (!ws[addr]) {
    ws[addr] = { t: 's', v: text };
  }
  // Apply a style to the cell: large font, light gray color
  // xlsx community edition only supports limited styling through
  // the `!cols` / `!rows` / cell-level `s` property, so we set the
  // font size and colour via the `s` property if available.
  // We use a light grey bold font as a visual watermark cue.
  const cell = ws[addr];
  if (cell) {
    cell.s = {
      font: {
        name: 'Arial',
        sz: 18,
        bold: true,
        color: { rgb: 'DDDDDD' },
      },
      alignment: {
        horizontal: 'center' as const,
        vertical: 'center' as const,
        textRotation: 0,
      },
    };
  }

  // Merge the cells across the watermark row for wide coverage
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({
    s: { r: row, c: colStart },
    e: { r: row, c: colEnd },
  });
}

/**
 * Set column widths for a worksheet
 */
function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((w) => ({ wch: w }));
}

/**
 * Write a row of values (strings/numbers) to the worksheet starting at a
 * given column.  Returns the address of the last cell written.
 */
function writeRow(
  ws: XLSX.WorkSheet,
  row: number,
  startCol: number,
  values: (string | number | null)[],
  style?: Partial<XLSX.CellStyle>,
): void {
  for (let i = 0; i < values.length; i++) {
    const c = startCol + i;
    const addr = XLSX.utils.encode_cell({ r: row, c: c });
    const val = values[i];
    if (val === null || val === undefined) continue;

    let cell: XLSX.CellObject;
    if (typeof val === 'number') {
      cell = { t: 'n', v: val };
    } else {
      cell = { t: 's', v: String(val) };
    }
    if (style) {
      cell.s = { ...style };
    }
    ws[addr] = cell;
  }
}

/**
 * Build a percentage display string.
 * If raw is 0.05 and we want "5.00%", pass 0.05.
 * For rates already stored as 0-100 (e.g. 5.5 = 5.5%), pass them directly.
 */
function fmtPct(value: number, asFraction = true): string {
  if (asFraction) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}

/**
 * Format a number with thousand separators
 */
function fmtNum(value: number): number {
  return value;
}

/**
 * Create a styled title row (company name) merged across columns.
 * Returns the next available row.
 */
function writeTitle(
  ws: XLSX.WorkSheet,
  title: string,
  colStart: number,
  colEnd: number,
): number {
  // Row 0: Watermark hint row (SULA-QC text, very light)
  applyTextWatermark(ws, 0, colStart, colEnd, 'SULA-QC');

  // Row 1: Actual title
  writeRow(ws, 1, colStart, [title], {
    font: { name: 'Arial', sz: 14, bold: true, color: { rgb: '333333' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  // Merge title cells
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: 1, c: colStart }, e: { r: 1, c: colEnd } });

  // Row 2: Blank separator
  return 3;
}

/** Common header style */
const HEADER_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

/** Subtotal row style */
const SUBTOTAL_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '333333' } },
  fill: { fgColor: { rgb: 'D9E2F3' } },
  alignment: { horizontal: 'center', vertical: 'center' },
};

/** Grand total row style */
const GRAND_TOTAL_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '333333' } },
  alignment: { horizontal: 'center', vertical: 'center' },
};

/** Normal data cell style */
const DATA_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10 },
  alignment: { vertical: 'center' },
};

// ---------------------------------------------------------------------------
// 1. FQC Daily Detail Excel
// ---------------------------------------------------------------------------

const FQC_DAILY_HEADERS = [
  'No / 序号',
  '日期 / Date',
  '生产线 / Line',
  '品检员 / Inspector',
  '款号 / Style',
  '订单号 / Order No.',
  '订单数量 / Order Qty',
  '检验数量 / Inspected',
  '合格数 / OK',
  '不良数 / NG',
  '不良率 / Defect Rate',
  '针车问题 / Stitching',
  'LOGO问题 / Logo',
  '面料问题 / Material',
  '五金问题 / Hardware',
  '外观问题 / Appearance',
  '拉链问题 / Zipper',
  '织带问题 / Webbing',
  '其它问题 / Other',
  '备料问题 / Preparation',
];

const FQC_DAILY_WIDTHS = [
  6, 14, 12, 14, 16, 20, 14, 14, 12, 10, 12,
  14, 12, 14, 12, 14, 12, 12, 12, 14,
];

/**
 * (Fallback) Original xlsx-based FQC daily export – not exported.
 */
function _exportFQCDailyExcelXlsx(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): ExcelExportResult {
  const wb = createBook();
  const ws: XLSX.WorkSheet = {};

  const totalCols = FQC_DAILY_HEADERS.length;
  let row = writeTitle(ws, '厦门市欣维发实业有限公司品质检验表\nFQC Daily Detail Report', 0, totalCols - 1);

  // Filter info row
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filterParts.length > 0) {
    writeRow(ws, row, 0, [filterParts.join('   |   ')], {
      font: { name: 'Arial', sz: 9, italic: true, color: { rgb: '666666' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
    row += 1;
  } else {
    row += 1;
  }

  // Headers
  writeRow(ws, row, 0, FQC_DAILY_HEADERS, HEADER_STYLE);
  const headerRow = row;
  row += 1;

  // Data rows – group by date for daily subtotals, sort by date then by production line
  const sortedData = [...data].sort((a, b) => {
    const da = String(a.inspection_date || '');
    const db = String(b.inspection_date || '');
    const dateComp = da.localeCompare(db);
    if (dateComp !== 0) return dateComp;
    // Same date: sort by production line in factory order
    const la = extractLineSortKey(String(a.line || a.production_line || ''));
    const lb = extractLineSortKey(String(b.line || b.production_line || ''));
    return la.localeCompare(lb);
  });

  let dateGroups: Record<string, Record<string, unknown>[]> = {};
  for (const record of sortedData) {
    const dKey = String(record.inspection_date || 'unknown');
    if (!dateGroups[dKey]) dateGroups[dKey] = [];
    dateGroups[dKey].push(record);
  }

  // Grand totals
  let grandOrderQty = 0, grandInspected = 0, grandOK = 0, grandNG = 0;
  let grandDefects: Record<string, number> = {
    defect_stitching: 0, defect_logo: 0, defect_material: 0,
    defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
    defect_webbing: 0, defect_other: 0, defect_preparation: 0,
  };
  let rowNum = 1;

  const dates = Object.keys(dateGroups).sort();

  for (const date of dates) {
    const group = dateGroups[date];
    let dayOrderQty = 0, dayInspected = 0, dayOK = 0, dayNG = 0;
    let dayDefects: Record<string, number> = {
      defect_stitching: 0, defect_logo: 0, defect_material: 0,
      defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
      defect_webbing: 0, defect_other: 0, defect_preparation: 0,
    };

    for (const rec of group) {
      const orderQty = Number(rec.order_qty) || 0;
      const inspectedQty = Number(rec.inspected_qty) || 0;
      const okQty = Number(rec.ok_qty) || 0;
      const ngQty = Number(rec.ng_qty) || 0;
      const defectRate = Number(rec.defect_rate) || 0;

      dayOrderQty += orderQty;
      dayInspected += inspectedQty;
      dayOK += okQty;
      dayNG += ngQty;

      for (const key of Object.keys(dayDefects)) {
        let val = Number(rec[key]) || 0;
        if (key === 'defect_stitching') {
          val += Number(rec.defect_stitch_defect) || 0;
        }
        dayDefects[key] += val;
      }

      // DB stores defect_rate as percentage — use directly
      const rateDisplay: string | number = `${defectRate.toFixed(2)}%`;

      const vals: (string | number)[] = [
        rowNum++,
        String(rec.inspection_date || ''),
        String(rec.production_line || ''),
        String(rec.inspector_name || ''),
        String(rec.style_code || ''),
        String(rec.order_no || ''),
        orderQty,
        inspectedQty,
        okQty,
        ngQty,
        rateDisplay,
        (Number(rec.defect_stitching) || 0) + (Number(rec.defect_stitch_defect) || 0),
        Number(rec.defect_logo) || 0,
        Number(rec.defect_material) || 0,
        Number(rec.defect_hardware) || 0,
        Number(rec.defect_appearance) || 0,
        Number(rec.defect_zipper) || 0,
        Number(rec.defect_webbing) || 0,
        Number(rec.defect_other) || 0,
        Number(rec.defect_preparation) || 0,
      ];
      writeRow(ws, row, 0, vals, DATA_STYLE);
      row++;
    }

    // Daily subtotal row
    const dayTotal = Object.values(dayDefects).reduce((a, b) => a + b, 0);
    const dayRate = dayInspected > 0 ? dayNG / dayInspected : 0;
    const subtotalVals: (string | number)[] = [
      '',
      `小计 Subtotal: ${date}`,
      '', '', '', '',
      dayOrderQty, dayInspected, dayOK, dayNG,
      fmtPct(dayRate, true),
      ...Object.values(dayDefects),
    ];
    writeRow(ws, row, 0, subtotalVals, SUBTOTAL_STYLE);
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: row, c: 1 }, e: { r: row, c: 5 } });
    row++;

    grandOrderQty += dayOrderQty;
    grandInspected += dayInspected;
    grandOK += dayOK;
    grandNG += dayNG;
    for (const key of Object.keys(grandDefects)) {
      grandDefects[key] += dayDefects[key];
    }
  }

  // Grand total row
  const grandDefectTotal = Object.values(grandDefects).reduce((a, b) => a + b, 0);
  const grandRate = grandInspected > 0 ? grandNG / grandInspected : 0;
  const grandVals: (string | number)[] = [
    '',
    '合计 GRAND TOTAL',
    '', '', '', '',
    grandOrderQty, grandInspected, grandOK, grandNG,
    fmtPct(grandRate, true),
    ...Object.values(grandDefects),
  ];
  writeRow(ws, row, 0, grandVals, GRAND_TOTAL_STYLE);
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 1 }, e: { r: row, c: 5 } });
  row++;

  // Final merge watermark (just a reminder)
  row += 1;
  writeRow(ws, row, 0, [`Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`], {
    font: { name: 'Arial', sz: 8, italic: true, color: { rgb: 'AAAAAA' } },
  });

  setColWidths(ws, FQC_DAILY_WIDTHS);

  // Set row heights for title rows
  ws['!rows'] = [
    { hpt: 24 }, // watermark row
    { hpt: 36 }, // title row
    { hpt: 8 },  // separator
  ];

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: totalCols - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, 'FQC日报明细 Daily Detail');

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const period = filters.dateFrom
    ? `${filters.dateFrom}_${filters.dateTo || 'all'}`
    : 'All';
  const fileName = `SULA-QC_FQC_Daily_${period}.xlsx`;

  return { buffer: new Uint8Array(buffer), fileName };
}

// ---------------------------------------------------------------------------
// 1b. FQC Daily Detail Excel – ExcelJS (async, professional theme)
// ---------------------------------------------------------------------------

/** Minimum column widths used when auto-fitting */
const FQC_DAILY_MIN_WIDTHS = [
  6, 14, 12, 14, 16, 20, 14, 14, 12, 10, 12,
  14, 12, 14, 12, 14, 12, 12, 12, 14,
];

/**
 * Estimate display width of a string, treating CJK characters as 2× width.
 */
function estimateStringWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) || 0;
    // CJK Unified Ideographs, CJK punctuation, full-width forms, etc.
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x20000 && code <= 0x2A6DF)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

export async function exportFQCDailyExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): Promise<ExcelExportResult> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('FQC日报明细 Daily Detail');

  const totalCols = FQC_DAILY_HEADERS.length;

  // -- Color constants (matching user reference file) --
  const MED_BLUE    = 'FF2B5F8A';   // Title bg
  const HEADER_BG   = 'FF1F4E79';   // Header & grand total bg
  const PALE_BLUE   = 'FFEDF2F9';   // Alternating row / filter bg
  const LIGHT_BLUE  = 'FFD6E4F0';   // Subtotal bg
  const WHITE_ARGB  = 'FFFFFFFF';   // White fill for alternating rows
  const GRAY_FOOTER = 'FF999999';   // Footer text
  const FILTER_TEXT = 'FF4A6FA5';   // Filter info text

  // Shared thin border (used on headers & data)
  const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };

  // ============ Row 1: Title (merged, height 63, bg #2B5F8A) ============
  const row1 = ws.getRow(1);
  row1.height = 63;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = row1.getCell(1);
  titleCell.value = '厦门市欣维发实业有限公司品质检验表\nFQC Daily Detail Report';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE_ARGB } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // ============ Row 2: Spacer (height 4) ============
  ws.getRow(2).height = 4;

  // ============ Row 3: Spacer (height ~3) ============
  ws.getRow(3).height = 3;

  // ============ Row 4: Filter info (height 13.4) ============
  let currentRow = 4;
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filters.productionLine) filterParts.push(`Line: ${filters.productionLine}`);

  const hasFilters = filterParts.length > 0;
  if (hasFilters) {
    const filterRow = ws.getRow(currentRow);
    filterRow.height = 13.4;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const fCell = filterRow.getCell(1);
    fCell.value = filterParts.join('   |   ');
    fCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    fCell.alignment = { vertical: 'middle' };
  }
  currentRow++; // move to header row (row 5 if no filters, row 5 if filters)

  // ============ Header row (height 43.5) ============
  const headerExcelRow = ws.getRow(currentRow);
  headerExcelRow.height = 43.5;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerExcelRow.getCell(c);
    cell.value = FQC_DAILY_HEADERS[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  // ============ Data processing ============
  const sortedData = [...data].sort((a, b) => {
    const da = String(a.inspection_date || '');
    const db = String(b.inspection_date || '');
    const dateComp = db.localeCompare(da); // DESC — match web page
    if (dateComp !== 0) return dateComp;
    const la = extractLineSortKey(String(a.line || a.production_line || ''));
    const lb = extractLineSortKey(String(b.line || b.production_line || ''));
    return la.localeCompare(lb);
  });

  const dateGroups: Record<string, Record<string, unknown>[]> = {};
  for (const record of sortedData) {
    const dKey = String((record.inspection_date || 'unknown').toString().split('T')[0]);
    if (!dateGroups[dKey]) dateGroups[dKey] = [];
    dateGroups[dKey].push(record);
  }

  let grandOrderQty = 0, grandInspected = 0, grandOK = 0, grandNG = 0;
  const grandDefects: Record<string, number> = {
    defect_stitching: 0, defect_logo: 0, defect_material: 0,
    defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
    defect_webbing: 0, defect_other: 0, defect_preparation: 0,
  };
  let rowNum = 1;

  const dates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a)); // DESC

  // Number columns (1-indexed): No(1), Order Qty(7), Inspected(8), OK(9), NG(10), Rate(11), defects(12-20)
  const numberColSet = new Set<number>([1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

  for (const date of dates) {
    const group = dateGroups[date];
    let dayOrderQty = 0, dayInspected = 0, dayOK = 0, dayNG = 0;
    const dayDefects: Record<string, number> = {
      defect_stitching: 0, defect_logo: 0, defect_material: 0,
      defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
      defect_webbing: 0, defect_other: 0, defect_preparation: 0,
    };

    for (const rec of group) {
      const orderQty = Number(rec.order_qty) || 0;
      const inspectedQty = Number(rec.inspected_qty) || 0;
      const okQty = Number(rec.ok_qty) || 0;
      const ngQty = Number(rec.ng_qty) || 0;
      const defectRate = Number(rec.defect_rate) || 0;

      dayOrderQty += orderQty;
      dayInspected += inspectedQty;
      dayOK += okQty;
      dayNG += ngQty;

      for (const key of Object.keys(dayDefects)) {
        let val = Number(rec[key]) || 0;
        if (key === 'defect_stitching') {
          val += Number(rec.defect_stitch_defect) || 0;
        }
        dayDefects[key] += val;
      }

      // DB stores defect_rate as percentage (e.g. 0.47 = 0.47%, 2.06 = 2.06%)
      // Use directly — same as web display. Do NOT treat as fraction.
      const rateDisplay = `${defectRate.toFixed(2)}%`;

      const vals: (string | number)[] = [
        rowNum,
        String(rec.inspection_date || ''),
        String(rec.production_line || ''),
        String(rec.inspector_name || ''),
        String(rec.style_code || ''),
        String(rec.order_no || ''),
        orderQty,
        inspectedQty,
        okQty,
        ngQty,
        rateDisplay,
        (Number(rec.defect_stitching) || 0) + (Number(rec.defect_stitch_defect) || 0),
        Number(rec.defect_logo) || 0,
        Number(rec.defect_material) || 0,
        Number(rec.defect_hardware) || 0,
        Number(rec.defect_appearance) || 0,
        Number(rec.defect_zipper) || 0,
        Number(rec.defect_webbing) || 0,
        Number(rec.defect_other) || 0,
        Number(rec.defect_preparation) || 0,
      ];

      // Alternating: odd rows → pale blue, even rows → white (matching reference)
      const bgColor = rowNum % 2 === 1 ? PALE_BLUE : WHITE_ARGB;

      const excelRow = ws.getRow(currentRow);
      excelRow.height = 20;
      for (let c = 1; c <= totalCols; c++) {
        const cell = excelRow.getCell(c);
        const val = vals[c - 1];
        cell.value = typeof val === 'number' ? val : String(val);
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = numberColSet.has(c)
          ? { horizontal: 'right', vertical: 'middle' }
          : { horizontal: 'left', vertical: 'middle' };
        cell.border = thinBorder;
      }
      currentRow++;
      rowNum++;
    }

    // Daily subtotal row
    const dayRate = dayInspected > 0 ? dayNG / dayInspected : 0;
    const subtotalVals: (string | number)[] = [
      '',
      `小计 Subtotal: ${date}`,
      '', '', '', '',
      dayOrderQty, dayInspected, dayOK, dayNG,
      fmtPct(dayRate, true),
      ...Object.values(dayDefects),
    ];

    const subtotalExcelRow = ws.getRow(currentRow);
    subtotalExcelRow.height = 22;
    ws.mergeCells(currentRow, 2, currentRow, 6);
    for (let c = 1; c <= totalCols; c++) {
      const cell = subtotalExcelRow.getCell(c);
      if (c === 1) {
        cell.value = '';
      } else if (c >= 7 && c <= 20 && typeof subtotalVals[c - 1] === 'number') {
        cell.value = subtotalVals[c - 1] as number;
      } else {
        cell.value = subtotalVals[c - 1] !== undefined ? String(subtotalVals[c - 1]) : '';
      }
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      cell.alignment = numberColSet.has(c)
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }
    currentRow++;

    grandOrderQty += dayOrderQty;
    grandInspected += dayInspected;
    grandOK += dayOK;
    grandNG += dayNG;
    for (const key of Object.keys(grandDefects)) {
      grandDefects[key] += dayDefects[key];
    }
  }

  // ============ Grand total row (height 25) ============
  const grandRate = grandInspected > 0 ? grandNG / grandInspected : 0;
  const grandVals: (string | number)[] = [
    '',
    '合计 GRAND TOTAL',
    '', '', '', '',
    grandOrderQty, grandInspected, grandOK, grandNG,
    fmtPct(grandRate, true),
    ...Object.values(grandDefects),
  ];

  const grandExcelRow = ws.getRow(currentRow);
  grandExcelRow.height = 25;
  ws.mergeCells(currentRow, 2, currentRow, 6);
  for (let c = 1; c <= totalCols; c++) {
    const cell = grandExcelRow.getCell(c);
    if (c === 1) {
      cell.value = '';
    } else if (c >= 7 && c <= 20 && typeof grandVals[c - 1] === 'number') {
      cell.value = grandVals[c - 1] as number;
    } else {
      cell.value = grandVals[c - 1] !== undefined ? String(grandVals[c - 1]) : '';
    }
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = numberColSet.has(c)
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'left', vertical: 'middle' };
    cell.border = thinBorder;
  }
  currentRow++;

  // ============ Footer (1 blank row gap) ============
  currentRow++;
  const footerRow = ws.getRow(currentRow);
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const footerCell = footerRow.getCell(1);
  footerCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // ============ Column widths (exact values from user reference file) ============
  const refWidths = [
    5.0,             // A: No
    12.36328125,     // B: Date
    26.36328125,     // C: Line
    10.36328125,     // D: Inspector
    18.1796875,      // E: Style
    20.0,            // F: Order No.
    12.08984375,     // G: Order Qty
    15.54296875,     // H: Inspected
    10.54296875,     // I: OK
    9.6328125,       // J: NG
    11.54296875,     // K: Defect Rate
    11.90625,        // L: Stitching
    8.43,            // M: Logo (default)
    8.43,            // N: Material
    8.43,            // O: Hardware
    8.43,            // P: Appearance
    8.43,            // Q: Zipper
    8.43,            // R: Webbing
    8.43,            // S: Other
    8.43,            // T: Preparation
  ];
  for (let c = 0; c < totalCols; c++) {
    ws.getColumn(c + 1).width = refWidths[c] || 8.43;
  }

  // ============ Generate buffer ============
  const buffer = await wb.xlsx.writeBuffer();
  const period = filters.dateFrom
    ? `${filters.dateFrom}_${filters.dateTo || 'all'}`
    : 'All';
  const fileName = `SULA-QC_FQC_Daily_${period}.xlsx`;

  return { buffer: new Uint8Array(buffer as ArrayBuffer), fileName };
}

// ---------------------------------------------------------------------------
// 2. FQC Defect Analysis Excel
// ---------------------------------------------------------------------------

export function exportFQCAnalysisExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): ExcelExportResult {
  const wb = createBook();

  // ---- Sheet 1: Category Summary ----
  const ws1: XLSX.WorkSheet = {};
  const totalCols = 6;
  let row = writeTitle(ws1, '厦门市欣维发实业有限公司品质检验表\nFQC Defect Analysis 缺陷分析报告', 0, totalCols - 1);

  // Filter info
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filterParts.length > 0) {
    writeRow(ws1, row, 0, [filterParts.join('   |   ')], {
      font: { name: 'Arial', sz: 9, italic: true, color: { rgb: '666666' } },
    });
    ws1['!merges'] = ws1['!merges'] || [];
    ws1['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
    row += 2;
  } else {
    row += 2;
  }

  // Section A: Category Summary
  writeRow(ws1, row, 0, ['A. 缺陷类别汇总 / Defect Category Summary'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws1['!merges'] = ws1['!merges'] || [];
  ws1['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  const catHeaders = [
    '排名 / Rank',
    '缺陷类别 / Category',
    '缺陷数 / Defect Count',
    '占比 / Percentage',
    'PPM',
    '备注 / Remark',
  ];
  writeRow(ws1, row, 0, catHeaders, HEADER_STYLE);
  row++;

  // Aggregate category totals
  const CAT_KEYS = [
    { key: 'defect_stitching', name: '针车问题 / Stitching' },
    { key: 'defect_logo', name: 'LOGO问题 / Logo' },
    { key: 'defect_material', name: '面料问题 / Material' },
    { key: 'defect_hardware', name: '五金问题 / Hardware' },
    { key: 'defect_appearance', name: '外观问题 / Appearance' },
    { key: 'defect_zipper', name: '拉链问题 / Zipper' },
    { key: 'defect_webbing', name: '织带问题 / Webbing' },
    { key: 'defect_other', name: '其它问题 / Other' },
    { key: 'defect_preparation', name: '备料问题 / Preparation' },
    // defect_stitch_defect merged into defect_stitching
  ];

  const catTotals: Record<string, number> = {};
  for (const cat of CAT_KEYS) catTotals[cat.key] = 0;
  let totalInspected = 0;

  for (const r of data) {
    for (const cat of CAT_KEYS) {
      let val = Number(r[cat.key]) || 0;
      // Merge defect_stitch_defect into defect_stitching
      if (cat.key === 'defect_stitching') {
        val += Number(r.defect_stitch_defect) || 0;
      }
      catTotals[cat.key] += val;
    }
    totalInspected += Number(r.inspected_qty) || 0;
  }

  const grandTotalDefects = Object.values(catTotals).reduce((a, b) => a + b, 0);

  const sortedCats = CAT_KEYS.map((cat) => ({
    ...cat,
    count: catTotals[cat.key],
  })).sort((a, b) => b.count - a.count);

  for (let i = 0; i < sortedCats.length; i++) {
    const cat = sortedCats[i];
    const pct = grandTotalDefects > 0
      ? `${((cat.count / grandTotalDefects) * 100).toFixed(2)}%`
      : '0.00%';
    const ppm = totalInspected > 0
      ? Math.round((cat.count / totalInspected) * 1_000_000)
      : 0;
    writeRow(ws1, row, 0, [i + 1, cat.name, cat.count, pct, ppm, ''], DATA_STYLE);
    row++;
  }

  // Grand total for category table
  writeRow(ws1, row, 0, ['', '合计 / Total', grandTotalDefects, '100.00%', '', ''], SUBTOTAL_STYLE);
  row++;

  // Section B: Top 20 Sub-defects
  row += 1;
  writeRow(ws1, row, 0, ['B. 子缺陷排名TOP20 / Top 20 Sub-Defects'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws1['!merges'] = ws1['!merges'] || [];
  ws1['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  const subHeaders = [
    '排名 / Rank',
    '子缺陷 / Sub-Defect',
    '类别 / Category',
    '数量 / Count',
    '占比 / Percentage',
  ];
  writeRow(ws1, row, 0, subHeaders, HEADER_STYLE);
  row++;

  // Aggregate sub-defects from individual sub_* columns (DB has 61 columns, not a JSON array)
  // Import at top: import { SUBDEFECT_DB_COLUMNS } from '@/lib/db-schema';
  // We read the raw DB rows here so we need to sum each sub_* column directly.
  // Reuse the same default names list for display.
  const subDefectCounts: Record<string, { count: number; category: string }> = {};
  const SUBDEFECT_DEFAULT_NAMES: { name: string; category: string }[] = [
    ...SUBDEFECT_DB_COLUMNS.map((col, i) => {
      const cat = getSubDefectCategory(i);
      const nameEn = SUBDEFECT_NAMES[i] || col;
      const nameZh = SUBDEFECT_NAMES_ZH[i] || col;
      const catZh = CATEGORY_ZH[cat.category] || cat.category;
      return { name: `${nameZh} / ${nameEn}`, category: `${catZh}问题 / ${cat.category}` };
    }),
  ];

  for (const r of data) {
    // DB rows have individual sub_* columns — iterate SUBDEFECT_DB_COLUMNS
    // We import the column names inline here to avoid a top-level import
    // that would bloat the already large file.
    const subCols = SUBDEFECT_DB_COLUMNS;
    for (let i = 0; i < subCols.length; i++) {
      const count = Number(r[subCols[i]]) || 0;
      if (count > 0) {
        const info = SUBDEFECT_DEFAULT_NAMES[i];
        const key = info.name;
        if (!subDefectCounts[key]) {
          subDefectCounts[key] = { count: 0, category: info.category };
        }
        subDefectCounts[key].count += count;
      }
    }
  }

  const topSubDefects = Object.entries(subDefectCounts)
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  for (let i = 0; i < topSubDefects.length; i++) {
    const sd = topSubDefects[i];
    const pct = grandTotalDefects > 0
      ? `${((sd.count / grandTotalDefects) * 100).toFixed(2)}%`
      : '0.00%';
    writeRow(ws1, row, 0, [i + 1, sd.name, sd.category, sd.count, pct], DATA_STYLE);
    row++;
  }

  // Section C: Top 15 Styles
  row += 1;
  writeRow(ws1, row, 0, ['C. 款号缺陷排名TOP15 / Top 15 Styles by Defects'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws1['!merges'] = ws1['!merges'] || [];
  ws1['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  const styleHeaders = [
    '排名 / Rank',
    '款号 / Style',
    '缺陷数 / Defect Count',
    '检验数量 / Inspected Qty',
    '不良率 / Defect Rate',
  ];
  writeRow(ws1, row, 0, styleHeaders, HEADER_STYLE);
  row++;

  const styleAgg: Record<string, { defects: number; inspected: number }> = {};
  for (const r of data) {
    const style = String(r.style_code || 'Unknown');
    if (!styleAgg[style]) styleAgg[style] = { defects: 0, inspected: 0 };
    // Compute from category columns (DB has no total_defects)
    const rowDef = ((Number(r.defect_stitching) || 0) + (Number(r.defect_stitch_defect) || 0)) + (Number(r.defect_logo) || 0) + (Number(r.defect_material) || 0) + (Number(r.defect_hardware) || 0) + (Number(r.defect_appearance) || 0) + (Number(r.defect_zipper) || 0) + (Number(r.defect_webbing) || 0) + (Number(r.defect_other) || 0) + (Number(r.defect_preparation) || 0);
    styleAgg[style].defects += rowDef;
    styleAgg[style].inspected += Number(r.inspected_qty) || 0;
  }

  const topStyles = Object.entries(styleAgg)
    .map(([style, info]) => ({ style, ...info }))
    .sort((a, b) => b.defects - a.defects)
    .slice(0, 15);

  for (let i = 0; i < topStyles.length; i++) {
    const s = topStyles[i];
    const rate = s.inspected > 0
      ? `${((s.defects / s.inspected) * 100).toFixed(2)}%`
      : '0.00%';
    writeRow(ws1, row, 0, [i + 1, s.style, s.defects, s.inspected, rate], DATA_STYLE);
    row++;
  }

  // Footer
  row += 1;
  writeRow(ws1, row, 0, [`Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`], {
    font: { name: 'Arial', sz: 8, italic: true, color: { rgb: 'AAAAAA' } },
  });

  setColWidths(ws1, [11.82, 36.0, 20.45, 21.73, 19.36, 16.0]);
  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: totalCols - 1 } });
  XLSX.utils.book_append_sheet(wb, ws1, '缺陷分析 Analysis');

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const period = filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All';
  return { buffer: new Uint8Array(buffer), fileName: `SULA-QC_FQC_Analysis_${period}.xlsx` };
}

// ---------------------------------------------------------------------------
// 2b. FQC Combined Export: Sheet 1 = FQC Daily (ExcelJS), Sheet 2 = FQC Analysis (XLSX)
//     Since ExcelJS and XLSX produce different buffer formats, we build Sheet 1
//     with ExcelJS, then convert the XLSX-based Analysis sheet into an
//     ExcelJS worksheet to keep everything in one workbook.
// ---------------------------------------------------------------------------

export async function exportFQCAnalysisCombinedExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): Promise<ExcelExportResult> {
  // ---- Create the combined workbook ----
  const wb = new ExcelJS.Workbook();

  // Sheet 1: FQC Daily
  const ws1 = wb.addWorksheet('FQC日报明细 Daily Detail');
  await buildFQCDailySheet(wb, ws1, data, filters);

  // Sheet 2: FQC Defect Analysis
  const ws2 = wb.addWorksheet('缺陷分析 Analysis');
  buildFQCAnalysisSheet(ws2, data, filters);

  const buffer = await wb.xlsx.writeBuffer();
  const period = filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All';
  return { buffer: new Uint8Array(buffer as ArrayBuffer), fileName: `SULA-QC_FQC_Analysis_Report_${period}.xlsx` };
}

// Helper: build FQC Daily sheet in ExcelJS (extracted from exportFQCDailyExcel)
async function buildFQCDailySheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  data: Record<string, unknown>[],
  filters: ExportFilters,
): Promise<void> {
  const totalCols = FQC_DAILY_HEADERS.length;

  const MED_BLUE    = 'FF2B5F8A';
  const HEADER_BG   = 'FF1F4E79';
  const PALE_BLUE   = 'FFEDF2F9';
  const LIGHT_BLUE  = 'FFD6E4F0';
  const WHITE_ARGB  = 'FFFFFFFF';
  const GRAY_FOOTER = 'FF999999';
  const FILTER_TEXT = 'FF4A6FA5';

  const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };

  // Row 1: Title
  const row1 = ws.getRow(1);
  row1.height = 63;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = row1.getCell(1);
  titleCell.value = '厦门市欣维发实业有限公司品质检验表\nFQC Daily Detail Report';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE_ARGB } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Row 2-3: Spacers
  ws.getRow(2).height = 4;
  ws.getRow(3).height = 3;

  // Row 4: Filter info
  let currentRow = 4;
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filters.productionLine) filterParts.push(`Line: ${filters.productionLine}`);

  if (filterParts.length > 0) {
    const filterRow = ws.getRow(currentRow);
    filterRow.height = 13.4;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const fCell = filterRow.getCell(1);
    fCell.value = filterParts.join('   |   ');
    fCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    fCell.alignment = { vertical: 'middle' };
  }
  currentRow++;

  // Header row
  const headerExcelRow = ws.getRow(currentRow);
  headerExcelRow.height = 43.5;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerExcelRow.getCell(c);
    cell.value = FQC_DAILY_HEADERS[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  // Data processing
  const sortedData = [...data].sort((a, b) => {
    const da = String(a.inspection_date || '');
    const db = String(b.inspection_date || '');
    const dateComp = da.localeCompare(db);
    if (dateComp !== 0) return dateComp;
    const la = extractLineSortKey(String(a.line || a.production_line || ''));
    const lb = extractLineSortKey(String(b.line || b.production_line || ''));
    return la.localeCompare(lb);
  });

  const dateGroups: Record<string, Record<string, unknown>[]> = {};
  for (const record of sortedData) {
    const dKey = String(record.inspection_date || 'unknown');
    if (!dateGroups[dKey]) dateGroups[dKey] = [];
    dateGroups[dKey].push(record);
  }

  let grandOrderQty = 0, grandInspected = 0, grandOK = 0, grandNG = 0;
  const grandDefects: Record<string, number> = {
    defect_stitching: 0, defect_logo: 0, defect_material: 0,
    defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
    defect_webbing: 0, defect_other: 0, defect_preparation: 0,
  };
  let rowNum = 1;
  const dates = Object.keys(dateGroups).sort();
  const numberColSet = new Set<number>([1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

  for (const date of dates) {
    const group = dateGroups[date];
    let dayOrderQty = 0, dayInspected = 0, dayOK = 0, dayNG = 0;
    const dayDefects: Record<string, number> = {
      defect_stitching: 0, defect_logo: 0, defect_material: 0,
      defect_hardware: 0, defect_appearance: 0, defect_zipper: 0,
      defect_webbing: 0, defect_other: 0, defect_preparation: 0,
    };

    for (const rec of group) {
      const orderQty = Number(rec.order_qty) || 0;
      const inspectedQty = Number(rec.inspected_qty) || 0;
      const okQty = Number(rec.ok_qty) || 0;
      const ngQty = Number(rec.ng_qty) || 0;
      const defectRate = Number(rec.defect_rate) || 0;

      dayOrderQty += orderQty;
      dayInspected += inspectedQty;
      dayOK += okQty;
      dayNG += ngQty;

      for (const key of Object.keys(dayDefects)) {
        let val = Number(rec[key]) || 0;
        if (key === 'defect_stitching') {
          val += Number(rec.defect_stitch_defect) || 0;
        }
        dayDefects[key] += val;
      }

      const rateDisplay = `${defectRate.toFixed(2)}%`;

      const vals: (string | number)[] = [
        rowNum,
        String(rec.inspection_date || ''),
        String(rec.production_line || ''),
        String(rec.inspector_name || ''),
        String(rec.style_code || ''),
        String(rec.order_no || ''),
        orderQty, inspectedQty, okQty, ngQty, rateDisplay,
        (Number(rec.defect_stitching) || 0) + (Number(rec.defect_stitch_defect) || 0),
        Number(rec.defect_logo) || 0,
        Number(rec.defect_material) || 0,
        Number(rec.defect_hardware) || 0,
        Number(rec.defect_appearance) || 0,
        Number(rec.defect_zipper) || 0,
        Number(rec.defect_webbing) || 0,
        Number(rec.defect_other) || 0,
        Number(rec.defect_preparation) || 0,
      ];

      const bgColor = rowNum % 2 === 1 ? PALE_BLUE : WHITE_ARGB;
      const excelRow = ws.getRow(currentRow);
      excelRow.height = 20;
      for (let c = 1; c <= totalCols; c++) {
        const cell = excelRow.getCell(c);
        const val = vals[c - 1];
        cell.value = typeof val === 'number' ? val : String(val);
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = numberColSet.has(c)
          ? { horizontal: 'right', vertical: 'middle' }
          : { horizontal: 'left', vertical: 'middle' };
        cell.border = thinBorder;
      }
      currentRow++;
      rowNum++;
    }

    // Daily subtotal
    const dayRate = dayInspected > 0 ? dayNG / dayInspected : 0;
    const subtotalVals: (string | number)[] = [
      '', `小计 Subtotal: ${date}`, '', '', '', '',
      dayOrderQty, dayInspected, dayOK, dayNG,
      fmtPct(dayRate, true),
      ...Object.values(dayDefects),
    ];
    const subtotalExcelRow = ws.getRow(currentRow);
    subtotalExcelRow.height = 22;
    ws.mergeCells(currentRow, 2, currentRow, 6);
    for (let c = 1; c <= totalCols; c++) {
      const cell = subtotalExcelRow.getCell(c);
      if (c === 1) {
        cell.value = '';
      } else if (c >= 7 && c <= 20 && typeof subtotalVals[c - 1] === 'number') {
        cell.value = subtotalVals[c - 1] as number;
      } else {
        cell.value = subtotalVals[c - 1] !== undefined ? String(subtotalVals[c - 1]) : '';
      }
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      cell.alignment = numberColSet.has(c)
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }
    currentRow++;

    grandOrderQty += dayOrderQty;
    grandInspected += dayInspected;
    grandOK += dayOK;
    grandNG += dayNG;
    for (const key of Object.keys(grandDefects)) {
      grandDefects[key] += dayDefects[key];
    }
  }

  // Grand total
  const grandRate = grandInspected > 0 ? grandNG / grandInspected : 0;
  const grandVals: (string | number)[] = [
    '', '合计 GRAND TOTAL', '', '', '', '',
    grandOrderQty, grandInspected, grandOK, grandNG,
    fmtPct(grandRate, true),
    ...Object.values(grandDefects),
  ];
  const grandExcelRow = ws.getRow(currentRow);
  grandExcelRow.height = 25;
  ws.mergeCells(currentRow, 2, currentRow, 6);
  for (let c = 1; c <= totalCols; c++) {
    const cell = grandExcelRow.getCell(c);
    if (c === 1) {
      cell.value = '';
    } else if (c >= 7 && c <= 20 && typeof grandVals[c - 1] === 'number') {
      cell.value = grandVals[c - 1] as number;
    } else {
      cell.value = grandVals[c - 1] !== undefined ? String(grandVals[c - 1]) : '';
    }
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = numberColSet.has(c)
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'left', vertical: 'middle' };
    cell.border = thinBorder;
  }
  currentRow++;

  // Footer
  currentRow++;
  const footerRow = ws.getRow(currentRow);
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const footerCell = footerRow.getCell(1);
  footerCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // Column widths
  const refWidths = [
    5.0,             // A: No
    12.36328125,     // B: Date
    26.36328125,     // C: Line
    10.36328125,     // D: Inspector
    18.1796875,      // E: Style
    20.0,            // F: Order No.
    12.08984375,     // G: Order Qty
    15.54296875,     // H: Inspected
    10.54296875,     // I: OK
    9.6328125,       // J: NG
    11.54296875,     // K: Defect Rate
    11.90625,        // L: Stitching
    8.453125,        // M: Logo
    11.7265625,      // N: Material
    13.0,            // O: Hardware
    13.0,            // P: Appearance
    13.0,            // Q: Zipper
    13.0,            // R: Webbing
    13.0,            // S: Other
    13.0,            // T: Preparation
  ];
  for (let c = 0; c < totalCols; c++) {
    ws.getColumn(c + 1).width = refWidths[c] || 8.43;
  }
}

// Helper: build FQC Analysis sheet in ExcelJS
function buildFQCAnalysisSheet(
  ws: ExcelJS.Worksheet,
  data: Record<string, unknown>[],
  filters: ExportFilters,
): void {
  const MED_BLUE    = 'FF2B5F8A';
  const HEADER_BG   = 'FF1F4E79';
  const PALE_BLUE   = 'FFEDF2F9';
  const LIGHT_BLUE  = 'FFD6E4F0';
  const WHITE_ARGB  = 'FFFFFFFF';
  const GRAY_FOOTER = 'FF999999';
  const FILTER_TEXT = 'FF4A6FA5';

  const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };

  // ---- Title ----
  const totalCols = 6;
  const row1 = ws.getRow(1);
  row1.height = 50;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = row1.getCell(1);
  titleCell.value = '厦门市欣维发实业有限公司品质检验表\nFQC Defect Analysis 缺陷分析报告';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE_ARGB } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getRow(2).height = 4;
  let currentRow = 3;

  // Filter info
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filterParts.length > 0) {
    const filterRow = ws.getRow(currentRow);
    filterRow.height = 13.4;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const fCell = filterRow.getCell(1);
    fCell.value = filterParts.join('   |   ');
    fCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    fCell.alignment = { vertical: 'middle' };
    currentRow++;
  } else {
    currentRow++;
  }

  // ---- Aggregate data ----
  const CAT_KEYS = [
    { key: 'defect_stitching', name: '针车问题 / Stitching' },
    { key: 'defect_logo', name: 'LOGO问题 / Logo' },
    { key: 'defect_material', name: '面料问题 / Material' },
    { key: 'defect_hardware', name: '五金问题 / Hardware' },
    { key: 'defect_appearance', name: '外观问题 / Appearance' },
    { key: 'defect_zipper', name: '拉链问题 / Zipper' },
    { key: 'defect_webbing', name: '织带问题 / Webbing' },
    { key: 'defect_other', name: '其它问题 / Other' },
    { key: 'defect_preparation', name: '备料问题 / Preparation' },
  ];

  const catTotals: Record<string, number> = {};
  for (const cat of CAT_KEYS) catTotals[cat.key] = 0;
  let totalInspected = 0;

  for (const r of data) {
    for (const cat of CAT_KEYS) {
      let val = Number(r[cat.key]) || 0;
      if (cat.key === 'defect_stitching') val += Number(r.defect_stitch_defect) || 0;
      catTotals[cat.key] += val;
    }
    totalInspected += Number(r.inspected_qty) || 0;
  }

  const grandTotalDefects = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const sortedCats = CAT_KEYS.map((cat) => ({ ...cat, count: catTotals[cat.key] }))
    .sort((a, b) => b.count - a.count);

  // ---- Section A: Category Summary ----
  currentRow++;
  const sectionARow = ws.getRow(currentRow);
  sectionARow.height = 22;
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const sectionACell = sectionARow.getCell(1);
  sectionACell.value = 'A. 缺陷类别汇总 / Defect Category Summary';
  sectionACell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  sectionACell.alignment = { vertical: 'middle' };
  currentRow++;

  const catHeaders = ['排名 / Rank', '缺陷类别 / Category', '缺陷数 / Defect Count', '占比 / Percentage', 'PPM', '备注 / Remark'];
  const catHeaderRow = ws.getRow(currentRow);
  catHeaderRow.height = 28;
  for (let c = 1; c <= totalCols; c++) {
    const cell = catHeaderRow.getCell(c);
    cell.value = catHeaders[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  for (let i = 0; i < sortedCats.length; i++) {
    const cat = sortedCats[i];
    const pct = grandTotalDefects > 0 ? ((cat.count / grandTotalDefects) * 100).toFixed(2) + '%' : '0.00%';
    const ppm = totalInspected > 0 ? Math.round((cat.count / totalInspected) * 1_000_000) : 0;
    const bgColor = i % 2 === 0 ? PALE_BLUE : WHITE_ARGB;

    const excelRow = ws.getRow(currentRow);
    excelRow.height = 20;
    const vals: (string | number)[] = [i + 1, cat.name, cat.count, pct, ppm, ''];
    for (let c = 1; c <= totalCols; c++) {
      const cell = excelRow.getCell(c);
      const val = vals[c - 1];
      cell.value = typeof val === 'number' ? val : String(val);
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = c >= 3 ? { horizontal: 'right', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }
    currentRow++;
  }

  // Category total
  const catTotalRow = ws.getRow(currentRow);
  catTotalRow.height = 22;
  const catTotalVals = ['', '合计 / Total', grandTotalDefects, '100.00%', '', ''];
  for (let c = 1; c <= totalCols; c++) {
    const cell = catTotalRow.getCell(c);
    cell.value = catTotalVals[c - 1] !== undefined ? String(catTotalVals[c - 1]) : '';
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.border = thinBorder;
  }
  currentRow++;

  // ---- Section B: Top 20 Sub-defects ----
  currentRow++;
  const sectionBRow = ws.getRow(currentRow);
  sectionBRow.height = 22;
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const sectionBCell = sectionBRow.getCell(1);
  sectionBCell.value = 'B. 子缺陷排名TOP20 / Top 20 Sub-Defects';
  sectionBCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  sectionBCell.alignment = { vertical: 'middle' };
  currentRow++;

  const subHeaders = ['排名 / Rank', '子缺陷 / Sub-Defect', '类别 / Category', '数量 / Count', '占比 / Percentage', ''];
  const subHeaderRow = ws.getRow(currentRow);
  subHeaderRow.height = 28;
  for (let c = 1; c <= totalCols; c++) {
    const cell = subHeaderRow.getCell(c);
    cell.value = subHeaders[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  // Aggregate sub-defects
  // Use authoritative 64-column list from db-schema
  const subCols = SUBDEFECT_DB_COLUMNS;
  const SUBDEFECT_DEFAULT_NAMES: { name: string; category: string }[] =
    SUBDEFECT_DB_COLUMNS.map((col, i) => {
      const cat = getSubDefectCategory(i);
      const nameEn = SUBDEFECT_NAMES[i] || col;
      const nameZh = SUBDEFECT_NAMES_ZH[i] || col;
      const catZh = CATEGORY_ZH[cat.category] || cat.category;
      return { name: `${nameZh} / ${nameEn}`, category: `${catZh}问题 / ${cat.category}` };
    });

  const subDefectCounts: Record<string, { count: number; category: string }> = {};
  for (const r of data) {
    for (let i = 0; i < subCols.length; i++) {
      const count = Number(r[subCols[i]]) || 0;
      if (count > 0) {
        const info = SUBDEFECT_DEFAULT_NAMES[i];
        const key = info.name;
        if (!subDefectCounts[key]) {
          subDefectCounts[key] = { count: 0, category: info.category };
        }
        subDefectCounts[key].count += count;
      }
    }
  }

  const topSubDefects = Object.entries(subDefectCounts)
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  for (let i = 0; i < topSubDefects.length; i++) {
    const sd = topSubDefects[i];
    const pct = grandTotalDefects > 0 ? ((sd.count / grandTotalDefects) * 100).toFixed(2) + '%' : '0.00%';
    const bgColor = i % 2 === 0 ? PALE_BLUE : WHITE_ARGB;
    const excelRow = ws.getRow(currentRow);
    excelRow.height = 20;
    const vals: (string | number)[] = [i + 1, sd.name, sd.category, sd.count, pct, ''];
    for (let c = 1; c <= totalCols; c++) {
      const cell = excelRow.getCell(c);
      const val = vals[c - 1];
      cell.value = typeof val === 'number' ? val : String(val);
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = c === 4 || c === 5 ? { horizontal: 'right', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }
    currentRow++;
  }

  // ---- Section C: Top 15 Styles ----
  currentRow += 2;
  const sectionCRow = ws.getRow(currentRow);
  sectionCRow.height = 22;
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const sectionCCell = sectionCRow.getCell(1);
  sectionCCell.value = 'C. 款号缺陷排名TOP15 / Top 15 Styles by Defects';
  sectionCCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  sectionCCell.alignment = { vertical: 'middle' };
  currentRow++;

  const styleHeaders = ['排名 / Rank', '款号 / Style', '缺陷数 / Defect Count', '检验数量 / Inspected Qty', '不良率 / Defect Rate', ''];
  const styleHeaderRow = ws.getRow(currentRow);
  styleHeaderRow.height = 28;
  for (let c = 1; c <= totalCols; c++) {
    const cell = styleHeaderRow.getCell(c);
    cell.value = styleHeaders[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  const styleAgg: Record<string, { defects: number; inspected: number }> = {};
  for (const r of data) {
    const style = String(r.style_code || 'Unknown');
    if (!styleAgg[style]) styleAgg[style] = { defects: 0, inspected: 0 };
    const rowDef = ((Number(r.defect_stitching) || 0) + (Number(r.defect_stitch_defect) || 0))
      + (Number(r.defect_logo) || 0) + (Number(r.defect_material) || 0)
      + (Number(r.defect_hardware) || 0) + (Number(r.defect_appearance) || 0)
      + (Number(r.defect_zipper) || 0) + (Number(r.defect_webbing) || 0)
      + (Number(r.defect_other) || 0) + (Number(r.defect_preparation) || 0);
    styleAgg[style].defects += rowDef;
    styleAgg[style].inspected += Number(r.inspected_qty) || 0;
  }

  const topStyles = Object.entries(styleAgg)
    .map(([style, info]) => ({ style, ...info }))
    .sort((a, b) => b.defects - a.defects)
    .slice(0, 15);

  for (let i = 0; i < topStyles.length; i++) {
    const s = topStyles[i];
    const rate = s.inspected > 0 ? ((s.defects / s.inspected) * 100).toFixed(2) + '%' : '0.00%';
    const bgColor = i % 2 === 0 ? PALE_BLUE : WHITE_ARGB;
    const excelRow = ws.getRow(currentRow);
    excelRow.height = 20;
    const vals: (string | number)[] = [i + 1, s.style, s.defects, s.inspected, rate, ''];
    for (let c = 1; c <= totalCols; c++) {
      const cell = excelRow.getCell(c);
      const val = vals[c - 1];
      cell.value = typeof val === 'number' ? val : String(val);
      cell.font = { name: 'Arial', size: 10 };
      if (c === 5 && s.inspected > 0 && (s.defects / s.inspected) * 100 > 5) {
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FFDC2626' } };
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = c >= 3 ? { horizontal: 'right', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }
    currentRow++;
  }

  // Footer
  currentRow += 2;
  const footerRow = ws.getRow(currentRow);
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const footerCell = footerRow.getCell(1);
  footerCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // Column widths
  ws.getColumn(1).width = 11.82;   // A: Rank
  ws.getColumn(2).width = 36.0;     // B: Category / Sub-Defect / Style
  ws.getColumn(3).width = 20.45;    // C: Defect Count / Category / Inspected Qty
  ws.getColumn(4).width = 21.73;    // D: Percentage / Count / Defect Rate
  ws.getColumn(5).width = 19.36;    // E: PPM / (empty)
  ws.getColumn(6).width = 16.0;     // F: Remark / (empty)
}

/**
 * Fetch an image from URL and return as base64 buffer + extension.
 * Returns null on any failure (photo is optional — best effort).
 */
async function fetchImageAsBase64(url: string): Promise<{ base64: string; ext: string } | null> {
  try {
    if (!url || typeof url !== 'string') return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const ext = ct.includes('png') ? 'png' : 'jpeg';
    return { base64: buf.toString('base64'), ext };
  } catch {
    return null;
  }
}

// Helper: build RCA sheet in ExcelJS (async — fetches photos)
async function buildRCASheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rcaData: Record<string, unknown>[],
  _filters: ExportFilters,
): Promise<void> {
  const MED_BLUE    = 'FF2B5F8A';
  const HEADER_BG   = 'FF1F4E79';
  const PALE_BLUE   = 'FFEDF2F9';
  const LIGHT_BLUE  = 'FFD6E4F0';
  const WHITE_ARGB  = 'FFFFFFFF';
  const GRAY_FOOTER = 'FF999999';
  const FILTER_TEXT = 'FF4A6FA5';

  const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };

  // 15 columns: #, Week Period, BT, Inspected, NG, Pass Rate, Category,
  //   Sub-Defect, Root Cause, Impact, Process, Corrective, Preventive,
  //   Responsible, Deadline, Photo Before, Photo After
  const totalCols = 17;
  const rcaHeaders = [
    '序号 / No.',
    '周期 / Week Period',
    '业务类型 / Business Type',
    '检验数 / Inspected',
    '不良数 / NG',
    '合格率 / Pass Rate',
    '缺陷类别 / Category',
    '子缺陷 / Sub-Defect',
    '根本原因 / Root Cause',
    '影响范围 / Impact',
    '工序 / Process',
    '纠正措施 / Corrective Action',
    '预防措施 / Preventive Action',
    '责任人 / Responsible',
    '截止日期 / Deadline',
    '改善前照片 / Photo Before',
    '改善后照片 / Photo After',
  ];

  // ---- Title ----
  const row1 = ws.getRow(1);
  row1.height = 55;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = row1.getCell(1);
  titleCell.value = '厦门市欣维发实业有限公司品质检验表\nFQC RCA 根本原因分析报告 / Root Cause Analysis Report';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE_ARGB } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getRow(2).height = 4;
  let currentRow = 3;

  // Filter info
  const filterParts: string[] = [];
  if (_filters.dateFrom) filterParts.push(`期间 / Period: ${_filters.dateFrom}`);
  if (_filters.dateTo) filterParts.push(`至 / To: ${_filters.dateTo}`);
  if (_filters.businessType) filterParts.push(`业务类型 / BT: ${_filters.businessType}`);
  if (filterParts.length > 0) {
    const filterRow = ws.getRow(currentRow);
    filterRow.height = 16;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const fCell = filterRow.getCell(1);
    fCell.value = filterParts.join('   |   ');
    fCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    fCell.alignment = { vertical: 'middle' };
    currentRow++;
  } else {
    currentRow++;
  }

  // ---- Headers ----
  currentRow++;
  const headerRow = ws.getRow(currentRow);
  headerRow.height = 36;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    cell.value = rcaHeaders[c - 1];
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  currentRow++;

  // ---- Collect all photo URLs to batch-fetch ----
  const photoMap = new Map<string, { base64: string; ext: string } | null>();
  const allPhotoUrls = new Set<string>();
  for (const rca of rcaData) {
    const actions: Record<string, unknown>[] = (rca.rca_actions as any[]) || [];
    for (const a of actions) {
      if (a.photo_before && typeof a.photo_before === 'string') allPhotoUrls.add(a.photo_before);
      if (a.photo_after && typeof a.photo_after === 'string') allPhotoUrls.add(a.photo_after);
    }
  }
  // Batch fetch all photos in parallel (max 10 concurrent)
  const urls = [...allPhotoUrls];
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    const results = await Promise.all(batch.map(u => fetchImageAsBase64(u)));
    batch.forEach((u, j) => photoMap.set(u, results[j]));
  }

  // ---- Data rows ----
  const sorted = [...rcaData].sort((a, b) => {
    const wsComp = String(a.week_start || '').localeCompare(String(b.week_start || ''));
    if (wsComp !== 0) return wsComp;
    return String(a.business_type || '').localeCompare(String(b.business_type || ''));
  });

  let prevWeek = '';

  for (const rca of sorted) {
    // ---- Week separator row ----
    const curWeek = String(rca.week_start || '');
    if (curWeek && curWeek !== prevWeek && prevWeek !== '') {
      const sepRow = ws.getRow(currentRow);
      sepRow.height = 6;
      ws.mergeCells(currentRow, 1, currentRow, totalCols);
      const sepCell = sepRow.getCell(1);
      sepCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
      // Thin colored line as visual divider
      for (let c = 1; c <= totalCols; c++) {
        const cell = sepRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
        cell.border = thinBorder;
      }
      currentRow++;
    }
    prevWeek = curWeek;
    const weekPeriod = `${rca.week_start || ''} ~ ${rca.week_end || ''}`;
    const bt = String(rca.business_type || '');
    const inspected = Number(rca.total_inspected) || 0;
    const ng = Number(rca.total_ng) || 0;
    const passRate = Number(rca.overall_pass_rate) || 0;
    const actions: Record<string, unknown>[] = (rca.rca_actions as any[]) || [];

    if (actions.length === 0) {
      const bgColor = PALE_BLUE;
      const excelRow = ws.getRow(currentRow);
      excelRow.height = 20;
      const vals: (string | number)[] = [
        '', weekPeriod, bt, inspected, ng,
        passRate > 0 ? passRate.toFixed(2) + '%' : '-',
        '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-',
      ];
      for (let c = 1; c <= totalCols; c++) {
        const cell = excelRow.getCell(c);
        const val = vals[c - 1];
        cell.value = typeof val === 'number' ? val : String(val);
        cell.font = { name: 'Arial', size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = c >= 4 && c <= 5
          ? { horizontal: 'right', vertical: 'middle' }
          : { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      }
      currentRow++;
    } else {
      for (let ai = 0; ai < actions.length; ai++) {
        const action = actions[ai];
        const bgColor = ai % 2 === 0 ? PALE_BLUE : WHITE_ARGB;
        const excelRow = ws.getRow(currentRow);
        excelRow.height = 89;

        const rank = ai + 1;

        // Bilingual category: "Zipper / 拉链"
        const catEn = String(action.category || '');
        const catZh = CATEGORY_ZH[catEn] || '';
        const catBilingual = catEn && catZh ? `${catEn} / ${catZh}` : (catEn || '-');

        // Bilingual sub-defects: "Skip stitch / 跳针, ..."
        const rawSubs: string[] = Array.isArray(action.sub_defects)
          ? (action.sub_defects as unknown[]).map(s => String(s))
          : [];
        const subBilingual = rawSubs.length > 0
          ? rawSubs.map(sub => {
              const idx = SUBDEFECT_NAMES.indexOf(sub);
              const zh = idx >= 0 ? (SUBDEFECT_NAMES_ZH[idx] || '') : '';
              return zh ? `${sub} / ${zh}` : sub;
            }).join(', ')
          : '-';

        // Bilingual text fields: look up templates in both ID and ZH
        const primarySub = rawSubs[0] || '';
        const idTpl = SUBDEFECT_ACTION_TEMPLATES[primarySub] || ACTION_TEMPLATES[catEn];
        const zhTpl = SUBDEFECT_ACTION_TEMPLATES_ZH[primarySub];

        const bilingual = (stored: string, field: string) => {
          if (!stored || stored === '-') return '-';
          // Detect if stored text is Chinese (contains CJK chars)
          const isZh = /[\u4e00-\u9fff]/.test(stored);
          if (isZh && idTpl) {
            const other = (idTpl as any)[field] || '';
            return other ? `${stored}\n${other}` : stored;
          }
          if (!isZh && zhTpl) {
            const other = (zhTpl as any)[field] || '';
            return other ? `${stored}\n${other}` : stored;
          }
          return stored;
        };

        const vals: (string | number)[] = [
          rank,
          ai === 0 ? weekPeriod : '',
          ai === 0 ? bt : '',
          ai === 0 ? inspected : '',
          ai === 0 ? ng : '',
          ai === 0 ? (passRate > 0 ? passRate.toFixed(2) + '%' : '-') : '',
          catBilingual,
          subBilingual,
          bilingual(String(action.root_cause || ''), 'root_cause'),
          bilingual(String(action.impact || ''), 'impact'),
          bilingual(String(action.process || ''), 'process'),
          bilingual(String(action.corrective_action || ''), 'corrective_action'),
          bilingual(String(action.preventive_action || ''), 'preventive_action'),
          String(action.responsible || '-'),
          String(action.due_date || '-'),
          '', // Photo Before — placeholder, image overlaid
          '', // Photo After — placeholder, image overlaid
        ];

        for (let c = 1; c <= totalCols; c++) {
          const cell = excelRow.getCell(c);
          const val = vals[c - 1];
          cell.value = typeof val === 'number' ? val : String(val);
          cell.font = { name: 'Arial', size: 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.border = thinBorder;

          if (c >= 7 && c <= 13 && String(val) === '-') {
            cell.font = { name: 'Arial', size: 9, color: { argb: 'FF999999' } };
          }
        }

        // Color pass rate red if < 95%
        if (ai === 0 && passRate < 95 && passRate > 0) {
          const rateCell = excelRow.getCell(6);
          rateCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFDC2626' } };
        }

        // Embed Photo Before — using nativeCol/Off for exact EMU positioning
        const beforeUrl = String(action.photo_before || '');
        if (beforeUrl && photoMap.has(beforeUrl)) {
          const imgData = photoMap.get(beforeUrl);
          if (imgData) {
            const imgId = wb.addImage({ base64: imgData.base64, extension: imgData.ext as 'png' | 'jpeg' });
            ws.addImage(imgId, {
              tl: { nativeCol: 15, nativeColOff: 32000, nativeRow: currentRow - 1, nativeRowOff: 36000 },
              br: { nativeCol: 15, nativeColOff: 1212850, nativeRow: currentRow - 1, nativeRowOff: 1070000 },
              editAs: 'oneCell',
            });
          }
        }

        // Embed Photo After — using nativeCol/Off for exact EMU positioning
        const afterUrl = String(action.photo_after || '');
        if (afterUrl && photoMap.has(afterUrl)) {
          const imgData = photoMap.get(afterUrl);
          if (imgData) {
            const imgId = wb.addImage({ base64: imgData.base64, extension: imgData.ext as 'png' | 'jpeg' });
            ws.addImage(imgId, {
              tl: { nativeCol: 16, nativeColOff: 32000, nativeRow: currentRow - 1, nativeRowOff: 36000 },
              br: { nativeCol: 16, nativeColOff: 1212850, nativeRow: currentRow - 1, nativeRowOff: 1070000 },
              editAs: 'oneCell',
            });
          }
        }

        currentRow++;
      }
    }
  }

  // ---- Summary row ----
  currentRow++;
  const totalInspectedAll = sorted.reduce((sum, r) => sum + (Number(r.total_inspected) || 0), 0);
  const totalNGAll = sorted.reduce((sum, r) => sum + (Number(r.total_ng) || 0), 0);
  const totalPassRateAll = totalInspectedAll > 0
    ? (((totalInspectedAll - totalNGAll) / totalInspectedAll) * 100).toFixed(2) + '%'
    : '-';

  const summaryRow = ws.getRow(currentRow);
  summaryRow.height = 24;
  const summaryVals: (string | number)[] = [
    '', '合计 / Grand Total', '', totalInspectedAll, totalNGAll, totalPassRateAll,
    '', '', '', '', '', '', '', '', '', '', '',
  ];
  for (let c = 1; c <= totalCols; c++) {
    const cell = summaryRow.getCell(c);
    const val = summaryVals[c - 1];
    cell.value = typeof val === 'number' ? val : String(val);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.border = thinBorder;
    cell.alignment = c >= 4 && c <= 5
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'left', vertical: 'middle' };
  }
  currentRow++;

  // Footer
  currentRow += 2;
  const footerRow = ws.getRow(currentRow);
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const footerCell = footerRow.getCell(1);
  footerCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // Column widths — wide enough to avoid text cutoff
  ws.getColumn(1).width = 5.5;      // A: #
  ws.getColumn(2).width = 26.0;     // B: Week Period
  ws.getColumn(3).width = 14.0;     // C: Business Type
  ws.getColumn(4).width = 12.0;     // D: Inspected
  ws.getColumn(5).width = 10.0;     // E: NG
  ws.getColumn(6).width = 14.0;     // F: Pass Rate
  ws.getColumn(7).width = 18.0;     // G: Category
  ws.getColumn(8).width = 36.0;     // H: Sub-Defect (bilingual)
  ws.getColumn(9).width = 42.0;     // I: Root Cause
  ws.getColumn(10).width = 36.0;    // J: Impact
  ws.getColumn(11).width = 16.0;    // K: Process
  ws.getColumn(12).width = 42.0;    // L: Corrective Action
  ws.getColumn(13).width = 42.0;    // M: Preventive Action
  ws.getColumn(14).width = 16.0;    // N: Responsible
  ws.getColumn(15).width = 14.0;    // O: Deadline
  ws.getColumn(16).width = 18.0;    // P: Photo Before
  ws.getColumn(17).width = 18.0;    // Q: Photo After
}

// ---------------------------------------------------------------------------
// 2c. FQC + Analysis + RCA Combined Export (3 sheets, ExcelJS)
//     Sheet 1 = FQC Daily, Sheet 2 = Analysis, Sheet 3 = RCA
// ---------------------------------------------------------------------------

export async function exportFQRCACombinedExcel(
  fqcData: Record<string, unknown>[],
  rcaData: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): Promise<ExcelExportResult> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: FQC Daily
  const ws1 = wb.addWorksheet('FQC日报明细 Daily Detail');
  await buildFQCDailySheet(wb, ws1, fqcData, filters);

  // Sheet 2: FQC Defect Analysis
  const ws2 = wb.addWorksheet('缺陷分析 Analysis');
  buildFQCAnalysisSheet(ws2, fqcData, filters);

  // Sheet 3: RCA (async — fetches photos)
  const ws3 = wb.addWorksheet('RCA 根本原因分析');
  await buildRCASheet(wb, ws3, rcaData, filters);

  const buffer = await wb.xlsx.writeBuffer();
  const period = filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All';
  return { buffer: new Uint8Array(buffer as ArrayBuffer), fileName: `SULA-QC_FQC_RCA_Report_${period}.xlsx` };
}

// ---------------------------------------------------------------------------
// 3. OQC Rekap Excel — ExcelJS (professional theme matching FQC)
// ---------------------------------------------------------------------------

const OQC_REKAP_HEADERS = [
  'No',
  '日期 / Date',
  '业务类型 / BT',
  '批次总量 / Lot Size',
  'AQL代码 / Code',
  '抽样数 / Sample',
  'Ac',
  'Re',
  '严重 / Critical',
  '主要 / Major',
  '次要 / Minor',
  '总缺陷 / Total Defects',
  '合格率 / Pass Rate',
  '处置 / Disposition',
  '备注 / Remarks',
];

const OQC_DETAIL_HEADERS = [
  'No',
  '日期 / Date',
  '业务类型 / BT',
  '订单号 / Order No.',
  '款号 / Style',
  '订单数 / Order Qty',
  'FQC合格数 / FQC OK Qty',
];

/** Thin border shared across FQC & OQC sheets */
const oqcThinBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
};

export async function exportFQCOQCExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): Promise<ExcelExportResult> {
  const wb = new ExcelJS.Workbook();

  // ── FQC Theme color constants (identical to FQC Daily) ──
  const MED_BLUE    = 'FF2B5F8A';
  const HEADER_BG   = 'FF1F4E79';
  const PALE_BLUE   = 'FFEDF2F9';
  const LIGHT_BLUE  = 'FFD6E4F0';
  const WHITE_ARGB  = 'FFFFFFFF';
  const GRAY_FOOTER = 'FF999999';
  const FILTER_TEXT = 'FF4A6FA5';

  // ── Sort lots by date then business type ──
  const sortedLots = [...data].sort((a, b) => {
    const dateCmp = String(a.lot_date || '').localeCompare(String(b.lot_date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(a.business_type || '').localeCompare(String(b.business_type || ''));
  });

  // ── Aggregate summary ──
  let totalLotSize = 0, totalSampled = 0, totalSampleOk = 0, totalDefects = 0;
  let criticalDefects = 0, majorDefects = 0, minorDefects = 0;
  let releaseLots = 0, reworkLots = 0, holdLots = 0;
  let releaseQty = 0, reworkQty = 0, holdQty = 0;

  for (const lot of data) {
    totalLotSize += Number(lot.lot_size) || 0;
    totalSampled += Number(lot.sample_size) || 0;
    totalSampleOk += Number(lot.sample_ok) || 0;
    totalDefects += Number(lot.total_defects) || 0;
    criticalDefects += Number(lot.critical_defects) || 0;
    majorDefects += Number(lot.major_defects) || 0;
    minorDefects += Number(lot.minor_defects) || 0;
    releaseQty += Number(lot.release_qty) || 0;
    reworkQty += Number(lot.rework_qty) || 0;
    holdQty += Number(lot.hold_qty) || 0;
    if (lot.disposition === 'RELEASE') releaseLots++;
    if (lot.disposition === 'REWORK') reworkLots++;
    if (lot.disposition === 'HOLD') holdLots++;
  }

  const overallPassRate = totalSampled > 0 ? totalSampleOk / totalSampled : 0;

  // =========================================================================
  // SHEET 1: Rekap Summary
  // =========================================================================
  const ws1 = wb.addWorksheet('总览 Rekap');
  const totalCols = OQC_REKAP_HEADERS.length; // 15

  // ── Row 1: Title (height 63, bg MED_BLUE) ──
  const row1 = ws1.getRow(1);
  row1.height = 63;
  ws1.mergeCells(1, 1, 1, totalCols);
  const titleCell = row1.getCell(1);
  titleCell.value = '厦门市欣维发实业有限公司品质检验表\nOQC Outgoing Quality Control Report';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE_ARGB } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // ── Row 2-3: Spacers ──
  ws1.getRow(2).height = 4;
  ws1.getRow(3).height = 3;

  // ── Row 4: Filter info ──
  let currentRow = 4;
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.period) filterParts.push(`Period: ${filters.period}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);

  if (filterParts.length > 0) {
    const filterRow = ws1.getRow(currentRow);
    filterRow.height = 13.4;
    ws1.mergeCells(currentRow, 1, currentRow, totalCols);
    const fCell = filterRow.getCell(1);
    fCell.value = filterParts.join('   |   ');
    fCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    fCell.alignment = { vertical: 'middle' };
  }
  currentRow++;

  // ── Row 5: Section title “总览 Summary / Rekap” ──
  const sectionRow = ws1.getRow(currentRow);
  sectionRow.height = 22;
  ws1.mergeCells(currentRow, 1, currentRow, totalCols);
  const sectionCell = sectionRow.getCell(1);
  sectionCell.value = '总览 Summary / Rekap';
  sectionCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  sectionCell.alignment = { vertical: 'middle' };
  currentRow++;

  // ── Row 6-7: KPI summary rows (LIGHT_BLUE background) ──
  const kpiLabels1 = [
    '批次总数 / Total Lots', String(data.length),
    '批次总量 / Lot Size', String(totalLotSize.toLocaleString()),
    '抽样总数 / Sampled', String(totalSampled.toLocaleString()),
    '合格数 / Sample OK', String(totalSampleOk.toLocaleString()),
    '合格率 / Pass Rate', fmtPct(overallPassRate, true),
    '总缺陷 / Total Defects', String(totalDefects),
  ];
  const kpiLabels2 = [
    '严重缺陷 / Critical', String(criticalDefects),
    '主要缺陷 / Major', String(majorDefects),
    '次要缺陷 / Minor', String(minorDefects),
    '放行 / Release', `${releaseLots} (${releaseQty.toLocaleString()})`,
    '返工 / Rework', `${reworkLots} (${reworkQty.toLocaleString()})`,
    '扣留 / Hold', `${holdLots} (${holdQty.toLocaleString()})`,
  ];

  for (const kpiRow of [kpiLabels1, kpiLabels2]) {
    const kpiExcelRow = ws1.getRow(currentRow);
    kpiExcelRow.height = 22;
    ws1.mergeCells(currentRow, 1, currentRow, totalCols);
    const kpiCell = kpiExcelRow.getCell(1);
    kpiCell.value = kpiRow.join('    |    ');
    kpiCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
    kpiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    kpiCell.alignment = { vertical: 'middle', indent: 1 };
    kpiCell.border = oqcThinBorder;
    currentRow++;
  }
  currentRow++; // blank spacer

  // ── Section: Daily Breakdown ──
  const dailyTitleRow = ws1.getRow(currentRow);
  dailyTitleRow.height = 22;
  ws1.mergeCells(currentRow, 1, currentRow, totalCols);
  const dailyTitleCell = dailyTitleRow.getCell(1);
  dailyTitleCell.value = '每日明细 / Daily Breakdown';
  dailyTitleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  dailyTitleCell.alignment = { vertical: 'middle' };
  currentRow++;

  // ── Header row ──
  const headerExcelRow = ws1.getRow(currentRow);
  headerExcelRow.height = 43.5;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerExcelRow.getCell(c);
    cell.value = OQC_REKAP_HEADERS[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = oqcThinBorder;
  }
  currentRow++;

  // ── Data rows with alternating colors ──
  // Number columns (1-indexed): Lot Size(4), Sample(6), Critical(9), Major(10), Minor(11), Total Defects(12)
  const numberColSet = new Set<number>([1, 4, 6, 7, 8, 9, 10, 11, 12]);
  let rowNum = 1;

  for (const lot of sortedLots) {
    const dayLotSize = Number(lot.lot_size) || 0;
    const daySample = Number(lot.sample_size) || 0;
    const daySampleOk = Number(lot.sample_ok) || 0;
    const dayTotalDefects = Number(lot.total_defects) || 0;
    // pass_rate is stored as percentage (0-100) in DB
    const dayPassRateRaw = Number(lot.pass_rate) || 0;
    // Use stored pass_rate if > 0, otherwise recalculate from sample_size/total_defects
    const dayPassRate = dayPassRateRaw > 0
      ? dayPassRateRaw / 100
      : (daySample > 0 ? Math.max(0, daySample - dayTotalDefects) / daySample : 1);

    const bgColor = rowNum % 2 === 1 ? PALE_BLUE : WHITE_ARGB;
    const excelRow = ws1.getRow(currentRow);
    excelRow.height = 20;

    const vals: (string | number)[] = [
      rowNum,
      String(lot.lot_date || '').split('T')[0],
      String(lot.business_type || ''),
      dayLotSize,
      String(lot.aql_code || '-'),
      daySample,
      Number(lot.ac) ?? '-',
      Number(lot.re) ?? '-',
      Number(lot.critical_defects) || 0,
      Number(lot.major_defects) || 0,
      Number(lot.minor_defects) || 0,
      dayTotalDefects,
      fmtPct(dayPassRate, true),
      String(lot.disposition || ''),
      String(lot.remarks || ''),
    ];

    for (let c = 1; c <= totalCols; c++) {
      const cell = excelRow.getCell(c);
      const val = vals[c - 1];
      cell.value = typeof val === 'number' ? val : String(val);
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = numberColSet.has(c)
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'left', vertical: 'middle' };
      cell.border = oqcThinBorder;
    }
    currentRow++;
    rowNum++;
  }

  // ── Grand total row (HEADER_BG, white text) ──
  const grandExcelRow = ws1.getRow(currentRow);
  grandExcelRow.height = 25;
  ws1.mergeCells(currentRow, 2, currentRow, 3);
  const grandVals: (string | number)[] = [
    '',
    '合计 GRAND TOTAL',
    '',
    totalLotSize,
    '',
    totalSampled,
    '',
    '',
    criticalDefects,
    majorDefects,
    minorDefects,
  totalDefects,
    fmtPct(overallPassRate, true),
    '',
    '',
  ];
  for (let c = 1; c <= totalCols; c++) {
    const cell = grandExcelRow.getCell(c);
    const val = grandVals[c - 1];
    cell.value = typeof val === 'number' ? val : String(val);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = numberColSet.has(c)
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'left', vertical: 'middle' };
    cell.border = oqcThinBorder;
  }
  currentRow++;

  // ── Defect Category Summary ──
  currentRow++;
  const catTitleRow = ws1.getRow(currentRow);
  catTitleRow.height = 22;
  ws1.mergeCells(currentRow, 1, currentRow, totalCols);
  const catTitleCell = catTitleRow.getCell(1);
  catTitleCell.value = '缺陷类别汇总 / Defect Category Summary';
  catTitleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF333333' } };
  catTitleCell.alignment = { vertical: 'middle' };
  currentRow++;

  const catHeaders = ['排名 / Rank', '缺陷类别 / Category', '缺陷数 / Count', '占比 / Percentage', '严重 / Critical', '主要 / Major', '次要 / Minor', '备注 / Remark'];
  const catTotalCols = catHeaders.length;
  const catHeaderRow = ws1.getRow(currentRow);
  catHeaderRow.height = 28;
  for (let c = 1; c <= catTotalCols; c++) {
    const cell = catHeaderRow.getCell(c);
    cell.value = catHeaders[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = oqcThinBorder;
  }
  currentRow++;

  // Aggregate defects from oqc_defects relation
  const oqcCatTotals: Record<string, { count: number; critical: number; major: number; minor: number }> = {};
  const OQC_CATEGORIES = ['Packaging', 'Label', 'Accessory', 'Appearance', 'Hardware', 'Stitching', 'Other'];

  for (const lot of data) {
    const defects = lot.oqc_defects;
    if (Array.isArray(defects)) {
      for (const d of defects) {
        const cat = String(d.defect_category || 'Other');
        const cnt = Number(d.defect_count) || 0;
        if (!oqcCatTotals[cat]) {
          oqcCatTotals[cat] = { count: 0, critical: 0, major: 0, minor: 0 };
        }
        oqcCatTotals[cat].count += cnt;
        const sev = String(d.severity || '').toLowerCase();
        if (sev === 'critical') oqcCatTotals[cat].critical += cnt;
        else if (sev === 'major') oqcCatTotals[cat].major += cnt;
        else oqcCatTotals[cat].minor += cnt;
      }
    }
  }

  const sortedOqcCats = OQC_CATEGORIES
    .map((cat) => ({ category: cat, ...(oqcCatTotals[cat] || { count: 0, critical: 0, major: 0, minor: 0 }) }))
    .sort((a, b) => b.count - a.count);

  for (let i = 0; i < sortedOqcCats.length; i++) {
    const cat = sortedOqcCats[i];
    const pct = totalDefects > 0 ? `${((cat.count / totalDefects) * 100).toFixed(2)}%` : '0.00%';
    const bgColor = i % 2 === 0 ? PALE_BLUE : WHITE_ARGB;
    const excelRow = ws1.getRow(currentRow);
    excelRow.height = 20;
    const catVals: (string | number)[] = [i + 1, cat.category, cat.count, pct, cat.critical, cat.major, cat.minor, ''];
    for (let c = 1; c <= catTotalCols; c++) {
      const cell = excelRow.getCell(c);
      const val = catVals[c - 1];
      cell.value = typeof val === 'number' ? val : String(val);
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = c >= 3 ? { horizontal: 'right', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
      cell.border = oqcThinBorder;
    }
    currentRow++;
  }

  // Category total row
  const catTotalRow = ws1.getRow(currentRow);
  catTotalRow.height = 22;
  const catTotalVals: (string | number)[] = ['', '合计 / Total', totalDefects, '100.00%', '', '', '', ''];
  for (let c = 1; c <= catTotalCols; c++) {
    const cell = catTotalRow.getCell(c);
    const val = catTotalVals[c - 1];
    cell.value = typeof val === 'number' ? val : String(val);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.border = oqcThinBorder;
  }
  currentRow++;

  // ── Footer ──
  currentRow += 2;
  const footerRow = ws1.getRow(currentRow);
  ws1.mergeCells(currentRow, 1, currentRow, totalCols);
  const footerCell = footerRow.getCell(1);
  footerCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // ── Column widths ──
  const rekapWidths = [5, 12.5, 10, 13, 10, 10, 6, 6, 10, 10, 10, 12, 12, 12, 26];
  for (let c = 0; c < totalCols; c++) {
    ws1.getColumn(c + 1).width = rekapWidths[c] || 10;
  }

  // =========================================================================
  // SHEET 2: Detail Lot — order numbers and styles per lot
  // =========================================================================
  const ws2 = wb.addWorksheet('批次明细 Detail Lot');
  const detailCols = OQC_DETAIL_HEADERS.length; // 7

  // ── Title ──
  const dRow1 = ws2.getRow(1);
  dRow1.height = 63;
  ws2.mergeCells(1, 1, 1, detailCols);
  const dTitleCell = dRow1.getCell(1);
  dTitleCell.value = '厦门市欣维发实业有限公司品质检验表\nOQC Lot Detail — Order Numbers & Styles';
  dTitleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE_ARGB } };
  dTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MED_BLUE } };
  dTitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws2.getRow(2).height = 4;
  ws2.getRow(3).height = 3;

  let dCurrentRow = 4;
  if (filterParts.length > 0) {
    const dFilterRow = ws2.getRow(dCurrentRow);
    dFilterRow.height = 13.4;
    ws2.mergeCells(dCurrentRow, 1, dCurrentRow, detailCols);
    const dFCell = dFilterRow.getCell(1);
    dFCell.value = filterParts.join('   |   ');
    dFCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FILTER_TEXT } };
    dFCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE_BLUE } };
    dFCell.alignment = { vertical: 'middle' };
    dCurrentRow++;
  }
  dCurrentRow++;

  // ── Header ──
  const dHeaderRow = ws2.getRow(dCurrentRow);
  dHeaderRow.height = 43.5;
  for (let c = 1; c <= detailCols; c++) {
    const cell = dHeaderRow.getCell(c);
    cell.value = OQC_DETAIL_HEADERS[c - 1];
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = oqcThinBorder;
  }
  dCurrentRow++;

  // ── Data rows ──
  const detailNumColSet = new Set<number>([1, 6, 7]);
  let detailNum = 1;
  let detailTotalOrders = 0;
  let detailTotalOkQty = 0;

  for (const lot of sortedLots) {
    const orders = lot.oqc_lot_orders;
    const lotDate = String(lot.lot_date || '').split('T')[0];
    const lotBt = String(lot.business_type || '');

    if (Array.isArray(orders) && orders.length > 0) {
      for (const order of orders) {
        const orderQty = Number(order.order_qty) || 0;
        const okQty = Number(order.fqc_ok_qty) || 0;
        detailTotalOrders += orderQty;
        detailTotalOkQty += okQty;

        const bgColor = detailNum % 2 === 1 ? PALE_BLUE : WHITE_ARGB;
        const excelRow = ws2.getRow(dCurrentRow);
        excelRow.height = 20;
        const vals: (string | number)[] = [
          detailNum++, lotDate, lotBt,
          String(order.order_no || ''),
          String(order.style_code || ''),
          orderQty, okQty,
        ];
        for (let c = 1; c <= detailCols; c++) {
          const cell = excelRow.getCell(c);
          const val = vals[c - 1];
          cell.value = typeof val === 'number' ? val : String(val);
          cell.font = { name: 'Arial', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.alignment = detailNumColSet.has(c)
            ? { horizontal: 'right', vertical: 'middle' }
            : { horizontal: 'left', vertical: 'middle' };
          cell.border = oqcThinBorder;
        }
        dCurrentRow++;
      }
    } else {
      const bgColor = detailNum % 2 === 1 ? PALE_BLUE : WHITE_ARGB;
      const excelRow = ws2.getRow(dCurrentRow);
      excelRow.height = 20;
      const vals: (string | number)[] = [
        detailNum++, lotDate, lotBt, '-', '-',
        Number(lot.lot_size) || 0, '-',
      ];
      for (let c = 1; c <= detailCols; c++) {
        const cell = excelRow.getCell(c);
        const val = vals[c - 1];
        cell.value = typeof val === 'number' ? val : String(val);
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = detailNumColSet.has(c)
          ? { horizontal: 'right', vertical: 'middle' }
          : { horizontal: 'left', vertical: 'middle' };
        cell.border = oqcThinBorder;
      }
      dCurrentRow++;
    }
  }

  // ── Grand total ──
  const dGrandRow = ws2.getRow(dCurrentRow);
  dGrandRow.height = 25;
  ws2.mergeCells(dCurrentRow, 2, dCurrentRow, 5);
  const dGrandVals: (string | number)[] = ['', '合计 GRAND TOTAL', '', '', '', `${detailTotalOrders}`, `${detailTotalOkQty}`];
  for (let c = 1; c <= detailCols; c++) {
    const cell = dGrandRow.getCell(c);
    const val = dGrandVals[c - 1];
    cell.value = typeof val === 'number' ? val : String(val);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = detailNumColSet.has(c)
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'left', vertical: 'middle' };
    cell.border = oqcThinBorder;
  }
  dCurrentRow++;

  // ── Footer ──
  dCurrentRow += 2;
  const dFooterRow = ws2.getRow(dCurrentRow);
  ws2.mergeCells(dCurrentRow, 1, dCurrentRow, detailCols);
  const dFooterCell = dFooterRow.getCell(1);
  dFooterCell.value = `Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`;
  dFooterCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: GRAY_FOOTER } };

  // ── Column widths ──
  const detailWidths = [5, 12.5, 10, 24, 20, 14, 16];
  for (let c = 0; c < detailCols; c++) {
    ws2.getColumn(c + 1).width = detailWidths[c] || 10;
  }

  // ── Generate buffer ──
  const buffer = await wb.xlsx.writeBuffer();
  const period = filters.period || (filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All');
  return { buffer: new Uint8Array(buffer as ArrayBuffer), fileName: `SULA-QC_OQC_Rekap_${period}.xlsx` };
}

// ---------------------------------------------------------------------------
// 4. IPQC Excel
// ---------------------------------------------------------------------------

const IPQC_HEADERS = [
  'No / 序号',
  '日期 / Date',
  '阶段 / Stage',
  '生产线 / Line',
  '检验员 / Inspector',
  '款号 / Style',
  '订单号 / Order No.',
  '检查数量 / Checked',
  '合格数 / Pass',
  '不合格数 / Fail',
  '合格率 / Pass Rate',
  '缺陷数 / Defects',
  '缺陷详情 / Defect Detail',
  '业务类型 / Business Type',
];

const IPQC_WIDTHS = [
  6, 14, 12, 12, 14, 16, 20, 12, 10, 10, 12, 10, 30, 14,
];

export function exportIPQCExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): ExcelExportResult {
  const wb = createBook();
  const ws: XLSX.WorkSheet = {};
  const totalCols = IPQC_HEADERS.length;

  let row = writeTitle(ws, 'SULA-QC 过程品质检验报告\nIPQC In-Process Quality Control Report', 0, totalCols - 1);

  // Filter info
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.businessType) filterParts.push(`Type: ${filters.businessType}`);
  if (filterParts.length > 0) {
    writeRow(ws, row, 0, [filterParts.join('   |   ')], {
      font: { name: 'Arial', sz: 9, italic: true, color: { rgb: '666666' } },
    });
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
    row += 2;
  } else {
    row += 2;
  }

  // ---- Stage Summary ----
  writeRow(ws, row, 0, ['阶段汇总 / Stage Summary'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  const STAGES = ['Cutting', 'Sewing', 'Assembly', 'Finishing'] as const;
  const stageLabels: Record<string, string> = {
    Cutting: '裁剪 / Cutting',
    Sewing: '缝制 / Sewing',
    Assembly: '组装 / Assembly',
    Finishing: '后整 / Finishing',
  };

  const stageSummaryHeaders = [
    '阶段 / Stage',
    '检验次数 / Inspections',
    '检查数量 / Checked',
    '合格数 / Pass',
    '不合格数 / Fail',
    '合格率 / Pass Rate',
    '缺陷总数 / Total Defects',
  ];
  writeRow(ws, row, 0, stageSummaryHeaders, HEADER_STYLE);
  row++;

  const stageAgg: Record<string, { count: number; checked: number; pass: number; fail: number; defects: number }> = {};
  for (const s of STAGES) {
    stageAgg[s] = { count: 0, checked: 0, pass: 0, fail: 0, defects: 0 };
  }
  let totalChecked = 0, totalPass = 0, totalFail = 0, totalDefects = 0;

  for (const rec of data) {
    const stage = String(rec.stage || 'Other');
    if (!stageAgg[stage]) stageAgg[stage] = { count: 0, checked: 0, pass: 0, fail: 0, defects: 0 };
    stageAgg[stage].count++;
    const checked = Number(rec.check_count) || 0;
    const pass = Number(rec.ok_count) || 0;
    const fail = Number(rec.ng_count) || 0;
    const defects = Number(rec.total_defects) || 0;
    stageAgg[stage].checked += checked;
    stageAgg[stage].pass += pass;
    stageAgg[stage].fail += fail;
    stageAgg[stage].defects += defects;
    totalChecked += checked;
    totalPass += pass;
    totalFail += fail;
    totalDefects += defects;
  }

  for (const s of STAGES) {
    const agg = stageAgg[s];
    const rate = agg.checked > 0 ? agg.pass / agg.checked : 0;
    writeRow(ws, row, 0, [
      stageLabels[s] || s,
      agg.count,
      agg.checked,
      agg.pass,
      agg.fail,
      fmtPct(rate, true),
      agg.defects,
    ], DATA_STYLE);
    row++;
  }

  // Total row for stage summary
  const totalRate = totalChecked > 0 ? totalPass / totalChecked : 0;
  writeRow(ws, row, 0, [
    '合计 / Total',
    data.length,
    totalChecked,
    totalPass,
    totalFail,
    fmtPct(totalRate, true),
    totalDefects,
  ], SUBTOTAL_STYLE);
  row += 2;

  // ---- Detail Data Table ----
  writeRow(ws, row, 0, ['明细数据 / Detail Records'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  writeRow(ws, row, 0, IPQC_HEADERS, HEADER_STYLE);
  row++;

  const sortedIPQC = [...data].sort((a, b) =>
    String(a.inspection_date || '').localeCompare(String(b.inspection_date || ''))
  );

  for (let i = 0; i < sortedIPQC.length; i++) {
    const rec = sortedIPQC[i];
    const checked = Number(rec.check_count) || 0;
    const pass = Number(rec.ok_count) || 0;
    const fail = Number(rec.ng_count) || 0;
    const rate = checked > 0 ? pass / checked : 0;
    const defects = Number(rec.total_defects) || 0;

    // Build defect detail string from defect_detail JSON string (DB stores as JSON string)
    let defectDetail = '';
    const rawDetail = String(rec.defect_detail || '');
    let parsedDefects: Record<string, unknown>[] | null = null;
    try { parsedDefects = JSON.parse(rawDetail); } catch { /* not JSON */ }
    if (Array.isArray(parsedDefects) && parsedDefects.length > 0) {
      defectDetail = parsedDefects.map((d: Record<string, unknown>) =>
        `${d.category || ''}: ${d.subDefect || d.sub_defect || ''} (${d.count || 0})`
      ).join('; ');
    } else {
      defectDetail = defects > 0 ? `${defects} defects` : '-';
    }

    writeRow(ws, row, 0, [
      i + 1,
      String(rec.inspection_date || ''),
      stageLabels[String(rec.stage || '')] || String(rec.stage || ''),
      String(rec.production_line || ''),
      String(rec.inspector_name || ''),
      String(rec.style_code || ''),
      String(rec.order_no || ''),
      checked,
      pass,
      fail,
      fmtPct(rate, true),
      defects,
      defectDetail,
      String(rec.business_type || ''),
    ], DATA_STYLE);
    row++;
  }

  // Grand total
  writeRow(ws, row, 0, [
    '',
    '合计 / Grand Total',
    '', '', '', '', '',
    totalChecked,
    totalPass,
    totalFail,
    fmtPct(totalRate, true),
    totalDefects,
    '',
    '',
  ], GRAND_TOTAL_STYLE);
  row++;

  // Footer
  row += 1;
  writeRow(ws, row, 0, [`Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`], {
    font: { name: 'Arial', sz: 8, italic: true, color: { rgb: 'AAAAAA' } },
  });

  setColWidths(ws, IPQC_WIDTHS);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: totalCols - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, 'IPQC过程检验 IPQC Records');

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const period = filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All';
  return { buffer: new Uint8Array(buffer), fileName: `SULA-QC_IPQC_${period}.xlsx` };
}
