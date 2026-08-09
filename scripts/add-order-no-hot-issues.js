const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = `ALTER TABLE rca_hot_issues ADD COLUMN IF NOT EXISTS order_no TEXT;`;

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected');
  try {
    await client.query(sql);
    console.log('order_no column added to rca_hot_issues!');
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='rca_hot_issues' AND column_name='order_no'");
    console.log('Verified:', res.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
migrate();
