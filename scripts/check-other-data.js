const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });

(async () => {
  const otherCols = ['sub_wash_label_reversed','sub_wash_label_wrong','sub_woven_label_reversed','sub_woven_label_missing','sub_lining_reversed','sub_plastic_defective'];
  const sel = otherCols.map(c => `COALESCE(SUM(${c}),0) as ${c}`).join(', ');
  const res = await pool.query(`SELECT ${sel} FROM fqc_inspections`);
  const row = res.rows[0];
  let total = 0;
  console.log('=== Other sub-defect totals ===');
  otherCols.forEach(c => {
    const v = Number(row[c]) || 0;
    total += v;
    console.log(`  ${c}: ${v}`);
  });
  console.log(`Total: ${total}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
