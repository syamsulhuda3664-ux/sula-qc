/**
 * DB Schema mapping — maps application field names to actual Supabase column names.
 * The DB was created with different naming conventions than the code originally assumed.
 *
 * All API routes and generators MUST use these mappings when reading/writing Supabase.
 */

/**
 * The 64 sub-defect columns in fqc_inspections table, in order of Excel columns L→BW.
 * This list is the EXACT column names from the actual DB, verified via REST API.
 */
export const SUBDEFECT_DB_COLUMNS: string[] = [
  // Stitching (针车问题): L-Z = indices 0-14 (15 cols)
  'sub_float_fold_skip',        // 0  - L
  'sub_missing_loose_stitch',    // 1  - M
  'sub_not_stitched',            // 2  - N
  'sub_needle_hole',             // 3  - O
  'sub_missing_bartack',         // 4  - P
  'sub_presser_mark',            // 5  - Q
  'sub_backtack_off',            // 6  - R
  'sub_wrong_panel',             // 7  - S
  'sub_end_unfolded',            // 8  - T
  'sub_velcro_reversed',         // 9  - U
  'sub_asymmetric',              // 10 - V
  'sub_triangle_uneven',         // 11 - W
  'sub_thread_bleed',            // 12 - X
  'sub_thread_ends',             // 13 - Y
  'sub_foam_misaligned',         // 14 - Z
  // Logo (LOGO问题): AA-AD = indices 15-18 (4 cols)
  'sub_logo_crooked',            // 15 - AA
  'sub_logo_inverted',           // 16 - AB
  'sub_logo_defective',          // 17 - AC
  'sub_logo_detached',           // 18 - AD
  // Material (面料问题): AE-AI = indices 19-23 (5 cols)
  'sub_color_diff',              // 19 - AE
  'sub_yarn_pull',               // 20 - AF
  'sub_wrinkle',                 // 21 - AG
  'sub_damaged',                 // 22 - AH
  'sub_seam_open',               // 23 - AI
  // Hardware (五金问题): AJ-AL = indices 24-26 (3 cols)
  'sub_scratched',               // 24 - AJ
  'sub_poor_function',           // 25 - AK
  'sub_missing_accessory',       // 26 - AL
  // Appearance (外观问题): AM-AQ = indices 27-31 (5 cols)
  'sub_dirty_oily',              // 27 - AM
  'sub_bone_uneven',             // 28 - AN
  'sub_bag_crooked',             // 29 - AO
  'sub_handle_misaligned',       // 30 - AP
  'sub_missing_rivet',           // 31 - AQ
  // Zipper (拉链问题): AR-AU = indices 32-35 (4 cols)
  'sub_sharp_stuck',             // 32 - AR
  'sub_zipper_wave',             // 33 - AS
  'sub_zipper_head_reversed',    // 34 - AT
  'sub_wrong_color_zipper',      // 35 - AU
  // Webbing (织带问题): AV-AW = indices 36-37 (2 cols)
  'sub_webbing_twisted',         // 36 - AV
  'sub_stitch_offcenter',        // 37 - AW
  // Other (其它问题): AX-BC = indices 38-43 (6 cols)
  'sub_wash_label_reversed',     // 38 - AX
  'sub_wash_label_wrong',        // 39 - AY
  'sub_woven_label_reversed',    // 40 - AZ
  'sub_woven_label_missing',     // 41 - BA
  'sub_lining_reversed',         // 42 - BB
  'sub_plastic_defective',       // 43 - BC
  // Preparation (备料问题): BD-BV = indices 44-62 (19 cols)
  'sub_rivet_defective',         // 44 - BD
  'sub_accessory_crooked',       // 45 - BE
  'sub_paint_off',               // 46 - BF
  'sub_bartack_misaligned',      // 47 - BG
  'sub_bartack_nonstandard',     // 48 - BH
  'sub_logo_tilted',             // 49 - BI
  'sub_velcro_tilted',           // 50 - BJ
  'sub_velcro_loose',            // 51 - BK
  'sub_trolley_cover_tilted',    // 52 - BL
  'sub_trolley_cover_short',     // 53 - BM
  'sub_webbing_misplaced',       // 54 - BN
  'sub_webbing_height_off',      // 55 - BO
  'sub_stitch_margin_inconsistent', // 56 - BP
  'sub_loose_thread',            // 57 - BQ
  'sub_float_skip2',             // 58 - BR
  'sub_pattern_stitch_inconsistent', // 59 - BS
  'sub_elastic_tilted',          // 60 - BT
  'sub_logo_text_detached',      // 61 - BU
  'sub_logo_scratched',          // 62 - BV
  // Stitch Defect (针车不良): BW = index 63 (1 col)
  'sub_triangle_reversed',       // 63 - BW
];

// Total: 15+4+5+3+5+4+2+6+19+1 = 64
export const TOTAL_SUBDEFECTS = SUBDEFECT_DB_COLUMNS.length; // 64

/**
 * Expand a sub_defects number array (64 elements) into a DB row object
 * with individual sub_* column names.
 */
export function expandSubDefects(subDefects: number[]): Record<string, number> {
  const row: Record<string, number> = {};
  for (let i = 0; i < SUBDEFECT_DB_COLUMNS.length; i++) {
    row[SUBDEFECT_DB_COLUMNS[i]] = subDefects[i] || 0;
  }
  return row;
}

/**
 * Collapse a DB row's sub_* columns back into a number array (64 elements).
 */
export function collapseSubDefects(row: Record<string, unknown>): number[] {
  return SUBDEFECT_DB_COLUMNS.map(col => Number(row[col]) || 0);
}

/**
 * Map an FQC inspection DB row to the application's expected shape.
 * DB uses: production_line, inspector_name, style_code
 * App uses: line, inspector, style (and sub_defects as array)
 */
export function mapInspectionRow(row: Record<string, unknown>) {
  return {
    ...row,
    line: row.production_line,
    inspector: row.inspector_name,
    style: row.style_code,
    sub_defects: collapseSubDefects(row),
  };
}

/**
 * Columns that exist in the app's FQCRecord but NOT in the DB table.
 * These must be excluded when building DB insert rows.
 */
const APP_ONLY_FIELDS = new Set([
  'line', 'inspector', 'style', 'sub_defects',
  'total_defects', 'created_at', 'id',
]);

/**
 * Map application FQC record to DB column names for insert.
 */
export function mapInspectionToDb(record: {
  line: string;
  inspector: string;
  style: string;
  sub_defects: number[];
  [key: string]: unknown;
}): Record<string, unknown> {
  const { line, inspector, style, sub_defects } = record;
  const dbRow: Record<string, unknown> = {
    production_line: line,
    inspector_name: inspector,
    style_code: style,
  };
  // Only copy fields that actually exist in the DB
  for (const [key, val] of Object.entries(record)) {
    if (!APP_ONLY_FIELDS.has(key)) {
      dbRow[key] = val;
    }
  }
  // Expand sub_defects array into 64 individual sub_* columns
  return {
    ...dbRow,
    ...expandSubDefects(sub_defects || []),
  };
}
