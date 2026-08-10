/**
 * IPQC Generator v3 — Bag & Suitcase Manufacturing
 * 
 * Generates exactly 5 sessions per order per day.
 * Each session checks 1 process stage + 1 specific component.
 * Sessions cycle through the active stages for that order.
 * Uses deterministic PRNG seeded by date + order_no for consistency.
 * Approach A: finding + action + result in one row (no open/closed status).
 */

// ═══════════════════════════════════════════════════════════
// PROCESS STAGES & COMPONENTS (Bag/Suitcase Manufacturing)
// ═══════════════════════════════════════════════════════════

export const IPQC_STAGES = ['Cutting', 'Sewing', 'Assembly', 'Finishing'] as const;
export type IPQCStage = typeof IPQC_STAGES[number];

/**
 * Components per stage. Generator picks one per session.
 * Realistic components checked during IPQC in bag/suitcase factory.
 */
const STAGE_COMPONENTS: Record<IPQCStage, string[]> = {
  Cutting: [
    'Panel kain utama (Main fabric panels)',
    'Lining / Furing (Lining fabric)',
    'Foam / Busa (Foam inserts)',
    'Webbing / Tali (Webbing straps)',
    'Komponen kecil: D-ring, buckle, rivet (Small parts)',
  ],
  Sewing: [
    'Jahit samping badan (Side seam)',
    'Jahit ritsleting / zipper (Zipper stitching)',
    'Jahit handle / gagang (Handle attachment)',
    'Jahit webbing ke badan (Webbing attachment)',
    'Jahit aksen / dekorasi (Topstitch & detail)',
  ],
  Assembly: [
    'Pasang zipper slider & puller',
    'Pasang handle ke badan (Handle assembly)',
    'Pasang wheel / roda (Wheel assembly for luggage)',
    'Pasang trolley / pegangan tarik (Trolley handle)',
    'Pasang aksesori: tag, label, hook',
  ],
  Finishing: [
    'Pemasangan label & wash label',
    'Pembersihan benang sisa & oil stain',
    'Cek kelurusan & simetri bag',
    'Pemasangan silica gel & polybag',
    'Final check sebelum packing',
  ],
};

// ═══════════════════════════════════════════════════════════
// DEFECT DICTIONARY — Realistic for bag/suitcase manufacturing
// ═══════════════════════════════════════════════════════════

interface DefectEntry {
  finding: string;
  action: string;
  weight: number; // probability weight (higher = more common)
}

