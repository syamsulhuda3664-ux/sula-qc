const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });

(async () => {
  const prepCols = ['sub_rivet_defective','sub_accessory_crooked','sub_paint_off','sub_bartack_misaligned','sub_bartack_nonstandard','sub_logo_tilted','sub_velcro_tilted','sub_velcro_loose','sub_trolley_cover_tilted','sub_trolley_cover_short','sub_webbing_misplaced','sub_webbing_height_off','sub_stitch_margin_inconsistent','sub_loose_thread','sub_float_skip2','sub_pattern_stitch_inconsistent','sub_elastic_tilted','sub_logo_text_detached','sub_logo_scratched'];
  
  // 1. Total sum of each preparation sub-column across ALL records
  const sel1 = prepCols.map(c => `COALESCE(SUM(${c}),0) as ${c}`).join(', ');
  const res1 = await pool.query(`SELECT ${sel1} FROM fqc_inspections`);
  const totalRow = res1.rows[0];
  let grandTotal = 0;
  console.log('=== TOTAL across ALL records ===');
  prepCols.forEach(c => {
    const v = Number(totalRow[c]) || 0;
    grandTotal += v;
    if (v > 0) console.log(`  ${c}: ${v}`);
  });
  console.log(`Grand total of all prep subs: ${grandTotal}`);

  // 2. Check records where defect_preparation > 0
  const sel2 = prepCols.map(c => `COALESCE(${c},0) as ${c}`).join(', ');
  const res2 = await pool.query(`SELECT id, defect_preparation, ${sel2} FROM fqc_inspections WHERE defect_preparation > 0 LIMIT 5`);
  console.log('\n=== Records with defect_preparation > 0 ===');
  for (const row of res2.rows) {
    const subSum = prepCols.reduce((s, c) => s + (Number(row[c]) || 0), 0);
    console.log(`ID=${row.id}: defect_preparation=${row.defect_preparation}, sub_sum=${subSum}`);
    if (subSum === 0) console.log('  >>> ALL SUB-COLUMNS ARE ZERO <<<');
  }

  // 3. Also check overall defect_preparation total
  const res3 = await pool.query('SELECT COALESCE(SUM(defect_preparation),0) as total FROM fqc_inspections');
  console.log(`\nTotal defect_preparation in DB: ${res3.rows[0].total}`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
