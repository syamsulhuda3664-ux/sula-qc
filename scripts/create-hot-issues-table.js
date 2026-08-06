const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = `
-- HOT ISSUES TABLE
-- Manual entry by staff_qa/manager_qc, feeds into RCA top 3
CREATE TABLE IF NOT EXISTS rca_hot_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_date DATE NOT NULL,
  business_type TEXT NOT NULL,
  category TEXT,
  sub_defect TEXT NOT NULL,
  defect_qty INTEGER DEFAULT 0,
  style_codes TEXT[] DEFAULT '{}',
  root_cause TEXT,
  impact TEXT,
  process TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  responsible TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  photo_before TEXT,
  photo_after TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotissue_date ON rca_hot_issues(issue_date);
CREATE INDEX IF NOT EXISTS idx_hotissue_bt ON rca_hot_issues(business_type);
CREATE INDEX IF NOT EXISTS idx_hotissue_date_bt ON rca_hot_issues(issue_date, business_type);
`;

async function setup() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');
  try {
    await client.query(sql);
    console.log('rca_hot_issues table created!');
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='rca_hot_issues' ORDER BY ordinal_position");
    console.log('Columns:');
    res.rows.forEach(r => console.log('  -', r.column_name, r.data_type));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
setup();