const STAGE_DEFECTS: Record<IPQCStage, DefectEntry[]> = {
  Cutting: [
    { finding: 'Color deviation pada 2 panel kain utama', action: 'Potong ulang 2 panel, ganti dari roll kain yang sama', weight: 15 },
    { finding: 'Ukuran panel tidak sesuai pola (toleransi >2mm)', action: 'Adjust pola cutting, potong ulang 1 pcs', weight: 12 },
    { finding: 'Grain direction kain salah arah pada 3 panel', action: 'Sortir ulang, potong ulang dengan arah grain benar', weight: 10 },
    { finding: 'Fabric defect (jarum tertusuk / hole) pada 1 panel', action: 'Buang panel cacat, potong pengganti', weight: 8 },
    { finding: 'Tepi kain raveling / fraying berlebihan', action: 'Ganti pisau cutting, check tension', weight: 6 },
    { finding: 'Kain belang-belang (shade variation) antar roll', action: 'Klaim ke supplier, pakai roll yang sama untuk 1 order', weight: 5 },
    { finding: 'Foam / busa tipis tidak sesuai spesifikasi', action: 'Ganti foam dari stok yang benar, check ketebalan', weight: 4 },
    { finding: 'Webbing potongan miring / tidak 90 derajat', action: 'Potong ulang dengan jig guide', weight: 3 },
  ],
  Sewing: [
    { finding: 'Skip stitch pada jahitan samping (3 titik)', action: 'Re-stitch area yang skip, periksa jarum & benang', weight: 18 },
    { finding: 'Needle hole terlalu besar / visible pada kain gelap', action: 'Ganti ukuran jarum (no.9 ke no.11), re-stitch', weight: 8 },
    { finding: 'Bartack handle tidak rata / salah posisi', action: 'Bongkar bartack, posisi ulang, bartack ulang', weight: 10 },
    { finding: 'Jahitan tidak mengikuti garis pola (off-line 2mm)', action: 'Adjust needle position, re-stitch', weight: 9 },
    { finding: 'Tension benang tidak konsisten (baggy/loose)', action: 'Adjust tension upper & bobbin, test jahit sampel', weight: 7 },
    { finding: 'Benang putus di tengah jahitan (thread break)', action: 'Knot & backtack, lanjutkan jahitan, periksa benang', weight: 6 },
    { finding: 'Puckering / kain mengkerut setelah dijahit', action: 'Adjust tension & differential feed, re-stitch jika perlu', weight: 5 },
    { finding: 'Wrong stitch type pada bagian tertentu', action: 'Bongkar jahitan, jahit ulang dengan stitch type benar', weight: 3 },
    { finding: 'Oil stain dari mesin pada 2 pcs', action: 'Bersihkan mesin, coba hilangkan noda dengan solvent, ganti jika tidak bisa', weight: 4 },
    { finding: 'Jahit webbing ke badan tidak centered', action: 'Bongkar, posisi ulang dengan center mark, re-stitch', weight: 7 },
  ],
  Assembly: [
    { finding: 'Zipper stuck / macet saat ditarik', action: 'Ganti zipper slider, test berulang', weight: 15 },
    { finding: 'Handle loose / longgar setelah dipasang', action: 'Perkuat bartack, tambahan rivet jika perlu', weight: 12 },
    { finding: 'Wheel tidak berputar lancar (2 dari 4 roda)', action: 'Ganti wheel yang bermasalah, test berputar', weight: 10 },
    { finding: 'Trolley handle macet / tidak naik turun', action: 'Adjust mekanisme trolley, lubricate, ganti jika perlu', weight: 8 },
    { finding: 'Rivet longgar / bisa diputar', action: 'Re-rivet dengan tools yang benar, check pressure', weight: 7 },
    { finding: 'Buckle / snap hook salah posisi', action: 'Bongkar, pasang ulang di posisi benar', weight: 5 },
    { finding: 'Zipper head reversed / terbalik arah', action: 'Ganti zipper head dengan arah benar', weight: 4 },
    { finding: 'D-ring atau O-ring tidak tertutup rapi', action: 'Adjust penutup, bartack tambahan', weight: 3 },
  ],
  Finishing: [
    { finding: 'Label merek miring / posisi tidak centered', action: 'Bongkar label, pasang ulang dengan jig posisi', weight: 14 },
    { finding: 'Sisa benang / thread tail di 5 titik', action: 'Potong bersih semua thread tail, check dengan cahaya', weight: 12 },
    { finding: 'Oil stain / dirt pada bagian luar', action: 'Bersihkan dengan pembersih kain, reject jika tidak hilang', weight: 8 },
    { finding: 'Wash label terbalik / terbaca terbalik', action: 'Bongkar, pasang ulang dengan arah benar', weight: 5 },
    { finding: 'Silica gel tidak dimasukkan / tertinggal', action: 'Masukkan silica gel, seal polybag', weight: 4 },
    { finding: 'Polybag tidak tertutup rapat', action: 'Reseal polybag, check heat sealer', weight: 3 },
    { finding: 'Scratch / gores pada hardware (logo plate)', action: 'Ganti hardware yang tergores, reject part', weight: 6 },
    { finding: 'Bag body asimetris (sisi kiri-kanan beda)', action: 'Return ke sewing untuk koreksi, atau downgrade', weight: 4 },
    { finding: 'Hook / aksesori tertinggal tidak terpasang', action: 'Pasang hook, check kelengkapan vs BOM', weight: 3 },
    { finding: 'Kemasan karton kurang / tidak sesuai standar', action: 'Ganti karton, check spec packaging', weight: 2 },
  ],
};

// ═══════════════════════════════════════════════════════════
// DETERMINISTIC PRNG
// ═══════════════════════════════════════════════════════════

function seededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h) || 1;
}

function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * totalWeight;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// ═══════════════════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════════════════

export interface IPQCGeneratedRow {
  inspection_date: string;
  business_type: string;
  production_line: string;
  inspector_name: string;
  style_code: string;
  order_no: string;
  session_no: number;
  process_stage: string;
  component_checked: string;
  finding: string | null;
  check_count: number;
  ok_count: number;
  ng_count: number;
  action_taken: string | null;
}

/**
 * Determine which stages are active for this order based on FQC defect profile.
 * Doesn't force stages that don't have relevant defects.
 * Returns 2-4 stages, min 2 (most orders have at least sewing + assembly).
 */
