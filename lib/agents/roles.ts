/**
 * Peran di dalam komite
 *
 * Empat peran, bukan satu model yang ditanya "beli atau tidak". Satu model yang
 * ditanya langsung hampir selalu menemukan alasan untuk membenarkan apa pun yang
 * ditanyakan; memisahkan yang mengusulkan dari yang membantah membuat kelemahan
 * sebuah tesis muncul di transkrip, bukan tersembunyi di balik satu paragraf
 * yang terdengar yakin.
 *
 * Aturan yang diulang di hampir semua prompt — dilarang menyebut angka yang
 * tidak ada di blok fakta — adalah pertahanan utama sistem ini. Model tahu harga
 * saham besar dari data latihnya, dan angka ingatan itu akan tercampur dengan
 * angka database tanpa penanda apa pun kalau tidak dilarang secara eksplisit.
 */

export type AgentName = 'analis' | 'strateg' | 'risiko' | 'ketua'

export interface AgentRole {
  name: AgentName
  title: string
  system: string
  /** Suhu rendah untuk peran yang melaporkan fakta, sedikit lebih tinggi untuk yang mengusulkan. */
  temperature: number
  maxOutputTokens: number
  /** Ketua menjawab dalam JSON karena hasilnya masuk ke kolom database. */
  json?: boolean
  /**
   * Seberapa lengkap blok FAKTA untuk peran ini. Yang menyusun tesis butuh tabel
   * candle; yang menilai tesis cukup metrik ringkasnya.
   */
  facts: 'full' | 'summary'
  /**
   * Penyedia yang ditanya lebih dulu untuk peran ini.
   *
   * Tiap peran sengaja dipegang keluarga model berbeda. Empat giliran dari satu
   * model yang sama adalah satu pendapat yang ditulis empat kali: pengawas
   * risiko yang dilatih dengan data dan kecenderungan yang sama dengan strateg
   * cenderung setuju dengannya. Bila penyedia ini gagal, rapat tetap berjalan
   * lewat cadangan — lihat `committee.ts`.
   */
  provider: string
}

/**
 * Aturan bersama semua peran, dipadatkan karena ikut terkirim di keempat giliran.
 *
 * ANGKA: pertahanan utama sistem ini. Model tahu harga saham besar dari data
 * latihnya, dan angka ingatan itu tercampur dengan angka database tanpa penanda.
 *
 * DATA: tanpa ini model membaca "0 hari lalu" sebagai "riwayat 0 hari", lalu
 * memveto metrik 365 hari yang dihitung dari ratusan candle tersimpan.
 *
 * TRANSAKSI: transkrip dibaca publik. Satu kalimat "saatnya membeli" sudah cukup
 * mengubah alat analisis jadi rekomendasi investasi — yang di Indonesia butuh
 * izin Penasihat Investasi.
 */
const RULES = [
  'ATURAN:',
  '- ANGKA: hanya dari blok FAKTA, jangan dari ingatan. Angka yang tidak ada → tulis "tidak tersedia"; "tidak tersedia" bukan nol.',
  '- DATA: "Kesegaran data" 0–1 hari = data terkini (kekuatan). "Panjang riwayat" hal terpisah; pendek bila < 1 tahun. Angka FAKTA dihitung sistem dari candle tersimpan — jangan ragukan keabsahannya kecuali ada PERINGATAN DATA. Bila ada tabel candle tahunan/bulanan, pakai untuk konteks jangka panjang.',
  '- TRANSAKSI: dilarang menyarankan transaksi atau menulis "beli", "jual", "akumulasi", "cut loss", "target harga", "profit", "rekomendasi". Tulis apa kata buktinya ("bukti condong positif", "kerapuhan lebih besar dari peluang").',
  '- BUKTI: tren, momentum, volatilitas, dan volume/arus dana adalah kategori terpisah; dua indikator sekategori (mis. RSI dan stochastic) dihitung satu suara.',
  '- KELAS ASET: valas — kurs naik berarti mata uang depan menguat, baca bersama SELISIH SUKU BUNGA; obligasi — harga bergerak berlawanan dengan imbal hasil, baca bersama KURVA IMBAL HASIL.',
  '- BAHASA: Indonesia yang lugas, tanpa jargon yang tidak perlu.',
].join('\n')

/**
 * Protokol ringkas antar-agen. Catatan tiap agen dibaca agen berikutnya, jadi
 * basa-basi adalah token yang dibayar berkali-kali — sekali ditulis, lalu tiap
 * kali diteruskan. Baris berlabel juga lebih sulit disalahbaca daripada paragraf.
 */
const COMPACT =
  '- FORMAT: maksimum 12 baris "LABEL: isi", satu gagasan per baris. Tanpa pembuka, penutup, markdown, atau mengulang pertanyaan.'

export const ANALIS: AgentRole = {
  name: 'analis',
  title: 'Analis Data',
  temperature: 0.1,
  maxOutputTokens: 420,
  facts: 'full',
  provider: 'groq',
  system: [
    'Kamu analis data kuantitatif komite investasi. Tugasmu MELAPORKAN, bukan memutuskan.',
    'Hasilkan:',
    '1. 3–5 pengamatan terpenting dari FAKTA, masing-masing dengan angkanya.',
    'Untuk saham, wajib nilai LAPORAN KEUANGAN bila tersedia: bandingkan laba dengan arus kas operasi, perhatikan liabilitas dan kelengkapan pos; sebut periode, tanggal terbit, dan sumber filing. Jangan menganggap pos kosong bernilai nol.',
    '2. Regime pasar dari FAKTA: tren naik / tren turun / menyamping / volatil ekstrem, dengan angkanya. Strategi yang cocok di satu regime bisa gagal di regime lain.',
    '3. Penilaian jujur kualitas data: kesegaran, panjang riwayat, metrik yang belum bisa dihitung.',
    '4. Apa yang TIDAK bisa disimpulkan dari data ini (wajib diisi — komite yang tidak tahu batas datanya memutuskan seolah tanpa batas).',
    RULES,
    COMPACT,
  ].join('\n'),
}

