/**
 * DB Schema mapping — maps application field names to actual Supabase column names.
 * The DB was created with different naming conventions than the code originally assumed.
 *
 * All API routes and generators MUST use these mappings when reading/writing Supabase.
 */

/**
 * The 61 sub-defect columns in fqc_inspections table, in order of Excel columns L→BW (index 0→60).
 * Used to expand the parsed sub_defects array into individual DB columns.
 */
export const SUBDEFECT_COLUMNS: string[] = [
  'sub_float_fold_skip',        // 0  - L  (Stitching)
  'sub_missing_loose_stitch',    // 1  - M
  'sub_not_stitched',            // 2  - N
  'sub_needle_hole',             // 3  - O
  'sub_missing_bartack',         // 4  - P
  'sub_presser_mark',            // 5  - Q
  'sub_backtack_off',            // 6  - R
  'sub_wrong_panel',             // 7  - S
  'sub_end_unfolded',            // 8  - T
  'sub_asymmetric',              // 9  - U
  'sub_triangle_uneven',         // 10 - V
  'sub_thread_bleed',            // 11 - W
  'sub_thread_ends',             // 12 - X
  'sub_foam_misaligned',         // 13 - Y
  'sub_stitch_offcenter',        // 14 - Z  (end Stitching, 15 cols)
  'sub_logo_crooked',            // 15 - AA (Logo)
  'sub_logo_inverted',           // 16 - AB
  'sub_logo_defective',          // 17 - AC
  'sub_logo_detached',           // 18 - AD (end Logo, 4 cols)
  'sub_color_diff',              // 19 - AE (Material)
  'sub_yarn_pull',               // 20 - AF
  'sub_wrinkle',                 // 21 - AG
  'sub_damaged',                 // 22 - AH
  'sub_seam_open',               // 23 - AI (end Material, 5 cols)
  'sub_scratched',               // 24 - AJ (Hardware)
  'sub_poor_function',           // 25 - AK
  'sub_missing_accessory',       // 26 - AL (end Hardware, 3 cols)
  'sub_dirty_oily',              // 27 - AM (Appearance)
  'sub_bone_uneven',             // 28 - AN
  'sub_bag_crooked',             // 29 - AO
  'sub_handle_misaligned',       // 30 - AP
  'sub_missing_rivet',           // 31 - AQ (end Appearance, 5 cols)
  'sub_sharp_stuck',             // 32 - AR (Zipper)
  'sub_zipper_wave',             // 33 - AS
  'sub_zipper_head_reversed',    // 34 - AT
  'sub_wrong_color_zipper',      // 35 - AU (end Zipper, 4 cols)
  'sub_webbing_twisted',         // 36 - AV (Webbing)
  'sub_webbing_misplaced',       // 37 - AW (end Webbing, 2 cols)
  'sub_wash_label_reversed',     // 38 - AX (Other)
  'sub_wash_label_wrong',        // 39 - AY
  'sub_woven_label_reversed',    // 40 - AZ
  'sub_woven_label_missing',     // 41 - BA
  'sub_lining_reversed',         // 42 - BB
  'sub_plastic_defective',       // 43 - BC (end Other, 6 cols)
  'sub_rivet_defective',         // 44 - BD (Preparation)
  'sub_accessory_crooked',       // 45 - BE
  'sub_paint_off',               // 46 - BF
  'sub_bartack_misaligned',      // 47 - BG
  'sub_bartack_nonstandard',     // 48 - BH
  'sub_logo_tilted',             // 49 - BI
  'sub_velcro_tilted',           // 50 - BJ
  'sub_velcro_loose',            // 51 - BK
  'sub_trolley_cover_tilted',    // 52 - BL
  'sub_trolley_cover_short',     // 53 - BM
  'sub_webbing_height_off',      // 54 - BN
  'sub_stitch_margin_inconsistent', // 55 - BO
  'sub_loose_thread',            // 56 - BP
  'sub_float_skip2',             // 57 - BQ
  'sub_pattern_stitch_inconsistent', // 58 - BR
  'sub_elastic_tilted',          // 59 - BS
  'sub_logo_text_detached',      // 60 - BT
  'sub_logo_scratched',          // 61 - BU
  'sub_triangle_reversed',       // 62 - BV
];

// Note: There are 63 columns listed above but the Excel has 61 sub-defect columns (L=11 to BW=71).
// Let's verify the count and adjust:
// Stitching: L-Z = 15 cols (indices 0-14)
// Logo: AA-AD = 4 cols (indices 15-18)
// Material: AE-AI = 5 cols (indices 19-23)
// Hardware: AJ-AL = 3 cols (indices 24-26)
// Appearance: AM-AQ = 5 cols (indices 27-31)
// Zipper: AR-AU = 4 cols (indices 32-35)
// Webbing: AV-AW = 2 cols (indices 36-37)
// Other: AX-BC = 6 cols (indices 38-43)
// Preparation: BD-BV = 16 cols (indices 44-59)
// Stitch Defect: BW = 1 col (index 60)
// Total: 15+4+5+3+5+4+2+6+16+1 = 61 ✓

// Remove extras — only keep exactly 61
export const SUBDEFECT_DB_COLUMNS: string[] = SUBDEFECT_COLUMNS.slice(0, 61);

/**
 * Expand a sub_defects number array (61 elements) into a DB row object
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
 * Collapse a DB row's sub_* columns back into a number array (61 elements).
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
 * Map application FQC record to DB column names for insert.
 */
export function mapInspectionToDb(record: {
  line: string;
  inspector: string;
  style: string;
  sub_defects: number[];
 [key: string]: unknown;
}): Record<string, unknown> {
  const { line, inspector, style, sub_defects, ...rest } = record;
  return {
    ...rest,
    production_line: line,
    inspector_name: inspector,
    style_code: style,
    ...expandSubDefects(sub_defects || []),
  };
}