function selectActiveStages(fqcRow: Record<string, unknown>, rng: () => number): IPQCStage[] {
  const scores: Record<IPQCStage, number> = {
    Cutting: 0,
    Sewing: 0,
    Assembly: 0,
    Finishing: 0,
  };

  // Score based on FQC defect categories
  const stitchDefects = (Number(fqcRow.defect_stitching) || 0) + (Number(fqcRow.defect_stitch_defect) || 0);
  scores.Sewing += stitchDefects * 0.7;
  scores.Assembly += stitchDefects * 0.2;
  scores.Finishing += stitchDefects * 0.1;

  scores.Cutting += (Number(fqcRow.defect_material) || 0) * 0.8 + (Number(fqcRow.defect_preparation) || 0) * 0.7;
  scores.Sewing += (Number(fqcRow.defect_material) || 0) * 0.15;

  scores.Assembly += (Number(fqcRow.defect_hardware) || 0) * 0.8 + (Number(fqcRow.defect_zipper) || 0) * 0.7;
  scores.Finishing += (Number(fqcRow.defect_zipper) || 0) * 0.2;

  scores.Sewing += (Number(fqcRow.defect_webbing) || 0) * 0.5;
  scores.Assembly += (Number(fqcRow.defect_webbing) || 0) * 0.3;
  scores.Finishing += (Number(fqcRow.defect_webbing) || 0) * 0.1;

  scores.Sewing += (Number(fqcRow.defect_appearance) || 0) * 0.25;
  scores.Assembly += (Number(fqcRow.defect_appearance) || 0) * 0.3;
  scores.Finishing += (Number(fqcRow.defect_appearance) || 0) * 0.45;

  scores.Assembly += (Number(fqcRow.defect_logo) || 0) * 0.6;
  scores.Finishing += (Number(fqcRow.defect_logo) || 0) * 0.4;

  scores.Finishing += (Number(fqcRow.defect_other) || 0) * 0.5;
  scores.Cutting += (Number(fqcRow.defect_other) || 0) * 0.3;
  scores.Assembly += (Number(fqcRow.defect_other) || 0) * 0.2;

  const sorted = (Object.entries(scores) as [IPQCStage, number][]).sort((a, b) => b[1] - a[1]);
  const totalDefects = Object.values(scores).reduce((s, v) => s + v, 0);

  if (totalDefects === 0) {
    // No defects — pick 2-3 random stages (most orders go through cutting + sewing + assembly)
    const numStages = 2 + Math.round(rng() * 1); // 2-3
    return sorted.slice(0, numStages).map(([s]) => s);
  }

  // Include stages that have score > 0, min 2, max 4
  const active = sorted.filter(([, score]) => score > 0);
  return active.slice(0, 4).map(([s]) => s);
}

/**
 * Build a schedule of 5 sessions from the active stages.
 * If 2 stages: [A, B, A, B, A] — cycles through
 * If 3 stages: [A, B, C, A, B]
 * If 4 stages: [A, B, C, D, A]
 * Ensures all active stages get checked at least once.
 */
function buildSessionSchedule(activeStages: IPQCStage[], rng: () => number): IPQCStage[] {
  const schedule: IPQCStage[] = [];
  for (let i = 0; i < 5; i++) {
    schedule.push(activeStages[i % activeStages.length]);
  }
  return schedule;
}

/**
 * Pick a component for a given stage and session.
 * Uses the session number to deterministically pick from the stage's component list.
 * Across 5 sessions, tries to cover different components within the same stage.
 */
function pickComponent(stage: IPQCStage, sessionNo: number, stageOccurrence: number, rng: () => number): string {
  const components = STAGE_COMPONENTS[stage];
  // Use stageOccurrence to pick a different component each time the same stage appears
  const idx = (stageOccurrence + Math.floor(rng() * 2)) % components.length;
  return components[idx];
}

/**
 * Generate IPQC records from FQC DB rows.
 *
 * For each FQC row (per order/line):
 * - Select 2-4 active stages based on defect profile
 * - Generate exactly 5 sessions (Ke-1 through Ke-5) TOTAL per order
 * - Each session picks 1 stage (cycling) + 1 component
 * - Some sessions find defects, some don't (realistic distribution)
 * - Defects drawn from weighted bag/suitcase defect dictionary
 * - Approach A: finding + action_taken in one row (no open/closed)
 *
 * Deterministic: same FQC input always produces same IPQC output.
 */