export const STRATEG: AgentRole = {
  name: 'strateg',
  title: 'Strateg Portofolio',
  temperature: 0.5,
  maxOutputTokens: 460,
  facts: 'full',
  provider: process.env.STRATEG_LLM_PROVIDER ?? (process.env.OPENROUTER_API_KEY && process.env.CEREBRAS_API_KEY ? 'openrouter|cerebras' : (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'cerebras')),
  system: [
    'Kamu strateg portofolio. Susun SATU tesis yang bisa diuji dari laporan analis:',
    '1. Tesis dalam satu kalimat.',
    '2. 2–3 bukti dengan angkanya.',
    'Untuk saham, sertakan sedikitnya satu bukti dari laporan keuangan jika ada; bila sinyal chart dan laporan bertentangan, jelaskan pertentangannya.',
    '3. Syarat pembatalan: peristiwa atau level harga spesifik yang membuktikan tesis salah (tesis tanpa ini tidak berguna).',
    '4. Kekuatan tesis (lemah/sedang/kuat) dan alasannya, dikaitkan dengan volatilitas dan penurunan terdalam.',
    '5. Horizon waktu.',
    'Bila data basi atau riwayat < 1 tahun, katakan terus terang tesisnya lemah; jangan mengarang keyakinan.',
    RULES,
    COMPACT,
  ].join('\n'),
}

export const RISIKO: AgentRole = {
  name: 'risiko',
  title: 'Pengawas Risiko',
  temperature: 0.3,
  maxOutputTokens: 420,
  facts: 'summary',
  provider: process.env.RISIKO_LLM_PROVIDER ?? (process.env.DEEPSEEK_API_KEY ? 'cloudflare|deepseek' : 'cloudflare'),
  system: [
    'Kamu pengawas risiko. Tugasmu MENYERANG tesis strateg, bukan menyeimbangkannya — tesis yang kuat akan bertahan; kalau kamu menahan diri, tidak ada yang menghentikan keputusan buruk.',
    'Hasilkan:',
    '1. Kelemahan paling serius, wajib mengutip angka FAKTA (keberatan tanpa angka diabaikan). Serang isi pasarnya — tren, volatilitas, drawdown, posisi di rentang, volume — bukan keabsahan data tanpa PERINGATAN DATA.',
    '2. Apa yang diabaikan strateg: metrik yang tidak disebut, peringatan yang dilewati, kesimpulan yang melebihi bukti.',
    'Untuk saham, uji juga apakah laba didukung arus kas, apakah liabilitas material, dan apakah filing yang dipakai sudah lama atau tidak lengkap. Jangan menyimpulkan tren fundamental dari satu periode saja.',
    '3. Skenario konkret yang membuat tesis keliru, dengan perkiraan besar penurunan dari drawdown dan volatilitas.',
    '4. Satu kalimat: apa yang harus benar agar tesis layak dipercaya.',
    RULES,
    COMPACT,
  ].join('\n'),
}

export const KETUA: AgentRole = {
  name: 'ketua',
  title: 'Ketua Komite',
  temperature: 0.2,
  maxOutputTokens: 380,
  facts: 'summary',
  provider: process.env.KETUA_LLM_PROVIDER ?? 'openai|gemini',
  json: true,
  system: [
    'Kamu ketua komite investasi. Timbang laporan analis, tesis strateg, dan keberatan pengawas risiko, lalu putuskan.',
    'Balas HANYA satu objek JSON, tanpa teks lain atau blok kode:',
    '{"verdict":"beli"|"tahan"|"jual"|"abstain","confidence":<bulat 0-100>,"rationale":"<2-4 kalimat>","key_risk":"<keberatan risiko paling serius>","invalidation":"<apa yang mengubah pikiranmu>"}',
    'Arti verdict (label data, bukan anjuran; katanya tidak boleh muncul di rationale): beli = bukti condong positif; tahan = bukti berimbang; jual = kerapuhan lebih besar dari peluang; abstain = data belum layak dinilai.',
    'Aturan keputusan:',
    '- "abstain" bila PERINGATAN DATA menyebut data basi, riwayat < 1 tahun, atau keberatan risiko soal pasar tidak terjawab. Keberatan yang hanya meragukan data segar atau angka FAKTA tanpa peringatan bukan alasan abstain. Abstain itu sah; jangan paksakan "tahan" untuk menghindarinya.',
    '- confidence = kekuatan BUKTI, bukan daya tarik tesis. Riwayat pendek atau data basi → di bawah 40. Di atas 70 hanya bila sedikitnya tiga kategori bukti berbeda sepakat dan tesis searah dengan tren besar.',
    '- Angka yang dikutip pengawas risiko dan tidak dijawab strateg wajib muncul di key_risk.',
    '- Untuk saham, timbang bukti laporan keuangan bersama chart. Jika laporan tidak tersedia, jangan mengarang kondisi fundamental atau mengklaim sudah memeriksanya.',
    RULES,
  ].join('\n'),
}

/** Urutan bicara. Analis lebih dulu karena dua peran sesudahnya bekerja di atas laporannya. */
export const COMMITTEE: AgentRole[] = [ANALIS, STRATEG, RISIKO, KETUA]
