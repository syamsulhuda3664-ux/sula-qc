const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected');
  try {
    // Rename old table
    await client.query(`ALTER TABLE IF EXISTS ipqc_records RENAME TO ipqc_records_old`);
    console.log('Renamed ipqc_records -> ipqc_records_old');

    // Create new table with proper structure
    await client.query(`
      CREATE TABLE IF NOT EXISTS ipqc_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        inspection_date DATE NOT NULL,
        business_type TEXT,
        production_line TEXT,
        inspector_name TEXT,
        style_code TEXT,
        order_no TEXT,
        session_no SMALLINT NOT NULL CHECK (session_no BETWEEN 1 AND 5),
        process_stage TEXT NOT NULL,
        component_checked TEXT NOT NULL,
        finding TEXT,
        check_count INTEGER DEFAULT 0,
        ok_count INTEGER DEFAULT 0,
        ng_count INTEGER DEFAULT 0,
        action_taken TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Created new ipqc_records table');

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ipqc_date ON ipqc_records(inspection_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ipqc_date_order ON ipqc_records(inspection_date, order_no);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ipqc_date_session ON ipqc_records(inspection_date, order_no, session_no);`);
    console.log('Created indexes');

    // Drop old table
    await client.query(`DROP TABLE IF EXISTS ipqc_records_old`);
    console.log('Dropped old ipqc_records_old');

    // Verify
    const res = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ipqc_records' ORDER BY ordinal_position"
    );
    console.log('New ipqc_records columns:');
    res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