export function generateIPQCFromFQC(
  fqcRows: Record<string, unknown>[],
): IPQCGeneratedRow[] {
  const results: IPQCGeneratedRow[] = [];

  // ── Deduplicate FQC rows by (date, order_no) ──
  // One order may appear in multiple FQC rows (different lines, sub-lots, etc.)
  // IPQC must always be exactly 5 sessions per order per day.
  // Merge defect counts, keep first row's metadata.
  const mergedMap = new Map<string, Record<string, unknown>>();
  for (const row of fqcRows) {
    const dateStr = String(row.inspection_date || '').split('T')[0];
    const orderNo = String(row.order_no || '');
    if (!orderNo) continue;

    const key = `${dateStr}__${orderNo}`;
    if (mergedMap.has(key)) {
      // Merge numeric defect counts into existing row
      const existing = mergedMap.get(key)!;
      const numericKeys = [
        'inspected_qty', 'ok_qty', 'ng_qty',
        'defect_stitching', 'defect_stitch_defect', 'defect_logo',
        'defect_material', 'defect_hardware', 'defect_appearance',
        'defect_zipper', 'defect_webbing', 'defect_other', 'defect_preparation',
      ];
      for (const k of numericKeys) {
        const existingVal = Number(existing[k]) || 0;
        const newVal = Number(row[k]) || 0;
        if (newVal > 0) existing[k] = existingVal + newVal;
      }
    } else {
      mergedMap.set(key, { ...row });
    }
  }

  // Generate IPQC from deduplicated rows
  for (const fqcRow of mergedMap.values()) {
    const dateStr = String(fqcRow.inspection_date || '').split('T')[0];
    const bt = String(fqcRow.business_type || 'OTHER');
    const line = String(fqcRow.production_line || fqcRow.line || '');
    const inspector = String(fqcRow.inspector_name || fqcRow.inspector || '');
    const style = String(fqcRow.style_code || fqcRow.style || '');
    const orderNo = String(fqcRow.order_no || '');
    const inspectedQty = Number(fqcRow.inspected_qty) || 0;
    const okQty = Number(fqcRow.ok_qty) || 0;
    const ngQty = Number(fqcRow.ng_qty) || 0;
    const fqcPassRate = inspectedQty > 0 ? okQty / inspectedQty : 0.95;

    if (!orderNo) continue;

    // Seed based on date + order for deterministic output
    const baseSeed = hashSeed(`${dateStr}__${orderNo}`);
    const rng = seededRng(baseSeed);

    // Select which stages this order goes through (2-4 stages)
    const activeStages = selectActiveStages(fqcRow, rng);

    // Build exactly 5 sessions cycling through active stages
    const schedule = buildSessionSchedule(activeStages, rng);

    // Base check count per session: ~2-5% of FQC inspected qty
    const baseCheckPerSession = Math.max(3, Math.round(inspectedQty * (0.02 + rng() * 0.03)));

    // Track how many times each stage has appeared (for component variety)
    const stageOccurrence: Record<string, number> = {};

    for (let ses = 1; ses <= 5; ses++) {
      const sesRng = seededRng(baseSeed + ses * 1000);
      const stage = schedule[ses - 1];

      // Track occurrence count for this stage
      stageOccurrence[stage] = (stageOccurrence[stage] || 0) + 1;

      // Pick component (varies by stage occurrence to avoid repetition)
      const component = pickComponent(stage, ses, stageOccurrence[stage] - 1, sesRng);

      // Check count: vary slightly per session (80-120% of base)
      const checkCount = Math.max(3, Math.round(baseCheckPerSession * (0.8 + sesRng() * 0.4)));

      // Defect probability: ~30-50% chance a session finds something
      const defectChance = 0.30 + sesRng() * 0.20;
      const hasDefect = sesRng() < defectChance;

      let ngCount = 0;
      let finding: string | null = null;
      let action: string | null = null;

      if (hasDefect) {
        const defects = STAGE_DEFECTS[stage];
        const defect = pickWeighted(defects, sesRng);
        if (defect) {
          // NG count: 1-3 typically for IPQC spot check
          ngCount = 1 + Math.floor(sesRng() * 3);
          // Scale down if check count is small
          if (checkCount < 10) ngCount = Math.min(ngCount, Math.max(1, Math.floor(checkCount * 0.15)));
          ngCount = Math.min(ngCount, checkCount);

          finding = defect.finding;
          action = defect.action;
        }
      }

      const okCount = checkCount - ngCount;

      results.push({
        inspection_date: dateStr,
        business_type: bt,
        production_line: line,
        inspector_name: inspector,
        style_code: style,
        order_no: orderNo,
        session_no: ses,
        process_stage: stage,
        component_checked: component,
        finding: finding,
        check_count: checkCount,
        ok_count: okCount,
        ng_count: ngCount,
        action_taken: action,
      });
    }
  }

  return results;
}
