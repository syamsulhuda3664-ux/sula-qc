/**
 * IPQC Content Translation Map (Indonesian → Mandarin)
 * 
 * Used by IPQCPage to translate auto-generated data content (component_checked,
 * finding, action_taken) when the viewer role is manager_qc or manager_umum (lang=zh).
 * 
 * The IPQC generator produces Indonesian text. This map provides the Mandarin
 * equivalent so managers can read the inspection data in their language.
 */

/**
 * Component name translations
 */
export const IPQC_COMPONENT_ZH: Record<string, string> = {
  // Cutting components
  'Panel kain utama (Main fabric panels)': '主面料裁片',
  'Lining / Furing (Lining fabric)': '里布/衬布',
  'Foam / Busa (Foam inserts)': '泡棉',
  'Webbing / Tali (Webbing straps)': '织带/绑带',
  'Komponen kecil: D-ring, buckle, rivet (Small parts)': '小配件：D型环、插扣、铆钉',

  // Sewing components
  'Jahit samping badan (Side seam)': '车缝侧身缝线',
  'Jahit ritsleting / zipper (Zipper stitching)': '车缝拉链',
  'Jahit handle / gagang (Handle attachment)': '车缝提手',
  'Jahit webbing ke badan (Webbing attachment)': '织带与本体车缝',
  'Jahit aksen / dekorasi (Topstitch & detail)': '车缝装饰线/细节',

  // Assembly components
  'Pasang zipper slider & puller': '安装拉链头及拉片',
  'Pasang handle ke badan (Handle assembly)': '安装提手到本体',
  'Pasang aksesori: tag, label, hook': '安装配件：吊牌、标签、挂钩',
  // Luggage assembly (PTGH only)
  'Pasang wheel / roda (Wheel assembly for luggage)': '安装轮子（行李箱）',
  'Pasang trolley / pegangan tarik (Trolley handle)': '安装拉杆',
  // Bag assembly (PTB2C, PTOEM only)
  'Pasang buckle / snap hook ke webbing': '安装插扣/弹簧钩到织带',
  'Pasang D-ring & O-ring': '安装D型环及O型环',
  'Adjust panjang webbing & handle': '调整织带及提手长度',

  // Finishing components
  'Pemasangan label & wash label': '安装主标及洗水标',
  'Pembersihan benang sisa & oil stain': '清理线头及油渍',
  'Cek kelurusan & simetri bag': '检查包体对称性及平整度',
  'Pemasangan silica gel & polybag': '放置干燥剂及PE袋',
  'Final check sebelum packing': '包装前最终检查',
};

/**
 * Finding text translations
 */
export const IPQC_FINDING_ZH: Record<string, string> = {
  // Cutting findings
  'Color deviation pada 2 panel kain utama': '2片主面料裁片色差',
  'Ukuran panel tidak sesuai pola (toleransi >2mm)': '裁片尺寸不符纸样（公差>2mm）',
  'Grain direction kain salah arah pada 3 panel': '3片裁片布纹方向错误',
  'Fabric defect (jarum tertusuk / hole) pada 1 panel': '1片裁片有布疵（针孔/破洞）',
  'Tepi kain raveling / fraying berlebihan': '布边脱纱/散边严重',
  'Kain belang-belang (shade variation) antar roll': '不同卷布料之间存在色差',
  'Foam / busa tipis tidak sesuai spesifikasi': '泡棉偏薄不符合规格',
  'Webbing potongan miring / tidak 90 derajat': '织带切口倾斜/非90度',

  // Sewing findings
  'Skip stitch pada jahitan samping (3 titik)': '侧缝跳针（3处）',
  'Needle hole terlalu besar / visible pada kain gelap': '针孔过大/深色布料上明显可见',
  'Bartack handle tidak rata / salah posisi': '提手套结不平整/位置偏移',
  'Jahitan tidak mengikuti garis pola (off-line 2mm)': '缝线偏离纸样线（2mm）',
  'Tension benang tidak konsisten (baggy/loose)': '线张力不一致（松/紧不均）',
  'Benang putus di tengah jahitan (thread break)': '缝线中途断线',
  'Puckering / kain mengkerut setelah dijahit': '起皱/车缝后布料收缩',
  'Wrong stitch type pada bagian tertentu': '部分区域针迹类型错误',
  'Oil stain dari mesin pada 2 pcs': '2件产品有车油渍',
  'Jahit webbing ke badan tidak centered': '织带车缝未居中',

  // Assembly findings
  'Zipper stuck / macet saat ditarik': '拉链卡住/拉不动',
  'Handle loose / longgar setelah dipasang': '提手安装后松动',
  'Wheel tidak berputar lancar (2 dari 4 roda)': '轮子转动不顺（4轮中2个）',
  'Trolley handle macet / tidak naik turun': '拉杆卡住/无法伸缩',
  'Rivet longgar / bisa diputar': '铆钉松动/可转动',
  'Buckle / snap hook salah posisi': '插扣/弹簧钩位置错误',
  'Zipper head reversed / terbalik arah': '拉链头方向反了',
  'D-ring atau O-ring tidak tertutup rapi': 'D型环或O型环包覆不整齐',

  // Finishing findings
  'Label merek miring / posisi tidak centered': '品牌标歪斜/位置不居中',
  'Sisa benang / thread tail di 5 titik': '5处有线头残留',
  'Oil stain / dirt pada bagian luar': '外表面有油渍/脏污',
  'Wash label terbalik / terbaca terbalik': '洗水标装反/文字倒置',
  'Silica gel tidak dimasukkan / tertinggal': '未放入干燥剂/遗漏',
  'Polybag tidak tertutup rapat': 'PE袋未封紧',
  'Scratch / gores pada hardware (logo plate)': '五金件（Logo牌）有划痕',
  'Bag body asimetris (sisi kiri-kanan beda)': '包体不对称（左右两侧差异）',
  'Hook / aksesori tertinggal tidak terpasang': '挂钩/配件漏装',
  'Kemasan karton kurang / tidak sesuai standar': '纸箱包装不足/不符合标准',
};

