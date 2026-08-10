const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected');
  try {
    // Add inspector_name column if not exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ipqc_records' AND column_name = 'inspector_name'
        ) THEN
          ALTER TABLE ipqc_records ADD COLUMN inspector_name TEXT;
        END IF;
      END $$;
    `);
    console.log('inspector_name column ready');

    // Add total_defects column if not exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ipqc_records' AND column_name = 'total_defects'
        ) THEN
          ALTER TABLE ipqc_records ADD COLUMN total_defects INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);
    console.log('total_defects column ready');

    // Verify
    const res = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ipqc_records' ORDER BY ordinal_position"
    );
    console.log('Current ipqc_records columns:');
    res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
migrate();
