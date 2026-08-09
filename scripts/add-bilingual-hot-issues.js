const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = `
-- Add bilingual (Mandarin) columns to rca_hot_issues
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS root_cause_zh TEXT;
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS impact_zh TEXT;
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS process_zh TEXT;
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS corrective_action_zh TEXT;
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS preventive_action_zh TEXT;
ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS responsible_zh TEXT;
`;

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');
  try {
    await client.query(sql);
    console.log('Bilingual columns added to rca_hot_issues!');
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='rca_hot_issues' ORDER BY ordinal_position");
    console.log('Current columns:');
    res.rows.forEach(r => console.log('  -', r.column_name, r.data_type));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
migrate();
