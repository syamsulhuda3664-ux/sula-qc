/**
 * RCA Action Templates per Sub-Defect — Kamus lengkap untuk manufaktur tas.
 * Setiap sub-defect memiliki root_cause, impact, process, corrective_action, preventive_action
 * yang spesifik dan relevan dengan kondisi pabrik produksi tas (backpack, travel bag, dll).
 *
 * Fallback: jika sub-defect tidak ditemukan di kamus, gunakan category template dari rca-generator.ts
 */

export interface SubDefectTemplate {
  root_cause: string;
  impact: string;
  process: string;
  corrective_action: string;
  preventive_action: string;
}

export const SUBDEFECT_ACTION_TEMPLATES: Record<string, SubDefectTemplate> = {
  // ═══════════════════════════════════════════════════════════
  // STITCHING (15 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Float thread / Discount / Skip stitch': {
    root_cause: 'Tensi benang terlalu longgar, hook/race mesin kotor, atau timing hook tidak sync dengan needle sehingga benang tidak terkunci dengan baik pada saat proses jahit.',
    impact: 'Jahitan longgar dan mudah terbuka saat ditarik, mengurangi kekuatan tali sepat/tas, potensi return dari customer karena tidak tahan lama.',
    process: 'Stitching / Sewing',
    corrective_action: 'Perbaiki tensi benang upper dan lower, bersihkan hook/race dari sisa benang, adjust timing hook-needle, dan lakukan test jahit pada kain sisa sebelum lanjut produksi.',
    preventive_action: 'Lakukan pengecekan tensi benang setiap ganti roll/batch material, terapkan jadwal bersih-bersih hook/race mingguan, dan buat jigsampel standar untuk verifikasi awal shift.',
  },

  'Missing false thread / Loose thread': {
    root_cause: 'False thread (benang lusi) tidak dipasang atau putus di tengah jahitan, bisa disebabkan oleh spool false thread habis, jalur benang tersangkut, atau roller false thread aus.',
    impact: 'Tepian jahitan terlihat tidak rapi dan mudah fraying (bercabang), mengurangi estetika produk dan kekuatan sambungan pada bagian yang mendapat beban tarikan.',
    process: 'Stitching / Sewing',
    corrective_action: 'Ganti spool false thread yang habis, perbaiki jalur benang yang tersangkut, ganti roller aus, dan pastikan false thread terpasang sebelum mulai jahit.',
    preventive_action: 'Pasang sensor false thread di mesin (jika tersedia), lakukan pengecekan visual setiap 10-15 menit, dan siapkan stok false thread cadangan di setiap line.',
  },

  'Missed stitching': {
    root_cause: 'Operator melewatkan area yang harus dijahit, biasanya pada sudut-sudut panel, area melengkung, atau bagian yang sulit dijangkau. Juga bisa karena guide plate tidak terpasang.',
    impact: 'Panel tidak terhubung sempurna, lubang terbuka pada tas yang bisa menyebabkan isi tas keluar atau air masuk. Kekuatan struktur tas berkurang signifikan.',
    process: 'Stitching / Sewing',
    corrective_action: ' Jahit ulang area yang terlewat dengan mesin yang sama, pastikan guide plate terpasang, dan beri tanda pada area kritis yang sering terlewat.',
    preventive_action: 'Buat SOP visual (foto) untuk setiap style dengan area jahit yang ditandai, lakukan training operator untuk style baru, dan terapkan 100% visual check setelah jahit.',
  },

  'Pinhole': {
    root_cause: 'Jarum mesin bengkok, size jarum terlalu besar untuk material, atau jarum aus sehingga merobek serat kain pada saat menembus material.',
    impact: 'Lubang kecil pada material yang mengurangi ketahanan air (waterproofing) dan kekuatan kain. Pada material tipis, pinhole bisa membesar saat ditarik.',
    process: 'Stitching / Sewing',
    corrective_action: 'Ganti jarum mesin yang bengkok/aus, pastikan size jarum sesuai dengan ketebalan material, dan periksa condong jarum (needle bar alignment).',
    preventive_action: 'Buat matriks ukuran jarum per jenis material, ganti jarum secara berkala (setiap 8 jam operasi), dan lakukan incoming check jarum dari supplier.',
  },

  'Missing bartack': {
    root_cause: 'Operator lupa atau melewatkan proses bartack setelah jahit utama, bisa karena tidak ada checklist, bartack machine error, atau area bartack tidak ditandai pada pattern.',
    impact: 'Ujung jahitan mudah terbuka karena tidak dikunci, sangat berbahaya pada bagian yang menahan beban seperti handle attachment, strap, dan D-ring.',
    process: 'Stitching / Bartacking',
    corrective_action: 'Pasang bartack pada titik yang terlewat, periksa bartack machine (needle, thread tension), dan tambahkan tanda pada pattern untuk setiap titik bartack.',
    preventive_action: 'Buat checklist bartack points per style, pasang auto-bartack sensor jika memungkinkan, dan lakukan QA check khusus pada titik-titik kritis bartack.',
  },

  'Presser foot mark': {
    root_cause: 'Tekanan presser foot terlalu besar, material sensitif terhadap tekanan ( PU leather tipis, coated fabric), atau permukaan presser foot kasar/aus.',
    impact: 'Bekas tekanan terlihat pada material luar tas, mengurangi penampilan produk terutama pada warna gelap dan material glossy. Tidak bisa diperbaiki (permanent mark).',
    process: 'Stitching / Sewing',
    corrective_action: 'Kurangi tekanan presser foot, ganti dengan teflon foot atau roller foot untuk material sensitif, dan naikkan feed dog untuk mengurangi gesekan.',
    preventive_action: 'Dokumentasikan jenis presser foot per material, lakukan trial sebelum produksi massal untuk material baru, dan sediakan teflon foot di setiap line.',
  },

  'Backtack incomplete': {
    root_cause: 'Mesin jahit auto-backtack tidak berfungsi, setting backtack stitch terlalu pendek (1-2 stitch), atau operator terlalu cepat mengangkat presser foot sebelum backtack selesai.',
    impact: 'Ujung jahitan tidak terkunci sempurna, bisa terbuka saat ditarik. Pada bagian stress point seperti ujung zipper dan handle, ini bisa menyebabkan kegagalan struktural.',
    process: 'Stitching / Sewing',
    corrective_action: 'Perbaiki auto-backtack mechanism, set minimum 4-5 stitch backtack, dan train operator untuk menunggu backtack complete sebelum mengangkat presser foot.',
    preventive_action: 'Include backtack check dalam SOP startup mesin harian, lakukan periodic check auto-backtack mechanism, dan buat sample standar untuk perbandingan.',
  },

  'Wrong panel assembly': {
    root_cause: 'Operator merakit panel yang salah (kiri-kanan terbalik, panel atas-bawah tertukar), biasanya karena panel tidak ditandai label kiri/kanan atau training operator kurang untuk style baru.',
    impact: 'Produk cacat total (must be scrapped atau heavy rework), karena seluruh konstruksi tas salah. Biaya rework sangat tinggi dan mengurangi output produksi.',
    process: 'Assembly / Stitching',
    corrective_action: 'Hentikan line segera jika ditemukan, sortir WIP untuk cek semua panel, tambahkan label kiri/kanan/atas/bawah pada setiap panel, dan berikan training ulang ke operator.',
    preventive_action: 'Implementasi first piece check 100%, pasang matching mark pada pattern, dan gunakan color-coded label per panel position.',
  },

  'Unfolded edge': {
    root_cause: 'Proses folding tepi tidak rapi atau tidak terlipat sempurna sebelum dijahit, biasanya pada binding tape, piping, atau edge tape yang kurang dilem/dipanaskan.',
    impact: 'Tepi tas terlihat tidak rapi dan tidak presisi, mengurangi nilai estetika produk. Pada edge yang terlipat bisa membuka kembali setelah beberapa kali pemakaian.',
    process: 'Stitching / Edge Folding',
    corrective_action: 'Perbaiki proses folding (pastikan fold hot-melt tape atau fold edge machine menyala), adjust folding guide, dan lakukan folding ulang pada item yang belum jahit.',
    preventive_action: 'Kalibrasi folding machine sebelum setiap shift, buat sample standar folding per jenis tepi, dan lakukan inline check setiap 30 menit.',
  },

  'Velcro reversed': {
    root_cause: 'Operator memasang velcro hook dan loop terbalik (hook di bagian yang seharusnya loop), biasanya karena kedua sisi velcro terlihat mirip atau tidak ada penanda arah.',
    impact: 'Velcro tidak bisa menempel karena hook bertemu hook dan loop bertemu loop. Produk tidak berfungsi dengan benar dan harus di-rework.',
    process: 'Assembly / Velcro Attachment',
    corrective_action: 'Bongkar velcro yang salah, pasang ulang dengan posisi benar, dan tandai kedua sisi velcro (H untuk hook, L untuk loop) di area kerja.',
    preventive_action: 'Gunakan velcro dengan warna berbeda untuk hook dan loop, buat jig/fixture untuk posisi velcro, dan lakukan pairing test setelah pemasangan.',
  },

  'Uneven edge': {
    root_cause: 'Potongan material tidak presisi dari cutting section, atau guide jahit tidak lurus sehingga jahitan menyimpang dari tepi. Bisa juga karena material melayang saat dijahit.',
    impact: 'Tepi tas tidak simetris, terlihat tidak rapi dan tidak presisi. Pada produk premium ini sangat mengurangi persepsi kualitas.',
    process: 'Cutting / Stitching',
    corrective_action: 'Cek die cutter atau pattern cutting untuk presisi, perbaiki guide jahit, dan gunakan binder clip/tailed untuk menjaga material tetap posisi saat dijahit.',
    preventive_action: 'Lakukan cutting inspection dengan sample setiap awal batch, terapkan toleransi cutting (max 1mm), dan kalibrasi guide jahit setiap ganti model.',
  },

  'Triangle piece uneven': {
    root_cause: 'Triangle piece (untuk handle base, strap attachment) dipotong tidak simetris, atau posisi jahit tidak tepat di tengah triangle sehingga sisi kiri-kanan tidak sama.',
    impact: 'Handle atau strap terpasang miring, tas tidak simetris saat dilihat dari depan. Ini adalah visual defect yang sangat mencolok.',
    process: 'Cutting / Assembly',
    corrective_action: 'Ganti triangle piece yang tidak simetris, cek template/pattern, dan gunakan alignment jig saat memasang triangle piece.',
    preventive_action: 'Buat cutting jig khusus untuk triangle piece, lakukan 100% check ukuran setelah cutting, dan gunakan center mark untuk alignment.',
  },

  'Thread color bleeding': {
    root_cause: 'Benang jahit berwarna gelap (hitam, navy) meluntur saat tas terkena hujan atau keringat, biasanya karena benang tidak melewati proses color fastness yang memadai dari supplier.',
    impact: 'Noda warna benang menyebar ke material tas, membuat produk terlihat kotor dan tidak bisa dibersihkan. Potensi complain serius dari customer.',
    process: 'Material / Stitching',
    corrective_action: 'Ganti benang dari batch yang sama dengan benang yang sudah lolos color fastness test, isolasi produk yang terdampak, dan ajukan klaim ke supplier benang.',
    preventive_action: 'Terapkan color fastness test (washing, rubbing, perspiration) untuk setiap batch benang dari supplier, dan buat database warna yang sudah approved.',
  },

  'Thread tail': {
    root_cause: 'Operator tidak memotong sisa benang setelah jahit selesai, atau auto-cutter mesin jahit tidak berfungsi/belum disetel dengan benar untuk panjang benang yang tepat.',
    impact: 'Sisa benang menggantung pada produk, terlihat tidak rapi dan tidak profesional. Pada bagian dalam bisa tersangkut dan mengganggu fungsi compartment.',
    process: 'Finishing / Stitching',
    corrective_action: 'Perbaiki auto-cutter mesin jahit, potong manual sisa benang yang tersisa, dan lakukan pengecekan visual setiap selesai jahit.',
    preventive_action: 'Set auto-cutter untuk potong rata pada setiap ganti benang, lakukan trimming check di akhir line, dan masukkan thread trimming dalam SOP finishing.',
  },

  'Foam insertion incomplete': {
    root_cause: 'Foam/EVA tidak masuk sepenuhnya ke dalam panel saat proses stuffing, biasanya karena panel terlalu kecil, foam terlalu tebal, atau tidak ada alat bantu insertion.',
    impact: 'Panel terlihat kempes atau tidak padat pada bagian tertentu, mengurangi bentuk dan proteksi tas. Terasa tidak premium saat dipegang.',
    process: 'Pre-assembly / Foam Insertion',
    corrective_action: 'Masukkan foam ulang menggunakan stick/roller insertion, pastikan foam ukuran sesuai dengan panel, dan lakukan pressing setelah insertion.',
    preventive_action: 'Buat ukuran foam template per panel, gunakan insertion jig/fixture, dan lakukan squeeze test 100% setelah insertion.',
  },

  // ═══════════════════════════════════════════════════════════
  // LOGO (4 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Skewed': {
    root_cause: 'Posisi logo miring saat dipasang karena positioning jig longgar atau tidak terkalibrasi. Bisa juga karena operator tidak menempelkan logo tepat di titik tengah mark.',
    impact: 'Logo tidak simetris dan terlihat tidak presisi, sangat mencolok pada produk dan langsung menurunkan persepsi kualitas brand.',
    process: 'Logo Attachment / Heat Press',
    corrective_action: 'Perbaiki jig positioning logo, kalibrasi ulang titik center, dan lakukan alignment check dengan ruler sebelum heat press.',
    preventive_action: 'Buat positioning jig dengan stopper yang presisi, lakukan jig inspection mingguan, dan terapkan first piece approval sebelum produksi.',
  },

  'Logo inverted': {
    root_cause: 'Logo terbalik saat dipasang (upside down atau mirror), biasanya karena logo diambil dari stok tanpa pengecekan orientasi, atau artwork mirror tidak diset dengan benar pada mesin.',
    impact: 'Logo terbalik membuat produk tidak bisa dijual (reject 100%). Ini adalah critical defect yang memerlukan rework berat atau scrap.',
    process: 'Logo Attachment / Heat Press / Embroidery',
    corrective_action: 'Hentikan line, cek semua logo di stok, perbaiki artwork setting pada mesin, dan tambahkan orientation mark pada setiap logo.',
    preventive_action: 'Tambahkan "TOP" mark pada backing logo, lakukan operator training untuk orientasi, dan pasang visual guide di area kerja.',
  },

  'Logo defective': {
    root_cause: 'Logo rusak dari supplier (print blur, embroidery missed, emboss tidak rata), atau rusak saat proses pemasangan (suhu heat press terlalu tinggi, tekanan berlebihan).',
    impact: 'Logo tidak terbaca atau tidak jelas, brand image tidak tersampaikan dengan baik. Pada logo yang menjadi focal point desain, ini menurunkan nilai jual secara signifikan.',
    process: 'Incoming QC / Logo Attachment',
    corrective_action: 'Sortir logo rusak dari stok, ganti dengan logo yang baik, adjust parameter heat press (suhu, waktu, tekanan), dan lakukan trial pada sample.',
    preventive_action: 'Terapkan AQL inspection pada logo dari supplier, buat parameter card per jenis logo, dan lakukan pre-production trial untuk setiap batch baru.',
  },

  'Logo detached': {
    root_cause: 'Logo terlepas karena adhesive tidak kuat, suhu heat press kurang, waktu press terlalu pendek, atau permukaan material tidak cocok dengan adhesive type yang digunakan.',
    impact: 'Logo tanggal dari produk saat digunakan atau dicuci, menyebabkan complain customer dan potensi return. Brand image sangat terpengaruh.',
    process: 'Logo Attachment / Heat Press',
    corrective_action: 'Ganti logo yang tanggal, periksa adhesive type dan sesuaikan dengan material, naikkan suhu/waktu press, dan lakukan adhesion test (pull test) pada sample.',
    preventive_action: 'Buat matriks adhesive type per material, lakukan pull test setiap awal batch, dan terapkan wash test untuk sampling sebelum shipment.',
  },

  // ═══════════════════════════════════════════════════════════
  // MATERIAL (5 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Color deviation': {
    root_cause: 'Lot material berbeda shade (lot-to-lot variation) dari supplier, atau material yang sudah lama disimpan mengalami perubahan warna akibat paparan cahaya/UV.',
    impact: 'Panel-panel pada satu tas memiliki warna yang berbeda, terlihat sangat jelas pada tas dengan panel besar. Produk tidak match dengan sample yang disetujui customer.',
    process: 'Material Receiving / Cutting',
    corrective_action: 'Sortir material per lot/shade, pastikan satu tas menggunakan material dari lot yang sama, ajukan klaim ke supplier untuk lot yang menyimpang.',
    preventive_action: 'Terapkan color matching dengan spectrophotometer saat incoming, buat color standard card per shade, dan simpan material di area tertutup (hindari UV).',
  },

  'Yarn pull': {
    root_cause: 'Serat kain tertarik keluar oleh mesin atau handling kasar, biasanya pada material rajutan (knit), woven ringan, atau material dengan serat longgar.',
    impact: 'Garis-garis serat menonjol pada permukaan material, mengurangi penampilan produk. Tidak bisa diperbaiki tanpa merusak material lebih lanjut.',
    process: 'Cutting / Handling / Stitching',
    corrective_action: 'Hentikan penggunaan material yang yarn pull parah, perbaiki handling (jangan tarik material), dan periksa feed dog/presser foot mesin.',
    preventive_action: 'Lakukan fabric tension test saat incoming QC, handle material dengan hati-hati (gunakan roller, bukan tarikan manual), dan rapikan feed dog adjustment.',
  },

  'Wrinkle': {
    root_cause: 'Material kusut saat dipotong atau dijahit, bisa karena material tergulung terlalu lama, proses cutting menekan material, atau feeding tidak rata saat menjahit.',
    impact: 'Permukaan tas tidak smooth, terlihat tidak rapi dan tidak presisi. Pada material glossy, wrinkle sangat mencolok dan tidak bisa di-setrika setelah jahit.',
    process: 'Material Handling / Cutting / Stitching',
    corrective_action: 'Relaksasi material sebelum diproses (roll out dan diamkan), adjust feeding speed, dan gunakan roller untuk menjaga material tetap datar.',
    preventive_action: 'Simpan material dalam rolled condition (jangan fold), berikan waktu relaxation setelah unrolling, dan terapkan tension control saat cutting/jahit.',
  },

  'Damage / Tear': {
    root_cause: 'Material sobek saat proses cutting (pisau tumpul), handling (tarikan berlebihan), atau stitching (needle menembus area lemah). Bisa juga karena material sudah memiliki defect dari supplier.',
    impact: 'Kerusakan struktural pada tas yang tidak bisa diperbaiki, harus di-scrap atau di-rework dengan panel pengganti. Meningkatkan waste dan biaya produksi.',
    process: 'Cutting / Handling / Stitching',
    corrective_action: 'Ganti panel yang rusak dengan panel baru, periksa pisau cutting, perbaiki handling prosedur, dan sortir material dari supplier yang sudah defect.',
    preventive_action: 'Ganti pisau cutting secara berkala, lakukan incoming inspection untuk material defect (4-point check), dan terapkan proper handling SOP.',
  },

  'Open seam': {
    root_cause: 'Jahitan terbuka karena benang putus, tensi terlalu tinggi, atau stitch density terlalu renggang (SPI terlalu rendah) sehingga jahitan tidak kuat menahan tarikan.',
    impact: 'Sambungan panel terbuka, isi tas bisa keluar. Pada bagian yang menahan beban (bottom, strap attachment) ini berbahaya dan bisa menyebabkan tas putus saat digunakan.',
    process: 'Stitching / Seam Strength',
    corrective_action: 'Jahit ulang dengan SPI yang benar, periksa dan adjust tensi benang, ganti benang yang rapuh, dan lakukan seam strength test pada sample.',
    preventive_action: 'Tetapkan minimum SPI per jenis jahitan dan material, lakukan seam strength test periodik, dan monitor tensi benang secara berkala.',
  },

  // ═══════════════════════════════════════════════════════════
  // HARDWARE (3 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Scratch': {
    root_cause: 'Hardware tergores saat proses plating di supplier, saat handling/assembly di pabrik (tools metal contact), atau saat hardware saling bergesekan dalam kemasan.',
    impact: 'Goresan pada zipper puller, buckle, D-ring, atau snap hook sangat mencolok, menurunkan kesan premium produk. Tidak bisa diperbaiki, harus diganti.',
    process: 'Hardware Installation / Assembly / Incoming QC',
    corrective_action: 'Ganti hardware yang tergores, perbaiki handling (gunakan tool dengan lapisan karet/nilon), dan pisahkan hardware dalam individual packing.',
    preventive_action: 'Terapkan visual inspection 100% untuk hardware dari supplier, gunakan protective film pada hardware, dan sediakan tool berlapis karet untuk assembly.',
  },

  'Poor function': {
    root_cause: 'Hardware tidak berfungsi dengan baik: zipper macet, buckle tidak lock, snap hook tidak snap. Biasanya karena kualitas supplier rendah atau spesifikasi tidak sesuai.',
    impact: 'Produk tidak bisa digunakan dengan benar — zipper yang macet membuat compartment tidak bisa dibuka, buckle yang tidak lock membuat strap tidak bisa diatur.',
    process: 'Incoming QC / Hardware Installation',
    corrective_action: 'Ganti hardware yang tidak berfungsi, lakukan function test 100% sebelum install, dan ajukan klaim ke supplier jika batch bermasalah.',
    preventive_action: 'Terapkan function test (zipper open/close 10x, buckle lock/release 5x) pada setiap batch hardware, buat approved vendor list, dan tetapkan spesifikasi minimum.',
  },

  'Missing accessory': {
    root_cause: 'Aksesoris (buckle, D-ring, snap hook, padlock, strap) tidak dipasang karena hilang dari workplace, operator lupa, atau tidak tercantum dalam BOM/picking list.',
    impact: 'Produk tidak lengkap dan tidak bisa dijual sampai aksesoris dipasang. Menyebabkan delay shipment dan peningkatan rework time.',
    process: 'Assembly / Material Preparation',
    corrective_action: 'Pasang aksesoris yang kurang, periksa picking list vs BOM, dan pastikan stok aksesoris tersedia di line sebelum mulai produksi.',
    preventive_action: 'Implementasi barcode scanning untuk setiap komponen saat picking, buat kit preparation checklist per style, dan lakukan line audit untuk ketersediaan material.',
  },

  // ═══════════════════════════════════════════════════════════
  // APPEARANCE (5 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Stain / Oil stain': {
    root_cause: 'Noda minyak dari mesin jahit (oil spot), noda tangan operator, atau noda adhesive/lem yang menempel pada material luar. Bisa juga dari meja kerja yang kotor.',
    impact: 'Noda pada material luar sangat mencolok, terutama pada warna terang. Pada material yang tidak bisa dicuci, noda berarti reject atau heavy discount.',
    process: 'All Processes / Finishing',
    corrective_action: 'Bersihkan area kerja, ganti oli mesin jahit yang bocor, gunakan sarung tangan saat handling, dan coba hilangkan noda dengan solvent yang sesuai.',
    preventive_action: 'Implementasi 5S di seluruh area produksi, lakukan maintenance mesin jahit secara berkala, wajibkan sarung tangan, dan pisahkan material terang dari area mesin.',
  },

  'Bone uneven': {
    root_cause: 'Bone/tulang tas (structural support) dipasang tidak simetris atau tidak mengikuti kontur panel, biasanya karena cutting bone tidak presisi atau jig pemasangan longgar.',
    impact: 'Tas tidak berdiri kokoh dan terlihat miring/asimetris. Pada bagian top edge, bone yang tidak rata membuat bukaan tas tidak presisi.',
    process: 'Pre-assembly / Bone Insertion',
    corrective_action: 'Bongkar dan pasang ulang bone dengan posisi yang benar, cek cutting bone template, dan gunakan alignment jig.',
    preventive_action: 'Buat cutting jig untuk bone, lakukan alignment check dengan ruler sebelum menjahit, dan buat sample standar per style.',
  },

  'Bag crooked': {
    root_cause: 'Tas miring secara keseluruhan karena assembly tidak simetris — salah satu panel lebih panjang, strap attachment tidak sejajar, atau bottom panel tidak center.',
    impact: 'Tas terlihat tidak presisi saat dilihat dari depan/samping. Ini adalah defect yang langsung terlihat oleh end customer dan menurunkan kepercayaan terhadap brand.',
    process: 'Assembly / Final QC',
    corrective_action: 'Identifikasi sumber ketidaksimetrisan (ukur panel, cek strap position), perbaiki jika masih bisa di-rework, atau scrap jika tidak bisa diperbaiki.',
    preventive_action: 'Gunakan center fold method untuk cek simetri, lakukan measurement check pada critical points, dan terapkan template/jig untuk assembly.',
  },

  'Handle misaligned': {
    root_cause: 'Handle/gagang terpasang tidak sejajar antara kiri dan kanan, biasanya karena titik jahit handle tidak ditandai dengan benar atau jig pemasangan longgar.',
    impact: 'Tas terlihat tidak simetris saat dipegang, handle terasa tidak seimbang. Ini sangat mencolok pada tote bag dan handbag.',
    process: 'Assembly / Handle Attachment',
    corrective_action: 'Bongkar dan pasang ulang handle dengan posisi yang benar, gunakan alignment jig, dan ukur jarak dari tepi kedua sisi.',
    preventive_action: 'Buat handle attachment jig dengan measurement mark, lakukan first piece check, dan terapkan go/no-go gauge untuk jarak handle.',
  },

  'Missing rivet': {
    root_cause: 'Rivet tidak terpasang karena rivet machine error, stok rivet habis di line, atau operator melewatkan titik rivet yang tidak ditandai.',
    impact: 'Struktur penghubung tidak kuat karena rivet hilang. Pada handle attachment atau strap connection, ini bisa menyebabkan handle terlepas saat digunakan.',
    process: 'Assembly / Rivet Setting',
    corrective_action: 'Pasang rivet yang kurang, periksa rivet machine, dan pastikan stok rivet tersedia. Jika sudah dijahit, bungkus dengan rivet manual atau reinforce dengan bartack.',
    preventive_action: 'Buat checklist rivet points per style, lakukan stock check rivet sebelum mulai line, dan terapkan rivet machine maintenance harian.',
  },

  // ═══════════════════════════════════════════════════════════
  // ZIPPER (4 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Sharp / Stuck': {
    root_cause: 'Zipper slider/macet karena teeth tidak rata, slider defect dari supplier, atau tape zipper terlalu kaku setelah proses jahit (stitching terlalu dekat dengan teeth).',
    impact: 'Zipper tidak bisa dibuka/tutup dengan mulus, user harus paksa. Pada kasus ekstrem slider bisa terlepas atau teeth bisa patah. Sangat mengganggu penggunaan harian.',
    process: 'Zipper Installation / Incoming QC',
    corrective_action: 'Ganti zipper yang macet, periksa jarak jahitan dari teeth (minimum 3mm), dan ajukan klaim ke supplier jika batch zipper bermasalah.',
    preventive_action: 'Lakukan open/close test 10x pada sample zipper dari setiap batch, terapkan jarak jahit minimum dari teeth, dan buat approved zipper vendor list.',
  },

  'Zipper wavy': {
    root_cause: 'Zipper bergelombang setelah dijahit karena tension benang tidak seimbang antara upper dan lower, atau feeding tidak konsisten saat menjahit sepanjang zipper.',
    impact: 'Zipper tidak lurus, tas tidak rapi saat dilihat. Pada kasus parah, zipper tidak bisa menutup sempurna karena tape menyimpang.',
    process: 'Zipper Sewing',
    corrective_action: 'Perbaiki tensi benang upper dan lower agar seimbang, adjust feed dog untuk konsistensi, dan bongkar-jahit ulang jika perlu.',
    preventive_action: 'Set tensi yang sama untuk kedua sisi zipper, gunakan zipper foot, dan lakukan test jahit pada sample sebelum produksi massal.',
  },

  'Zipper puller reversed': {
    root_cause: 'Puller zipper terbalik (logo di bawah) saat dipasang, biasanya karena operator tidak memperhatikan orientasi puller saat memasang slider.',
    impact: 'Logo puller tidak terbaca dengan benar. Meskipun fungsi tidak terganggu, ini adalah visual defect yang menurunkan brand image.',
    process: 'Zipper Installation',
    corrective_action: 'Ganti slider dengan orientasi yang benar, tambahkan tanda orientasi di area kerja, dan lakukan pengecekan visual sebelum jahit.',
    preventive_action: 'Buat visual guide untuk orientasi slider, lakukan training operator, dan terapkan pairing check (slider + puller orientation) sebelum install.',
  },

  'Wrong color': {
    root_cause: 'Zipper warna berbeda dari spesifikasi, biasanya karena salah picking dari warehouse (kode warna mirip) atau supplier mengirim warna yang salah.',
    impact: 'Zipper warna tidak match dengan body tas, sangat mencolok dan tidak bisa di-rework tanpa mengganti seluruh zipper.',
    process: 'Material Preparation / Zipper Installation',
    corrective_action: 'Ganti zipper dengan warna yang benar, perbaiki picking system (barcode scanning), dan ajukan klaim ke supplier jika salah kirim.',
    preventive_action: 'Terapkan color matching dengan pantone/standard card saat picking, gunakan barcode system untuk material issuance, dan lakukan pre-assembly color check.',
  },

  // ═══════════════════════════════════════════════════════════
  // WEBBING (2 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Webbing twisted': {
    root_cause: 'Webbing/tali terpilin saat dijahit karena tidak dijaga keparalelannya, feeding webbing dari arah yang salah, atau tidak ada jig penahan.',
    impact: 'Webbing tidak datar dan terlihat twisted, mengurangi estetika dan juga mengurangi kekuatan karena serat tidak sejajar.',
    process: 'Webbing Sewing / Assembly',
    corrective_action: 'Bongkar jahitan, luruskan webbing, pasang ulang dengan menjaga keparalelannya, gunakan tape/clip untuk menjaga posisi.',
    preventive_action: 'Gunakan webbing guide jig saat menjahit, lakukan parallel check sebelum jahit, dan terapkan tension control pada feeding.',
  },

  'Stitching off-center': {
    root_cause: 'Jahitan pada webbing tidak tepat di tengah, biasanya karena guide needle tidak terkalibrasi atau webbing bergeser saat dijahit tanpa jig.',
    impact: 'Jahitan terlihat tidak rapi dan tidak presisi. Pada webbing yang sempit, off-center stitch bisa mengurangi kekuatan penahanan.',
    process: 'Webbing Sewing',
    corrective_action: 'Kalibrasi ulang needle position, gunakan center guide/presser foot untuk webbing, dan jahit ulang jika perlu.',
    preventive_action: 'Buat center mark guide, gunakan specialized webbing foot, dan lakukan alignment check setiap ganti setup mesin.',
  },

  // ═══════════════════════════════════════════════════════════
  // OTHER (6 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Wash label reversed / Missing': {
    root_cause: 'Label perawatan cuci terbalik atau tidak terpasang, biasanya karena operator tidak memperhatikan sisi label yang benar atau label habis di line.',
    impact: 'Informasi perawatan tidak terbaca, customer bisa mencuci dengan cara yang salah dan merusak produk. Juga melanggar regulasi labeling.',
    process: 'Labeling / Finishing',
    corrective_action: 'Pasang label dengan orientasi yang benar, pastikan stok label tersedia, dan buat tanda sisi atas pada area kerja label.',
    preventive_action: 'Gunakan jig pemasangan label dengan orientasi guide, lakukan stock check label sebelum mulai, dan terapkan visual SOP untuk label placement.',
  },

  'Wrong wash label': {
    root_cause: 'Label perawatan yang salah dipasang pada produk (label style A dipasang di style B), biasanya karena mixing label di workplace atau tidak ada barcode verification.',
    impact: 'Informasi perawatan salah bisa menyebabkan customer merusak produk. Juga masalah regulasi jika content/fabric information tidak sesuai.',
    process: 'Labeling / Finishing',
    corrective_action: 'Ganti dengan label yang benar, pisahkan label per style di workplace, dan terapkan barcode scanning sebelum pemasangan.',
    preventive_action: 'Gunakan barcode verification system untuk label, pisahkan rak label per style, dan lakukan final audit pada label correctness.',
  },

  'Woven label reversed': {
    root_cause: 'Brand label woven terbalik saat dijahit, biasanya karena operator mengambil label dari sisi yang salah atau tidak ada penanda atas-bawah pada label.',
    impact: 'Brand logo terbalik, sangat mencolok dan menurunkan brand image. Harus di-rework (bongkar jahit, pasang ulang).',
    process: 'Labeling / Finishing',
    corrective_action: 'Bongkar dan pasang ulang label dengan orientasi yang benar, tambahkan tanda orientasi pada stok label.',
    preventive_action: 'Buat orientation guide di area label, gunakan jig dengan stopper untuk posisi label, dan lakukan visual check sebelum menjahit.',
  },

  'Woven label missing': {
    root_cause: 'Brand label woven tidak terpasang karena habis di line, terlewat oleh operator, atau tidak termasuk dalam BOM/picking list.',
    impact: 'Tas tanpa brand label tidak bisa dijual — tidak ada identitas brand. Produk harus di-rework dengan menambahkan label.',
    process: 'Labeling / Finishing',
    corrective_action: 'Pasang label yang terlewat, periksa stok label, dan pastikan BOM lengkap termasuk semua label.',
    preventive_action: 'Terapkan barcode scanning untuk setiap komponen termasuk label, lakukan line audit sebelum mulai produksi, dan buat label kit per style.',
  },

  'Lining reversed': {
    root_cause: 'Furing/lining terbalik (sisi salah menghadap ke luar) saat dijahit ke body, biasanya karena operator tidak memperhatikan sisi yang benar atau panel tidak ditandai.',
    impact: 'Interior tas terlihat salah — sisi yang seharusnya tersembunyi malah terlihat. Harus di-rework berat (bongkar jahit body-lining).',
    process: 'Assembly / Lining Insertion',
    corrective_action: 'Bongkar jahit body-lining, perbaiki posisi lining, dan jahit ulang. Tandai sisi yang benar pada panel lining.',
    preventive_action: 'Tandai "RIGHT SIDE" pada panel lining, buat visual SOP untuk lining insertion, dan lakukan first piece check 100%.',
  },

  'Transparent film defective': {
    root_cause: 'Film transparan (biasanya pada bagian ID window atau packaging protection) rusak — kusut, sobek, atau tidak tembus pandang. Biasanya karena handling kasar atau material kualitas rendah.',
    impact: 'ID window tidak berfungsi (tidak bisa melihat kartu nama), atau protective film mengurangi penampilan produk.',
    process: 'Material Preparation / Assembly',
    corrective_action: 'Ganti film yang rusak, perbaiki handling (jangan lipat/gesek film), dan cek kualitas film dari supplier.',
    preventive_action: 'Lakukan incoming inspection untuk film transparan, handle dengan care card, dan simpan dalam flat condition.',
  },

  // ═══════════════════════════════════════════════════════════
  // PREPARATION (19 sub-defects)
  // ═══════════════════════════════════════════════════════════

  'Rivet defective': {
    root_cause: 'Rivet longgar, tidak rata, atau tergores setelah proses setting. Biasanya karena rivet machine pressure tidak tepat, rivet dari supplier kurang presisi, atau material terlalu tebal untuk rivet size.',
    impact: 'Rivet tidak kuat menahan beban, berpotensi tanggal saat digunakan. Visual defect yang mencolok pada produk.',
    process: 'Preparation / Rivet Setting',
    corrective_action: 'Set ulang rivet machine pressure, ganti rivet yang defect, dan pastikan rivet size sesuai dengan ketebalan material.',
    preventive_action: 'Buat pressure setting card per rivet size dan material thickness, lakukan pull test periodik, dan terapkan incoming QC untuk rivet.',
  },

  'Accessory skewed': {
    root_cause: 'Aksesoris (buckle, clip, D-ring) terpasang miring karena jig pemasangan longgar, titik center tidak ditandai, atau operator tidak memperhatikan alignment.',
    impact: 'Aksesoris tidak simetris, terlihat tidak rapi dan tidak presisi. Pada buckle, posisi miring bisa mengganggu fungsi pengaturan strap.',
    process: 'Preparation / Accessory Setting',
    corrective_action: 'Bongkar dan pasang ulang aksesoris dengan posisi yang benar, gunakan alignment jig, dan ukur jarak dari tepi kedua sisi.',
    preventive_action: 'Buat positioning jig dengan measurement mark, lakukan alignment check sebelum setting, dan terapkan first piece check.',
  },

  'Accessory paint peeling': {
    root_cause: 'Cat pada aksesoris (buckle, snap hook) mengelupas karena kualitas plating rendah dari supplier, atau tergores saat handling/assembly di pabrik.',
    impact: 'Aksesoris terlihat buruk dan tidak premium, cat yang mengelupas bisa meninggalkan area metal yang berkarat. Menurunkan nilai jual produk secara signifikan.',
    process: 'Incoming QC / Preparation',
    corrective_action: 'Ganti aksesoris yang cat-nya mengelupas, perbaiki handling (gunakan tool dengan lapisan karet), dan ajukan klaim ke supplier.',
    preventive_action: 'Terapkan salt spray test dan adhesion test untuk aksesoris dari supplier, buat minimum plating thickness standard, dan handle dengan care.',
  },

  'Bartack incomplete': {
    root_cause: 'Bartack pada proses preparation tidak lengkap — stitch count kurang, posisi meleset, atau bartack machine tidak terkalibrasi. Berbeda dengan bartack di stitching, ini di tahap preparation/pre-assembly.',
    impact: 'Titik kritis pada komponen semi-finished tidak terkunci dengan baik, berpotensi terbuka saat masuk proses assembly utama.',
    process: 'Preparation / Bartacking',
    corrective_action: 'Perbaiki bartack machine calibration, tambahkan stitch count, dan pasang ulang bartack yang kurang lengkap.',
    preventive_action: 'Set standar stitch count per tipe bartack (min 12-16 stitch), lakukan machine check setiap awal shift, dan buat sample standar.',
  },

  'Bartack position off-standard': {
    root_cause: 'Posisi bartack menyimpang dari titik yang seharusnya, biasanya karena jig/stopper bartack machine longgar atau tidak ada positioning guide.',
    impact: 'Bartack tidak melindungi titik kritis dengan benar, jahitan masih bisa terbuka. Juga mencolok secara visual jika posisi tidak simetris.',
    process: 'Preparation / Bartacking',
    corrective_action: 'Perbaiki jig/stopper pada bartack machine, pasang positioning guide, dan buat ulang bartack pada posisi yang benar.',
    preventive_action: 'Kalibrasi bartack machine jig setiap minggu, buat positioning template per style, dan lakukan measurement check periodik.',
  },

  'Logo skewed': {
    root_cause: 'Logo pada tahap preparation/pre-assembly miring, biasanya karena positioning tidak presisi atau jig tidak tepat. Berbeda dengan logo di kategori Logo, ini di tahap preparation.',
    impact: 'Logo miring pada komponen semi-finished yang akan masuk ke assembly. Jika tidak terdeteksi, error akan masuk ke produk akhir.',
    process: 'Preparation / Logo Attachment',
    corrective_action: 'Perbaiki positioning, gunakan alignment jig, dan cek dengan ruler sebelum melanjutkan ke proses berikutnya.',
    preventive_action: 'Buat positioning jig dengan center mark, lakukan alignment check setiap 10 unit, dan terapkan in-line QC pada preparation.',
  },

  'Velcro skewed': {
    root_cause: 'Velcro pada tahap preparation terpasang miring, biasanya karena tidak ada jig pemasangan atau jig longgar sehingga velcro bergeser saat dijahit.',
    impact: 'Velcro tidak sejajar dengan panel, area stick berkurang, dan closing tidak presisi. Pada compartment yang ketat, ini bisa membuat velcro tidak menempel.',
    process: 'Preparation / Velcro Attachment',
    corrective_action: 'Bongkar dan pasang ulang velcro dengan posisi yang benar, gunakan positioning jig, dan jahit dengan menjaga posisi.',
    preventive_action: 'Gunakan velcro positioning jig, lakukan measurement check, dan terapkan in-line QC di preparation line.',
  },

  'Velcro loose thread': {
    root_cause: 'Benang longgar di area velcro setelah proses jahit, biasanya karena auto-cutter tidak memotong benang dengan benar atau velcro menyerap benang longgar dari proses sebelumnya.',
    impact: 'Benang longgar menempel pada velcro dan mengurangi daya rekat. Juga terlihat tidak rapi secara visual.',
    process: 'Preparation / Velcro Attachment',
    corrective_action: 'Potong bersih semua sisa benang di area velcro, periksa auto-cutter mesin, dan bersihkan velcro dari benang longgar.',
    preventive_action: 'Lakukan thread trimming setelah jahit velcro, periksa auto-cutter secara berkala, dan gunakan lint roller untuk bersihkan area velcro.',
  },

  'Trolley cover skewed': {
    root_cause: 'Cover trolley (bagasi) terpasang miring pada body tas, biasanya karena titik jahit tidak simetris atau jig pemasangan tidak presisi untuk area trolley.',
    impact: 'Cover tidak menutup area trolley dengan benar, meninggalkan celah atau terlihat tidak rata. Pada travel bag ini sangat mencolok.',
    process: 'Preparation / Trolley Cover Assembly',
    corrective_action: 'Bongkar dan pasang ulang cover dengan posisi yang benar, gunakan alignment jig, dan ukur jarak dari tepi.',
    preventive_action: 'Buat positioning jig khusus untuk trolley cover, lakukan symmetry check, dan terapkan first piece approval.',
  },

  'Trolley cover distance short': {
    root_cause: 'Jarak cover trolley ke body terlalu pendek, cover tidak bisa menutup area trolley sepenuhnya. Biasanya karena pattern cutting salah atau material shrink.',
    impact: 'Area trolley terbuka dan tidak terlindungi, terlihat tidak rapi. Tas tidak berfungsi dengan baik sebagai travel bag.',
    process: 'Preparation / Cutting / Trolley Assembly',
    corrective_action: 'Ganti cover dengan ukuran yang benar, periksa pattern cutting, dan pertimbangkan material shrinkage allowance.',
    preventive_action: 'Tambahkan shrinkage allowance pada pattern, lakukan cutting trial sebelum massal, dan buat measurement spec untuk trolley cover.',
  },

  'Webbing misaligned': {
    root_cause: 'Webbing pada tahap preparation tidak sejajar dengan panel/titik attachment, biasanya karena tidak ada alignment mark atau jig pemasangan.',
    impact: 'Webbing tidak simetris, strap terpasang miring. Jika webbing untuk strap utama, ini bisa menyebabkan tas tidak nyaman dipakai.',
    process: 'Preparation / Webbing Attachment',
    corrective_action: 'Lepas dan pasang ulang webbing dengan posisi yang benar, gunakan alignment jig, dan ukur dari kedua tepi.',
    preventive_action: 'Buat alignment mark pada panel dan webbing, gunakan positioning jig, dan lakukan measurement check setelah pemasangan.',
  },

  'Webbing height off-position': {
    root_cause: 'Tinggi webbing/strap attachment dari tepi panel menyimpang dari spesifikasi, biasanya karena tidak ada height gauge atau jig longgar.',
    impact: 'Tinggi strap tidak sesuai desain, tas terlihat tidak proporsional. Pada backpack, ini bisa mempengaruhi kenyamanan pemakaian.',
    process: 'Preparation / Webbing Attachment',
    corrective_action: 'Lepas dan pasang ulang webbing pada height yang benar, gunakan height gauge jig, dan verifikasi dengan ruler.',
    preventive_action: 'Buat height gauge fixture, lakukan measurement check setiap 10 unit, dan terapkan go/no-go gauge untuk tinggi webbing.',
  },

  'Stitching edge distance inconsistent': {
    root_cause: 'Jarak jahitan dari tepi tidak konsisten (kadang 3mm, kadang 6mm), biasanya karena operator menjahit tanpa guide atau guide plate longgar.',
    impact: 'Jahitan terlihat tidak rapi dan tidak profesional, jarak yang terlalu dekat ke tepi mengurangi kekuatan jahitan.',
    process: 'Preparation / Stitching',
    corrective_action: 'Pasang/perbaiki edge guide pada mesin jahit, adjust guide distance sesuai spesifikasi, dan jahit ulang yang tidak konsisten.',
    preventive_action: 'Wajibkan edge guide untuk semua jahit tepi, kalibrasi guide setiap ganti model, dan lakukan inline measurement check.',
  },

  'Loose thread / Thread break': {
    root_cause: 'Benang longgar atau putus di area preparation, biasanya karena auto-cutter tidak berfungsi, mesin komputerisasi tidak memotong rapi, atau benang berkualitas rendah.',
    impact: 'Benang longgar menggantung pada komponen semi-finished, terlihat tidak rapi. Jika terbawa ke proses selanjutnya bisa tersangkut dan menyebabkan masalah.',
    process: 'Preparation / Finishing',
    corrective_action: 'Potong semua benang longgar, periksa auto-cutter mesin, ganti benang yang sering putus, dan lakukan thread trimming.',
    preventive_action: 'Periksa auto-cutter setiap awal shift, gunakan benang yang memenuhi tensile strength standard, dan terapkan thread trimming SOP.',
  },

  'Float thread / Skip stitch (computerized)': {
    root_cause: 'Mesin komputerisasi (bartack/pattern stitch) menghasilkan float thread atau skip stitch karena tension tidak tepat, program pattern error, atau hook/needle aus.',
    impact: 'Pattern stitch tidak lengkap atau tidak rapi, mengurangi estetika dan fungsi dari bartack atau decorative stitch pada komponen preparation.',
    process: 'Preparation / Computerized Stitching',
    corrective_action: 'Perbaiki tension mesin komputerisasi, verifikasi program pattern, ganti needle/hook yang aus, dan jalankan ulang pada sample.',
    preventive_action: 'Lakukan maintenance mesin komputerisasi secara berkala, verifikasi program pattern setiap ganti style, dan buat sample standar per pattern.',
  },

  'Pattern stitch edge distance inconsistent': {
    root_cause: 'Jarak pattern stitch (dekoratif) dari tepi tidak konsisten, biasanya karena program mesin tidak presisi atau material bergeser saat di-stitch.',
    impact: 'Pattern stitch terlihat tidak rapi dan tidak presisi, mengurangi estetika produk terutama pada bagian yang menjadi focal point desain.',
    process: 'Preparation / Computerized Stitching',
    corrective_action: 'Perbaiki program mesin, gunakan hoop/fixture untuk menjaga material tetap posisi, dan adjust origin point.',
    preventive_action: 'Verifikasi program pattern sebelum produksi, gunakan holding fixture, dan lakukan measurement check pada sample pertama.',
  },

  'Elastic band skewed': {
    root_cause: 'Karet elastis terpasang miring atau tidak rata, biasanya karena tarikan tidak konsisten saat menjahit atau tidak ada jig pemasangan.',
    impact: 'Elastic tidak berfungsi dengan baik — bagian yang seharusnya elastis tidak merata. Juga mencolok secara visual.',
    process: 'Preparation / Elastic Attachment',
    corrective_action: 'Lepas dan pasang ulang elastic dengan tarikan yang konsisten, gunakan jig pemasangan, dan pastikan elastic tidak tertwist.',
    preventive_action: 'Gunakan elastic attachment jig dengan tarikan terukur, lakukan stretch test setelah pemasangan, dan terapkan SOP elastic sewing.',
  },

  'Logo font detached': {
    root_cause: 'Font/huruf pada logo terlepas karena adhesive tidak kuat atau proses heat press kurang. Biasanya pada logo embroidered dengan applique atau transfer print.',
    impact: 'Font logo tanggal sehingga brand name tidak terbaca. Ini adalah critical visual defect yang menurunkan brand image secara signifikan.',
    process: 'Preparation / Logo Attachment',
    corrective_action: 'Ganti logo yang font-nya tanggal, perbaiki parameter heat press (suhu, tekanan, waktu), dan lakukan adhesion test.',
    preventive_action: 'Buat parameter card per jenis logo, lakukan pull test dan wash test pada sample, dan terapkan incoming QC untuk logo.',
  },

  'Logo scratched': {
    root_cause: 'Logo tergores saat proses handling atau setelah dipasang, biasanya karena tools metal contact atau gesekan dengan komponen lain saat proses assembly.',
    impact: 'Goresan pada logo sangat mencolok, terutama pada logo metal/metallic. Tidak bisa diperbaiki, harus diganti.',
    process: 'Preparation / Handling',
    corrective_action: 'Ganti logo yang tergores, identifikasi sumber goresan, dan perbaiki handling prosedur (gunakan protective film atau separator).',
    preventive_action: 'Gunakan protective film pada logo, pisahkan komponen dengan logo dari area yang berpotensi gesekan, dan terapkan handling SOP.',
  },

  'Triangle piece reversed': {
    root_cause: 'Triangle piece (untuk handle base/strap anchor) terbalik, biasanya karena tidak ada tanda atas-bawah pada triangle atau operator mengambil dari sisi yang salah.',
    impact: 'Triangle piece terbalik membuat jahitan tidak terlihat dengan benar dan mengurangi kekuatan struktur pada titik anchor handle/strap.',
    process: 'Preparation / Assembly',
    corrective_action: 'Bongkar dan pasang ulang triangle piece dengan orientasi yang benar, tambahkan tanda orientasi.',
    preventive_action: 'Tandai "TOP" pada triangle piece, buat visual guide di area kerja, dan lakukan orientation check sebelum menjahit.',
  },
};
