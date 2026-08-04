const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });

(async () => {
  // Check rca_weekly top_sub_defects JSONB for Preparation entries
  const res = await pool.query(`
    SELECT id, week_start, week_end, business_type, top_sub_defects, top_categories
    FROM rca_weekly
    WHERE top_categories::text ILIKE '%Preparation%'
    ORDER BY week_start
    LIMIT 3
  `);
  
  console.log(`Found ${res.rows.length} RCAs with Preparation in top categories\n`);
  
  for (const row of res.rows) {
    console.log(`RCA ID: ${row.id}`);
    console.log(`  Week: ${row.week_start} ~ ${row.week_end} | BT: ${row.business_type}`);
    console.log(`  top_categories:`);
    console.log(`    ${JSON.stringify(row.top_categories, null, 2)}`);
    console.log(`  top_sub_defects (total ${row.top_sub_defects?.length || 0} items):`);
    const prepSubs = (row.top_sub_defects || []).filter(s => s.category === 'Preparation' || s.categoryKey === 'defect_preparation');
    console.log(`    Preparation subs: ${prepSubs.length}`);
    prepSubs.forEach(s => console.log(`      - ${s.subDefect}: ${s.defectCount}`));
    console.log('---');
  }

  // Also check: how many RCAs have ANY Preparation sub-defects
  const res2 = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN top_sub_defects::text ILIKE '%Preparation%' THEN 1 END) as with_prep_subs
    FROM rca_weekly
  `);
  console.log(`\nTotal RCAs: ${res2.rows[0].total}, with Preparation sub-defects in JSON: ${res2.rows[0].with_prep_subs}`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