/**
 * Action taken translations
 */
export const IPQC_ACTION_ZH: Record<string, string> = {
  // Cutting actions
  'Potong ulang 2 panel, ganti dari roll kain yang sama': '重切2片裁片，从同卷布料更换',
  'Adjust pola cutting, potong ulang 1 pcs': '调整裁剪纸样，重切1片',
  'Sortir ulang, potong ulang dengan arah grain benar': '重新分拣，按正确布纹方向重切',
  'Buang panel cacat, potong pengganti': '报废不良裁片，补切',
  'Ganti pisau cutting, check tension': '更换裁刀，检查张力',
  'Klaim ke supplier, pakai roll yang sama untuk 1 order': '向供应商投诉，同一订单使用同卷布料',
  'Ganti foam dari stok yang benar, check ketebalan': '从正确库存更换泡棉，检查厚度',
  'Potong ulang dengan jig guide': '使用定位夹具重切',

  // Sewing actions
  'Re-stitch area yang skip, periksa jarum & benang': '对跳针区域重缝，检查针线',
  'Ganti ukuran jarum (no.9 ke no.11), re-stitch': '更换针号（9号改11号），重缝',
  'Bongkar bartack, posisi ulang, bartack ulang': '拆除套结，重新定位，重打套结',
  'Adjust needle position, re-stitch': '调整针位，重缝',
  'Adjust tension upper & bobbin, test jahit sampel': '调整面线和底线张力，试缝样品',
  'Knot & backtack, lanjutkan jahitan, periksa benang': '打结回针，继续车缝，检查缝线',
  'Adjust tension & differential feed, re-stitch jika perlu': '调整张力及差动送布，必要时重缝',
  'Bongkar jahitan, jahit ulang dengan stitch type benar': '拆除缝线，用正确针迹类型重缝',
  'Bersihkan mesin, coba hilangkan noda dengan solvent, ganti jika tidak bisa': '清洁机台，尝试用溶剂去除污渍，无法去除则更换',
  'Bongkar, posisi ulang dengan center mark, re-stitch': '拆除，按中心标记重新定位，重缝',

  // Assembly actions
  'Ganti zipper slider, test berulang': '更换拉链头，反复测试',
  'Perkuat bartack, tambahan rivet jika perlu': '加强套结，必要时增加铆钉',
  'Ganti wheel yang bermasalah, test berputar': '更换问题轮子，测试转动',
  'Adjust mekanisme trolley, lubricate, ganti jika perlu': '调整拉杆机构，上润滑油，必要时更换',
  'Re-rivet dengan tools yang benar, check pressure': '用正确工具重铆，检查压力',
  'Bongkar, pasang ulang di posisi benar': '拆除，在正确位置重新安装',
  'Ganti zipper head dengan arah benar': '用正确方向更换拉链头',
  'Adjust penutup, bartack tambahan': '调整包覆，增加套结加固',

  // Finishing actions
  'Bongkar label, pasang ulang dengan jig posisi': '拆除标签，用定位夹具重新安装',
  'Potong bersih semua thread tail, check dengan cahaya': '剪净所有线头，在灯光下检查',
  'Bersihkan dengan pembersih kain, reject jika tidak hilang': '用布料清洁剂清洗，无法去除则报废',
  'Bongkar, pasang ulang dengan arah benar': '拆除，按正确方向重新安装',
  'Masukkan silica gel, seal polybag': '放入干燥剂，封好PE袋',
  'Reseal polybag, check heat sealer': '重新封口PE袋，检查封口机',
  'Ganti hardware yang tergores, reject part': '更换有划痕的五金件，报废不良品',
  'Return ke sewing untuk koreksi, atau downgrade': '退回车缝工序修正，或降级处理',
  'Pasang hook, check kelengkapan vs BOM': '安装挂钩，对照BOM检查完整性',
  'Ganti karton, check spec packaging': '更换纸箱，检查包装规格',
};

/**
 * Helper: translate a single field using the given map.
 * Falls back to the original text if no translation found.
 */
export function translateIPQCField(text: string | null | undefined, map: Record<string, string>): string | null {
  if (!text) return null;
  return map[text] || text;
}
