const { Client } = require('pg');
const connectionString = 'postgresql://postgres.ertwyuvwjfknpiunbouh:HudaDb2026%23@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('staff_qa', 'manager_qc', 'manager_umum', 'spv_qc')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FQC DAILY UPLOADS
CREATE TABLE IF NOT EXISTS fqc_daily_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  business_type TEXT,
  record_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'error')),
  error_message TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FQC INSPECTIONS
CREATE TABLE IF NOT EXISTS fqc_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_id UUID REFERENCES fqc_daily_uploads(id) ON DELETE SET NULL,
  inspection_date DATE NOT NULL,
  production_line TEXT,
  inspector_name TEXT,
  style_code TEXT,
  order_no TEXT NOT NULL,
  business_type TEXT,
  order_qty INTEGER,
  inspected_qty INTEGER,
  ok_qty INTEGER,
  ng_qty INTEGER,
  defect_rate DECIMAL(10, 6),
  remark TEXT,
  defect_stitching INTEGER DEFAULT 0,
  defect_logo INTEGER DEFAULT 0,
  defect_material INTEGER DEFAULT 0,
  defect_hardware INTEGER DEFAULT 0,
  defect_appearance INTEGER DEFAULT 0,
  defect_zipper INTEGER DEFAULT 0,
  defect_webbing INTEGER DEFAULT 0,
  defect_other INTEGER DEFAULT 0,
  defect_preparation INTEGER DEFAULT 0,
  defect_stitch_defect INTEGER DEFAULT 0,
  sub_float_fold_skip INTEGER DEFAULT 0,
  sub_missing_loose_stitch INTEGER DEFAULT 0,
  sub_not_stitched INTEGER DEFAULT 0,
  sub_needle_hole INTEGER DEFAULT 0,
  sub_missing_bartack INTEGER DEFAULT 0,
  sub_presser_mark INTEGER DEFAULT 0,
  sub_backtack_off INTEGER DEFAULT 0,
  sub_wrong_panel INTEGER DEFAULT 0,
  sub_end_unfolded INTEGER DEFAULT 0,
  sub_velcro_reversed INTEGER DEFAULT 0,
  sub_asymmetric INTEGER DEFAULT 0,
  sub_triangle_uneven INTEGER DEFAULT 0,
  sub_thread_bleed INTEGER DEFAULT 0,
  sub_thread_ends INTEGER DEFAULT 0,
  sub_foam_misaligned INTEGER DEFAULT 0,
  sub_logo_crooked INTEGER DEFAULT 0,
  sub_logo_inverted INTEGER DEFAULT 0,
  sub_logo_defective INTEGER DEFAULT 0,
  sub_logo_detached INTEGER DEFAULT 0,
  sub_color_diff INTEGER DEFAULT 0,
  sub_yarn_pull INTEGER DEFAULT 0,
  sub_wrinkle INTEGER DEFAULT 0,
  sub_damaged INTEGER DEFAULT 0,
  sub_seam_open INTEGER DEFAULT 0,
  sub_scratched INTEGER DEFAULT 0,
  sub_poor_function INTEGER DEFAULT 0,
  sub_missing_accessory INTEGER DEFAULT 0,
  sub_dirty_oily INTEGER DEFAULT 0,
  sub_bone_uneven INTEGER DEFAULT 0,
  sub_bag_crooked INTEGER DEFAULT 0,
  sub_handle_misaligned INTEGER DEFAULT 0,
  sub_missing_rivet INTEGER DEFAULT 0,
  sub_sharp_stuck INTEGER DEFAULT 0,
  sub_zipper_wave INTEGER DEFAULT 0,
  sub_zipper_head_reversed INTEGER DEFAULT 0,
  sub_wrong_color_zipper INTEGER DEFAULT 0,
  sub_webbing_twisted INTEGER DEFAULT 0,
  sub_stitch_offcenter INTEGER DEFAULT 0,
  sub_wash_label_reversed INTEGER DEFAULT 0,
  sub_wash_label_wrong INTEGER DEFAULT 0,
  sub_woven_label_reversed INTEGER DEFAULT 0,
  sub_woven_label_missing INTEGER DEFAULT 0,
  sub_lining_reversed INTEGER DEFAULT 0,
  sub_plastic_defective INTEGER DEFAULT 0,
  sub_rivet_defective INTEGER DEFAULT 0,
  sub_accessory_crooked INTEGER DEFAULT 0,
  sub_paint_off INTEGER DEFAULT 0,
  sub_bartack_misaligned INTEGER DEFAULT 0,
  sub_bartack_nonstandard INTEGER DEFAULT 0,
  sub_logo_tilted INTEGER DEFAULT 0,
  sub_velcro_tilted INTEGER DEFAULT 0,
  sub_velcro_loose INTEGER DEFAULT 0,
  sub_trolley_cover_tilted INTEGER DEFAULT 0,
  sub_trolley_cover_short INTEGER DEFAULT 0,
  sub_webbing_misplaced INTEGER DEFAULT 0,
  sub_webbing_height_off INTEGER DEFAULT 0,
  sub_stitch_margin_inconsistent INTEGER DEFAULT 0,
  sub_loose_thread INTEGER DEFAULT 0,
  sub_float_skip2 INTEGER DEFAULT 0,
  sub_pattern_stitch_inconsistent INTEGER DEFAULT 0,
  sub_elastic_tilted INTEGER DEFAULT 0,
  sub_logo_text_detached INTEGER DEFAULT 0,
  sub_logo_scratched INTEGER DEFAULT 0,
  sub_triangle_reversed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. OQC DAILY LOTS
