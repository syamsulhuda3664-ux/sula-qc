import * as XLSX from 'xlsx';
import { extractLineSortKey } from './utils';

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
  const cell = ws[addr];
  if (cell) {
    cell.s = {
      font: {
        name: 'Arial',
        sz: 22,
        bold: true,
        color: { rgb: 'D0E8F0' },
      },
      alignment: {
        horizontal: 'center' as const,
        vertical: 'center' as const,
        textRotation: 0,
      },
      fill: {
        fgColor: { rgb: '1B3A5C' },
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
 * Set column widths for a worksheet.  Values are in character widths.
 */
function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((w) => ({ wch: w }));
}

/**
 * Auto-fit column widths based on the longest value in each column.
 * Falls back to `fallbacks` array when a column has no data.
 * Adds a small padding (2 chars) for readability.
 */
function autoFitCols(ws: XLSX.WorkSheet, fallbacks: number[], maxW: number = 40): void {
  const colCount = fallbacks.length;
  const maxLens: number[] = new Array(colCount).fill(0);
  // Determine the range of the sheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = 0; c < colCount; c++) {
    let maxLen = 0;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const val = String(cell.v || '');
      // Approximate: CJK chars are ~2x wider than latin
      const len = [...val].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x2E7F ? 2 : 1), 0);
      if (len > maxLen) maxLen = len;
    }
    maxLens[c] = maxLen;
  }
  ws['!cols'] = maxLens.map((len, i) => {
    const fitted = len + 3; // padding
    return { wch: Math.min(Math.max(fitted, fallbacks[i] || 8), maxW) };
  });
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
 * Create a styled title block with a dark blue banner, company name,
 * and subtitle. Returns the next available row.
 */
function writeTitle(
  ws: XLSX.WorkSheet,
  title: string,
  colStart: number,
  colEnd: number,
): number {
  const merges = ws['!merges'] = ws['!merges'] || [];

  // Row 0: Dark navy banner with SULA-QC watermark
  // Fill the entire row with dark navy background
  for (let c = colStart; c <= colEnd; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    ws[addr] = { t: 's', v: '' };
    ws[addr].s = {
      font: { name: 'Arial', sz: 10 },
      fill: { fgColor: { rgb: '1B3A5C' } },
    };
  }
  // Watermark in the middle
  const midCol = Math.floor((colStart + colEnd) / 2);
  const wmAddr = XLSX.utils.encode_cell({ r: 0, c: midCol });
  ws[wmAddr] = { t: 's', v: 'SULA-QC' };
  ws[wmAddr].s = {
    font: { name: 'Arial', sz: 22, bold: true, color: { rgb: 'D0E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: '1B3A5C' } },
  };
  merges.push({ s: { r: 0, c: colStart }, e: { r: 0, c: colEnd } });

  // Row 1: Main title (large, bold, white on dark blue)
  writeRow(ws, 1, colStart, [title], {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: '2B5F8A' } },
  });
  merges.push({ s: { r: 1, c: colStart }, e: { r: 1, c: colEnd } });

  // Row 2: Blank separator with light accent line
  for (let c = colStart; c <= colEnd; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    ws[addr] = { t: 's', v: '' };
    ws[addr].s = {
      fill: { fgColor: { rgb: '4A90D9' } },
    };
  }
  merges.push({ s: { r: 2, c: colStart }, e: { r: 2, c: colEnd } });

  // Row 3: blank gap
  return 4;
}

/** Common header style - deep blue with white bold text */
const HEADER_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1F4E79' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FFFFFF' } },
    bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
    left: { style: 'thin', color: { rgb: '3A7BBF' } },
    right: { style: 'thin', color: { rgb: '3A7BBF' } },
  },
};

/** Subtotal row style - light blue tint */
const SUBTOTAL_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'D6E4F0' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'medium', color: { rgb: '1F4E79' } },
    bottom: { style: 'thin', color: { rgb: '1F4E79' } },
    left: { style: 'thin', color: { rgb: 'B4C6D9' } },
    right: { style: 'thin', color: { rgb: 'B4C6D9' } },
  },
};

/** Grand total row style - dark navy with white text */
const GRAND_TOTAL_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1F4E79' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'medium', color: { rgb: 'FFFFFF' } },
    bottom: { style: 'medium', color: { rgb: 'FFFFFF' } },
    left: { style: 'thin', color: { rgb: '1F4E79' } },
    right: { style: 'thin', color: { rgb: '1F4E79' } },
  },
};

