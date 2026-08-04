const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = `
ALTER TABLE rca_weekly
  ADD COLUMN IF NOT EXISTS top_categories JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS top_sub_defects JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS top_styles JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

ALTER TABLE rca_actions
  ADD COLUMN IF NOT EXISTS responsible TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
`;

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected');
  try {
    await client.query(sql);
    console.log('RCA migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
}
migrate();