CREATE TABLE IF NOT EXISTS oqc_daily_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_date DATE NOT NULL,
  business_type TEXT,
  total_orders INTEGER DEFAULT 0,
  lot_size INTEGER DEFAULT 0,
  aql_code TEXT,
  sample_size INTEGER,
  ac INTEGER,
  re INTEGER,
  critical_defects INTEGER DEFAULT 0,
  major_defects INTEGER DEFAULT 0,
  minor_defects INTEGER DEFAULT 0,
  total_defects INTEGER DEFAULT 0,
  sample_ok INTEGER DEFAULT 0,
  pass_rate DECIMAL(10, 6),
  disposition TEXT CHECK (disposition IN ('RELEASE', 'REWORK', 'HOLD')),
  release_qty INTEGER DEFAULT 0,
  rework_qty INTEGER DEFAULT 0,
  hold_qty INTEGER DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. OQC LOT-ORDER MAPPING
CREATE TABLE IF NOT EXISTS oqc_lot_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id UUID REFERENCES oqc_daily_lots(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES fqc_inspections(id) ON DELETE SET NULL,
  order_no TEXT,
  style_code TEXT,
  production_line TEXT,
  inspector_name TEXT,
  order_qty INTEGER,
  fqc_ok_qty INTEGER,
  oqc_sample INTEGER,
  disposition TEXT,
  remarks TEXT
);

-- 6. OQC DEFECTS
CREATE TABLE IF NOT EXISTS oqc_defects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id UUID REFERENCES oqc_daily_lots(id) ON DELETE CASCADE,
  defect_category TEXT NOT NULL,
  defect_count INTEGER DEFAULT 0,
  severity TEXT CHECK (severity IN ('Critical', 'Major', 'Minor'))
);

-- 7. IPQC RECORDS
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

-- 8. RCA WEEKLY
CREATE TABLE IF NOT EXISTS rca_weekly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  business_type TEXT,
  total_inspections INTEGER DEFAULT 0,
  total_inspected INTEGER DEFAULT 0,
  total_ok INTEGER DEFAULT 0,
  total_ng INTEGER DEFAULT 0,
  overall_pass_rate DECIMAL(10, 6),
  top_category_1 TEXT,
  top_category_1_qty INTEGER DEFAULT 0,
  top_category_2 TEXT,
  top_category_2_qty INTEGER DEFAULT 0,
  top_category_3 TEXT,
  top_category_3_qty INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  top_categories JSONB DEFAULT '[]',
  top_sub_defects JSONB DEFAULT '[]',
  top_styles JSONB DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RCA ACTIONS
CREATE TABLE IF NOT EXISTS rca_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rca_id UUID REFERENCES rca_weekly(id) ON DELETE CASCADE,
  rank INTEGER CHECK (rank IN (1, 2, 3)),
  category TEXT,
  sub_defects JSONB DEFAULT '[]',
  defect_qty INTEGER DEFAULT 0,
  style_codes JSONB DEFAULT '[]',
  root_cause TEXT,
  impact TEXT,
  process TEXT,
  corrective_action TEXT,
  photo_url TEXT,
  preventive_action TEXT,
  deadline DATE,
  responsible TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  filled_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_fqc_date ON fqc_inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_fqc_business ON fqc_inspections(business_type);
CREATE INDEX IF NOT EXISTS idx_fqc_order ON fqc_inspections(order_no);
CREATE INDEX IF NOT EXISTS idx_fqc_upload ON fqc_inspections(upload_id);
CREATE INDEX IF NOT EXISTS idx_oqc_date ON oqc_daily_lots(lot_date);
CREATE INDEX IF NOT EXISTS idx_oqc_business ON oqc_daily_lots(business_type);
CREATE INDEX IF NOT EXISTS idx_oqco_lot ON oqc_lot_orders(lot_id);
CREATE INDEX IF NOT EXISTS idx_oqcd_lot ON oqc_defects(lot_id);
CREATE INDEX IF NOT EXISTS idx_ipqc_date ON ipqc_records(inspection_date);
CREATE INDEX IF NOT EXISTS idx_rca_week ON rca_weekly(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_rcaact_rca ON rca_actions(rca_id);

-- DEFAULT ADMIN (password: admin123)
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'System Admin', 'staff_qa')
ON CONFLICT (username) DO NOTHING;
`;

async function setup() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected');
  try {
    await client.query(sql);
    console.log('Schema created!');
    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log('Tables:', res.rows.map(r => r.tablename).join(', '));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
setup();