/** Normal data cell style */
const DATA_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10 },
  alignment: { vertical: 'center' },
};

/** Alternating row style (even rows) - very light blue */
const DATA_STYLE_ALT: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10 },
  alignment: { vertical: 'center' },
  fill: { fgColor: { rgb: 'EDF2F9' } },
};

/** Data cell style for numbers - right aligned */
const DATA_NUM_STYLE: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10 },
  alignment: { vertical: 'center', horizontal: 'right' },
};

/** Alternating data cell style for numbers */
const DATA_NUM_STYLE_ALT: Partial<XLSX.CellStyle> = {
  font: { name: 'Arial', sz: 10 },
  alignment: { vertical: 'center', horizontal: 'right' },
  fill: { fgColor: { rgb: 'EDF2F9' } },
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
  6, 14, 14, 14, 18, 22, 16, 16, 12, 12, 14,
  16, 14, 16, 14, 16, 14, 14, 14, 16,
];

export function exportFQCDailyExcel(
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
      font: { name: 'Arial', sz: 9, italic: true, color: { rgb: '4A6FA5' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      fill: { fgColor: { rgb: 'EDF2F9' } },
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

      // Defect rate display: if stored as 0-1 fraction show as %, else as-is
      let rateDisplay: string | number;
      if (defectRate <= 1 && defectRate >= 0) {
        rateDisplay = fmtPct(defectRate, true);
      } else {
        rateDisplay = `${defectRate}%`;
      }

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
      // Write data row with alternating colors and number alignment
      const isAlt = rowNum % 2 === 0;
      const textStyle = isAlt ? DATA_STYLE_ALT : DATA_STYLE;
      const numStyle = isAlt ? DATA_NUM_STYLE_ALT : DATA_NUM_STYLE;
      for (let ci = 0; ci < vals.length; ci++) {
        const c = ci;
        const addr = XLSX.utils.encode_cell({ r: row, c });
        const val = vals[ci];
        if (val === null || val === undefined) continue;
        let cell: XLSX.CellObject;
        if (typeof val === 'number') {
          cell = { t: 'n', v: val };
          cell.s = { ...numStyle };
        } else {
          cell = { t: 's', v: String(val) };
          cell.s = { ...textStyle };
        }
        ws[addr] = cell;
      }
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

  // Footer line
  row += 1;
  writeRow(ws, row, 0, [`Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`], {
    font: { name: 'Arial', sz: 8, italic: true, color: { rgb: '999999' } },
  });

  // Auto-fit column widths based on actual content, with minimums from FQC_DAILY_WIDTHS
  autoFitCols(ws, FQC_DAILY_WIDTHS);

  // Set row heights for title block
  ws['!rows'] = [
    { hpt: 28 }, // row 0: watermark banner
    { hpt: 42 }, // row 1: main title (larger)
    { hpt: 6 },  // row 2: accent line
    { hpt: 4 },  // row 3: gap
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
    // Stitching (15)
    { name: '跳针 Skip stitch', category: '针车问题 / Stitching' },
    { name: '断线 Thread break', category: '针车问题 / Stitching' },
    { name: '浮线 Loose thread', category: '针车问题 / Stitching' },
    { name: '断针 Needle break', category: '针车问题 / Stitching' },
    { name: '针迹不均 Uneven stitch', category: '针车问题 / Stitching' },
    { name: '起皱 Puckering', category: '针车问题 / Stitching' },
    { name: '线头 Thread tail', category: '针车问题 / Stitching' },
    { name: '重针 Double stitch', category: '针车问题 / Stitching' },
    { name: '漏针 Missing stitch', category: '针车问题 / Stitching' },
    { name: '反线 Wrong thread', category: '针车问题 / Stitching' },
    { name: '针距不对 Wrong pitch', category: '针车问题 / Stitching' },
    { name: '线迹歪斜 Crooked stitch', category: '针车问题 / Stitching' },
    { name: '缝合不良 Poor sewing', category: '针车问题 / Stitching' },
    { name: '接线不良 Joint issue', category: '针车问题 / Stitching' },
    { name: '爆线 Seam burst', category: '针车问题 / Stitching' },
    // Logo (4)
    { name: 'Logo歪斜 Logo misaligned', category: 'LOGO问题 / Logo' },
    { name: 'Logo脱落 Logo peeling', category: 'LOGO问题 / Logo' },
    { name: 'Logo变色 Logo discolored', category: 'LOGO问题 / Logo' },
    { name: 'Logo缺件 Logo missing', category: 'LOGO问题 / Logo' },
    // Material (5)
    { name: '色差 Color deviation', category: '面料问题 / Material' },
    { name: '破洞 Hole', category: '面料问题 / Material' },
    { name: '污渍 Stain', category: '面料问题 / Material' },
    { name: '起毛 Pilling', category: '面料问题 / Material' },
    { name: '面料错误 Wrong material', category: '面料问题 / Material' },
    // Hardware (3)
    { name: '拉链不良 Zipper defect', category: '五金问题 / Hardware' },
    { name: '五金缺失 Hardware missing', category: '五金问题 / Hardware' },
    { name: '五金松动 Hardware loose', category: '五金问题 / Hardware' },
    // Appearance (5)
    { name: '刮伤 Scratch', category: '外观问题 / Appearance' },
    { name: '变形 Deformation', category: '外观问题 / Appearance' },
    { name: '褶皱 Wrinkle', category: '外观问题 / Appearance' },
    { name: '色斑 Color spot', category: '外观问题 / Appearance' },
    { name: '尺寸不对 Wrong size', category: '外观问题 / Appearance' },
    // Zipper (4)
    { name: '拉链卡顿 Zipper stuck', category: '拉链问题 / Zipper' },
    { name: '拉链头缺失 Puller missing', category: '拉链问题 / Zipper' },
    { name: '拉链脱色 Zipper faded', category: '拉链问题 / Zipper' },
    { name: '拉链断裂 Zipper broken', category: '拉链问题 / Zipper' },
    // Webbing (2)
    { name: '织带不良 Webbing defect', category: '织带问题 / Webbing' },
    { name: '织带错色 Wrong webbing color', category: '织带问题 / Webbing' },
    // Other (6)
    { name: '尺寸不符 Dimension mismatch', category: '其它问题 / Other' },
    { name: '重量不符 Weight mismatch', category: '其它问题 / Other' },
    { name: '异味 Odor', category: '其它问题 / Other' },
    { name: '标签问题 Label issue', category: '其它问题 / Other' },
    { name: '包装问题 Packaging issue', category: '其它问题 / Other' },
    { name: '其他 Other', category: '其它问题 / Other' },
    // Preparation (16)
    { name: '备料错误 Wrong preparation', category: '备料问题 / Preparation' },
    { name: '物料缺失 Material missing', category: '备料问题 / Preparation' },
    { name: '物料混料 Material mixed', category: '备料问题 / Preparation' },
    { name: '裁剪不良 Cutting defect', category: '备料问题 / Preparation' },
    { name: '排料不当 Layout error', category: '备料问题 / Preparation' },
    { name: '数量不足 Qty shortage', category: '备料问题 / Preparation' },
    { name: '规格不符 Spec mismatch', category: '备料问题 / Preparation' },
    { name: '色号错误 Color code wrong', category: '备料问题 / Preparation' },
    { name: '批次错误 Batch error', category: '备料问题 / Preparation' },
    { name: '配件错误 Accessory wrong', category: '备料问题 / Preparation' },
    { name: '超期物料 Expired material', category: '备料问题 / Preparation' },
    { name: '物料破损 Material damaged', category: '备料问题 / Preparation' },
    { name: '物料脏污 Material dirty', category: '备料问题 / Preparation' },
    { name: '物料色差 Material color diff', category: '备料问题 / Preparation' },
    { name: '备料延迟 Prep delayed', category: '备料问题 / Preparation' },
    { name: '余料管理 Scrap issue', category: '备料问题 / Preparation' },
    // Merged from Stitch Defect into Stitching
    { name: '车缝不良 Sewing defect', category: '针车问题 / Stitching' },
  ];

  for (const r of data) {
    // DB rows have individual sub_* columns — iterate SUBDEFECT_DB_COLUMNS
    // We import the column names inline here to avoid a top-level import
    // that would bloat the already large file.
    const subCols = [
      'sub_float_fold_skip','sub_missing_loose_stitch','sub_not_stitched','sub_needle_hole','sub_missing_bartack','sub_presser_mark','sub_backtack_off','sub_wrong_panel','sub_end_unfolded','sub_asymmetric','sub_triangle_uneven','sub_thread_bleed','sub_thread_ends','sub_foam_misaligned','sub_stitch_offcenter','sub_logo_crooked','sub_logo_inverted','sub_logo_defective','sub_logo_detached','sub_color_diff','sub_yarn_pull','sub_wrinkle','sub_damaged','sub_seam_open','sub_scratched','sub_poor_function','sub_missing_accessory','sub_dirty_oily','sub_bone_uneven','sub_bag_crooked','sub_handle_misaligned','sub_missing_rivet','sub_sharp_stuck','sub_zipper_wave','sub_zipper_head_reversed','sub_wrong_color_zipper','sub_webbing_twisted','sub_webbing_misplaced','sub_wash_label_reversed','sub_wash_label_wrong','sub_woven_label_reversed','sub_woven_label_missing','sub_lining_reversed','sub_plastic_defective','sub_rivet_defective','sub_accessory_crooked','sub_paint_off','sub_bartack_misaligned','sub_bartack_nonstandard','sub_logo_tilted','sub_velcro_tilted','sub_velcro_loose','sub_trolley_cover_tilted','sub_trolley_cover_short','sub_webbing_height_off','sub_stitch_margin_inconsistent','sub_loose_thread','sub_float_skip2','sub_pattern_stitch_inconsistent','sub_elastic_tilted','sub_logo_text_detached','sub_logo_scratched','sub_triangle_reversed',
    ];
    for (let i = 0; i < Math.min(subCols.length, SUBDEFECT_DEFAULT_NAMES.length); i++) {
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

  setColWidths(ws1, [10, 36, 18, 16, 16, 16]);
  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: totalCols - 1 } });
  XLSX.utils.book_append_sheet(wb, ws1, '缺陷分析 Analysis');

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const period = filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All';
  return { buffer: new Uint8Array(buffer), fileName: `SULA-QC_FQC_Analysis_${period}.xlsx` };
}

// ---------------------------------------------------------------------------
// 3. OQC Rekap Excel
// ---------------------------------------------------------------------------

export function exportFQCOQCExcel(
  data: Record<string, unknown>[],
  filters: ExportFilters,
  _lang: ExportLang,
): ExcelExportResult {
  const wb = createBook();
  const ws: XLSX.WorkSheet = {};
  const totalCols = 14;

  let row = writeTitle(ws, 'SULA-QC 出货品质检验报告\nOQC Outgoing Quality Control Report', 0, totalCols - 1);

  // Filter info
  const filterParts: string[] = [];
  if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`To: ${filters.dateTo}`);
  if (filters.period) filterParts.push(`Period: ${filters.period}`);
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

  // ---- Summary Section ----
  writeRow(ws, row, 0, ['总览 Summary / Rekap'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  // Summary KPIs in two rows of 7 columns each
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

  const kpiRow1 = [
    '批次总数 / Total Lots', data.length,
    '批次总量 / Lot Size', totalLotSize,
    '抽样总数 / Sampled', totalSampled,
    '合格数 / Sample OK', totalSampleOk,
    '合格率 / Pass Rate', fmtPct(overallPassRate, true),
    '总缺陷 / Total Defects', totalDefects,
    '', '',
  ];
  const kpiRow2 = [
    '严重缺陷 / Critical', criticalDefects,
    '主要缺陷 / Major', majorDefects,
    '次要缺陷 / Minor', minorDefects,
    '放行 / Release', `${releaseLots} (${releaseQty.toLocaleString()})`,
    '返工 / Rework', `${reworkLots} (${reworkQty.toLocaleString()})`,
    '扣留 / Hold', `${holdLots} (${holdQty.toLocaleString()})`,
    '', '',
  ];

  writeRow(ws, row, 0, kpiRow1, SUBTOTAL_STYLE);
  row++;
  writeRow(ws, row, 0, kpiRow2, SUBTOTAL_STYLE);
  row += 2;

  // ---- Daily Breakdown Table ----
  writeRow(ws, row, 0, ['每日明细 / Daily Breakdown'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } });
  row++;

  const dailyHeaders = [
    'No',
    '日期 / Date',
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
  writeRow(ws, row, 0, dailyHeaders, HEADER_STYLE);
  row++;

  // Group by date
  const sortedLots = [...data].sort((a, b) =>
    String(a.lot_date || '').localeCompare(String(b.lot_date || ''))
  );

  const dailyMap: Record<string, Record<string, unknown>[]> = {};
  for (const lot of sortedLots) {
    const d = String(lot.lot_date || 'unknown');
    if (!dailyMap[d]) dailyMap[d] = [];
    dailyMap[d].push(lot);
  }

  let num = 1;
  for (const [date, lots] of Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))) {
    let dayLotSize = 0, daySample = 0, daySampleOk = 0, dayDefects = 0;
    let dayCritical = 0, dayMajor = 0, dayMinor = 0;
    let dispositions: string[] = [];

    for (const lot of lots) {
      dayLotSize += Number(lot.lot_size) || 0;
      daySample += Number(lot.sample_size) || 0;
      daySampleOk += Number(lot.sample_ok) || 0;
      dayDefects += Number(lot.total_defects) || 0;
      dayCritical += Number(lot.critical_defects) || 0;
      dayMajor += Number(lot.major_defects) || 0;
      dayMinor += Number(lot.minor_defects) || 0;
      dispositions.push(String(lot.disposition || ''));
    }

    const dayPassRate = daySample > 0 ? daySampleOk / daySample : 0;
    const primaryDisp = dispositions.includes('HOLD')
      ? 'HOLD'
      : dispositions.includes('REWORK')
        ? 'REWORK'
        : 'RELEASE';

    writeRow(ws, row, 0, [
      num++,
      date,
      dayLotSize,
      '-',
      daySample,
      '-',
      '-',
      dayCritical,
      dayMajor,
      dayMinor,
      dayDefects,
      fmtPct(dayPassRate, true),
      primaryDisp,
      lots.length > 1 ? `${lots.length} lots` : '',
    ], DATA_STYLE);
    row++;
  }

  // Grand total row for daily breakdown
  writeRow(ws, row, 0, [
    '',
    '合计 / Grand Total',
    totalLotSize,
    '', totalSampled, '', '',
    criticalDefects, majorDefects, minorDefects,
    totalDefects,
    fmtPct(overallPassRate, true),
    '',
    '',
  ], GRAND_TOTAL_STYLE);
  row++;

  // ---- Defect Category Summary ----
  row += 1;
  writeRow(ws, row, 0, ['缺陷类别汇总 / Defect Category Summary'], {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '333333' } },
  });
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 6 } });
  row++;

  const catHeaders = [
    '排名 / Rank',
    '缺陷类别 / Category',
    '缺陷数 / Count',
    '占比 / Percentage',
    '严重 / Critical',
    '主要 / Major',
    '次要 / Minor',
  ];
  writeRow(ws, row, 0, catHeaders, HEADER_STYLE);
  row++;

  // Aggregate defects from the nested oqc_defects array if present
  // DB columns: defect_category (not category), defect_count (not count)
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
    .map((cat) => ({ category: cat, ...oqcCatTotals[cat] }))
    .sort((a, b) => b.count - a.count);

  for (let i = 0; i < sortedOqcCats.length; i++) {
    const cat = sortedOqcCats[i];
    const pct = totalDefects > 0 ? `${((cat.count / totalDefects) * 100).toFixed(2)}%` : '0.00%';
    writeRow(ws, row, 0, [
      i + 1,
      cat.category,
      cat.count,
      pct,
      cat.critical,
      cat.major,
      cat.minor,
    ], DATA_STYLE);
    row++;
  }

  // Footer
  row += 1;
  writeRow(ws, row, 0, [`Generated by SULA-QC System on ${new Date().toISOString().split('T')[0]}`], {
    font: { name: 'Arial', sz: 8, italic: true, color: { rgb: 'AAAAAA' } },
  });

  setColWidths(ws, [6, 14, 14, 10, 10, 8, 8, 10, 10, 10, 12, 12, 14, 20]);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: totalCols - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, '总览 Rekap');

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const period = filters.period || (filters.dateFrom ? `${filters.dateFrom}_${filters.dateTo || 'all'}` : 'All');
  return { buffer: new Uint8Array(buffer), fileName: `SULA-QC_OQC_Rekap_${period}.xlsx` };
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
