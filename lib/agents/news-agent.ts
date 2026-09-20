/**
 * Agen Jurnalis & Intelijen Pasar AI (AI Market Intelligence & News Agent).
 *
 * Memproduksi artikel analisis mendalam seputar:
 * - Ekonomi Makro & Kebijakan Suku Bunga
 * - Ledakan AI, Semikonduktor, & Belanja Capex Teknologi
 * - Sektor Energi, Komoditas, & Permintaan Listrik AI Data Center
 * - Korelasi langsung ke Saham Global (US), Saham Lokal (IDX), Kripto, & Emas
 *
 * Dilengkapi kurasi visual (foto resolusi tinggi & video YouTube relevan),
 * metadata SEO terstruktur (JSON-LD), serta format siap-konsumsi untuk AI lain.
 */

import { complete } from '@/lib/ai/registry'
import { saveMarketNews, getMarketNewsList } from '@/lib/db/news-queries'
import type { NewMarketNews } from '@/lib/db/schema'

export interface GenerateArticleInput {
  topic?: string
  category?: 'ekonomi-makro' | 'teknologi-ai' | 'energi-komoditas' | 'saham-idx' | 'crypto-fintech'
  targetSymbols?: string[]
}

/**
 * Kurasi gambar tematik terverifikasi (Unsplash CDN direct image URLs)
 */
const THEMATIC_IMAGES = {
  ai_datacenter: {
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
    caption: 'Fasilitas server AI dan pusat data generasi baru yang membutuhkan suplai listrik gigawatt tanpa henti.',
    credit: 'Unsplash / Ash Edmonds',
    alt: 'AI Supercomputer Server Data Center'
  },
  nuclear_energy: {
    url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1200&q=80',
    caption: 'Infrastruktur pembangkit listrik ramah lingkungan dan energi bersih penyokong infrastruktur masa depan.',
    credit: 'Unsplash / Matthew Henry',
    alt: 'Clean Energy & Power Infrastructure'
  },
  wall_street: {
    url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
    caption: 'Pergerakan pasar modal global dan dinamika arus dana institusional di tengah perubahan arah suku bunga.',
    credit: 'Unsplash / Nicholas Cappello',
    alt: 'Stock Exchange Chart Financial Market'
  },
  semiconductor: {
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    caption: 'Silikon mikroprosesor akselerator AI berkecepatan tinggi penggerak gelombang komputasi cerdas.',
    credit: 'Unsplash / Alexandre Debiève',
    alt: 'Semiconductor Microchip Processor'
  },
  idx_exchange: {
    url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1200&q=80',
    caption: 'Aktivitas perdagangan bursa saham dan sentimen pelaku pasar terhadap saham berkapitalisasi besar.',
    credit: 'Unsplash / Aditya Chache',
    alt: 'Bursa Efek Pasar Modal Indonesia'
  },
  gold_commodity: {
    url: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=1200&q=80',
    caption: 'Batangan emas fisik murni sebagai lindung nilai utama di tengah ketidakpastian geopolitik global.',
    credit: 'Unsplash / Jingming Pan',
    alt: 'Gold Bullion Safe Haven Commodity'
  },
  crypto_bitcoin: {
    url: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=1200&q=80',
    caption: 'Dinamika aset kripto dan adopsi institusi terhadap aset digital terdesentralisasi.',
    credit: 'Unsplash / Dmitry Demidko',
    alt: 'Bitcoin Cryptocurrency Digital Asset'
  }
}

/**
 * Kurasi video YouTube resmi dari media finansial & analis terpercaya
 */
const CURATED_YOUTUBE_VIDEOS = {
  ai_power_crisis: {
    videoId: '0m3N0cI5QjQ',
    title: 'How AI Is Fueling A Massive Energy Boom',
    channel: 'CNBC International',
    relevance: 'Eksplorasi mendalam krisis listrik data center AI dan lonjakan saham pembangkit listrik.'
  },
  nvidia_blackwell: {
    videoId: 'Y2F8yisiS6E',
    title: 'NVIDIA CEO Jensen Huang on Next-Gen AI Infrastructure',
    channel: 'Bloomberg Technology',
    relevance: 'Wawancara resmi arsitektur chip AI generasi baru dan belanja capex hyperscaler.'
  },
  fed_rate_macro: {
    videoId: 'c_qfL67H-84',
    title: 'Federal Reserve Chair Jerome Powell on Economic Outlook & Interest Rates',
    channel: 'Federal Reserve',
    relevance: 'Pernyataan langsung arah kebijakan moneter dan proyeksi inflasi AS.'
  },
  gold_commodities: {
    videoId: 'dE1N8k2v0iQ',
    title: 'Why Central Banks Are Buying Gold At Record Pace',
    channel: 'Bloomberg Television',
    relevance: 'Analisis rekor pembelian cadangan devisa emas oleh bank sentral global.'
  },
  idx_indonesia_economy: {
    videoId: 'j8K_r82m9Qk',
    title: 'Prospek Ekonomi Indonesia & Peluang Sektor Unggulan IHSG',
    channel: 'CNBC Indonesia',
    relevance: 'Ulasan perkembangan makroekonomi domestik dan rotasi saham komoditas/energi.'
  }
}

/**
 * Artikel bibit (Seed Articles) untuk memastikan portal berita langsung terisi
 * materi intelijen berbobot institusional saat pertama kali dibuka.
 */
export const SEED_ARTICLES: NewMarketNews[] = [
  {
    slug: 'ai-capex-ledakan-permintaan-energi-listrik-saham-terkait',
    title: 'Krisis Listrik AI: Mengapa Ledakan Chip NVDA Membakar Saham Energi & Panas Bumi BREN',
    summary: 'Lonjakan belanja capex data center AI global menciptakan lonjakan konsumsi listrik yang belum pernah terjadi sebelumnya. Dari nuklir AS hingga panas bumi IDX, inilah pemenang rantai nilai energi AI.',
    category: 'teknologi-ai',
    tags: ['AI', 'Energi', 'Semikonduktor', 'Data Center', 'Panas Bumi', 'NVIDIA'],
    mentionedSymbols: ['NVDA', 'BREN.JK', 'AMMN.JK', 'TSM', 'DELL'],
    sentiment: 'bullish',
    impactScore: 9,
    featuredImage: THEMATIC_IMAGES.ai_datacenter,
    youtubeVideo: CURATED_YOUTUBE_VIDEOS.ai_power_crisis,
    keyTakeaways: [
      'Pusat data AI generasi baru (NVIDIA Blackwell) membutuhkan daya 3 hingga 5 kali lipat lebih padat per rak server dibanding komputasi cloud tradisional.',
      'Perusahaan teknologi raksasa (Microsoft, Google, Amazon, Meta) mengunci kontrak listrik bebas emisi jangka panjang 10–20 tahun.',
      'Di pasar domestik, emiten energi terbarukan dan tembaga kabel listrik seperti BREN.JK dan AMMN.JK menikmati sentimen limpahan likuiditas struktural.',
      'Sektor energi bertransformasi dari sektor defensif bertumbuh lambat menjadi komoditas pertumbuhan eksponensial (growth multiplier).'
    ],
    contentMarkdown: `## Konvergensi Terbesar Abad Ini: Silikon Bertemu Gigawatt

Dunia komputasi sedang menghadapi batas fisik nyata: <strong>listrik</strong>. Dalam dua tahun terakhir, narasi pasar modal didominasi oleh siapa pembuat chip AI tercepat. Namun pada paruh kedua tahun ini, pertanyaan para manajer dana global bergeser dari <em>"Berapa banyak GPU yang bisa Anda beli?"</em> menjadi <u>"Dari mana Anda mendapatkan gigawatt listrik untuk menyalakannya?"</u>.

Pusat data konvensional umumnya memerlukan daya sekitar 7 hingga 10 kilowatt (kW) per rak server. Server berbasis arsitektur <strong>NVIDIA Blackwell NVL72</strong> mengonsumsi lebih dari <mark>120 kW per rak</mark>, menghasilkan panas luar biasa yang mewajibkan pendinginan cair (<em>liquid cooling</em>) terpadu serta pasokan daya tanpa jeda (<u>24/7 baseload power</u>).

<hr />

### Matriks Komparasi Rantai Pasok Energi & Komputasi AI

<table>
  <thead>
    <tr>
      <th>Segmen Rantai Nilai</th>
      <th>Simbol Aset</th>
      <th>Peran Kunci dalam Ekosistem AI</th>
      <th>Valuasi &amp; Sentimen</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Komputasi &amp; Fabrikasi</td>
      <td><strong>NVDA</strong>, <strong>TSM</strong></td>
      <td>Arsitektur GPU generasi baru dan litografi 3nm CoWoS</td>
      <td>Premium (Bullish)</td>
    </tr>
    <tr>
      <td>Energi Hijau Baseload</td>
      <td><strong>BREN.JK</strong></td>
      <td>Penyedia listrik panas bumi tanpa karbon untuk data center domestik</td>
      <td>Strategis (Akumulasi)</td>
    </tr>
    <tr>
      <td>Transmisi &amp; Komoditas</td>
      <td><strong>AMMN.JK</strong></td>
      <td>Pasokan tembaga berkadar tinggi untuk kabel daya &amp; busbar server</td>
      <td>Tumbuh Pesat (Bullish)</td>
    </tr>
  </tbody>
</table>

### Siapa Saja yang Menguasai Rantai Pasok Ini?

1. <strong>Raja Chip AI &amp; Fabrikasi (NVDA &amp; TSM)</strong>:
   NVIDIA terus mempertahankan margin laba kotor di atas 70% berkat permintaan tak terbatas dari <em>hyperscalers</em>. TSMC menjadi satu-satunya pembuat silikon tercanggih yang mampu mengemas chip AI skala besar melalui teknologi CoWoS.
2. <strong>Pembangkit Listrik Bersih &amp; Nuklir SMR</strong>:
   Di bursa Amerika Serikat, saham seperti Constellation Energy (CEG) dan Vistra melonjak setelah Microsoft menyepakati pembelian seluruh daya dari pembangkit nuklir Three Mile Island.
3. <strong>Koneksi Pasar Domestik Indonesia (BREN.JK &amp; AMMN.JK)</strong>:
   Indonesia memegang peran strategis ganda:
   - <strong>BREN.JK (Barito Renewables)</strong>: Memegang kapasitas panas bumi (<em>geothermal</em>) terbesar di kawasan, sumber energi hijau baseload yang paling dicari untuk penyediaan data center regional hijau.
   - <strong>AMMN.JK (Amman Mineral)</strong>: Permintaan kabel transmisi tembaga untuk konektivitas busbar data center global melonjak hingga dua kali lipat per megawatt kapasitas terpasang.

<hr />

### Implikasi Portofolio &amp; Skenario Risiko

Investor yang hanya mengoleksi saham perangkat lunak berisiko kehilangan rotasi modal terbesar dekade ini. Alokasi strategis kini mengalir ke perusahaan infrastruktur fisik: <u>tembaga, pendingin cair, trafo listrik tegangan tinggi, dan energi terbarukan</u>.

<blockquote>
  <p><strong>Peringatan Risiko Pengawas</strong>: Hambatan regulasi izin sambungan grid PLN dan utilitas AS bisa menunda penyelesaian fasilitas data center hingga 2–4 tahun, yang dapat memicu kompresi valuasi jika belanja capex AI tidak segera menghasilkan laba operasional riil bagi penyewa cloud.</p>
</blockquote>`,
    author: 'AI Intelligence Desk (Makro & Energi)',
    readingTimeMinutes: 4,
    publishedAt: new Date(Date.now() - 3600 * 1000 * 4), // 4 jam lalu
  },

  {
    slug: 'arah-kebijakan-the-fed-rotasi-saham-ihsg-dan-kripto',
    title: 'Sinyal Poros Suku Bunga The Fed: Dampak Arus Modal Asing ke IHSG, Saham Bank, & Likuiditas Bitcoin',
    summary: 'Siklus pelonggaran moneter bank sentral global kembali membuka kran likuiditas global. Bagaimana dampaknya terhadap nilai tukar Rupiah, saham perbankan IDX, dan reli aset berisiko tinggi?',
    category: 'ekonomi-makro',
    tags: ['The Fed', 'Suku Bunga', 'IHSG', 'Perbankan', 'Bitcoin', 'Rupiah'],
    mentionedSymbols: ['BBCA.JK', 'BBRI.JK', 'BTCUSDT', 'GOLD'],
    sentiment: 'bullish',
    impactScore: 8,
    featuredImage: THEMATIC_IMAGES.wall_street,
    youtubeVideo: CURATED_YOUTUBE_VIDEOS.fed_rate_macro,
    keyTakeaways: [
      'Pemangkasan suku bunga acuan The Fed menurunkan imbal hasil US Treasury sehingga memicu arus dana asing (foreign inflow) kembali ke pasar negara berkembang (emerging markets).',
      'Bank Indonesia memiliki ruang moneter lebih leluasa untuk menjaga stabilitas Rupiah sekaligus mendorong pertumbuhan kredit domestik.',
      'Sektor perbankan berkapitalisasi besar (BBCA, BBRI, BMRI) menjadi penerima manfaat pertama dari alokasi dana indeks global.',
      'Aset langka dengan pasokan terbatas seperti Bitcoin (BTC) dan Emas (GOLD) mencatat kinerja unggul saat ekspansi jumlah uang beredar (M2 global) meningkat.'
    ],
    contentMarkdown: `## Pembukaan Kran Likuiditas Global & Efek Domino ke Indonesia

Ketika Federal Reserve AS mulai menurunkan suku bunga dana federal (*Fed Funds Rate*), biaya modal di seluruh dunia mengalami rekalibrasi. Tekanan pada mata uang negara berkembang mereda, dan imbal hasil obligasi negara maju yang menyusut mendorong manajer investasi Wall Street mencari *yield* lebih menarik di kawasan Asia Tenggara.

### Tiga Saluran Transmisi Utama ke Portofolio

1. **Penguatan Rupiah & Ruang Napas Bank Indonesia**:
   Penyempitan diferensial suku bunga antara AS dan Indonesia mengurangi tekanan *capital outflow*. Hal ini memungkinkan Bank Indonesia mempertahankan suku bunga akomodatif tanpa mengorbankan cadangan devisa.
2. **Katalis Positif Saham Perbankan Inti (BBCA.JK & BBRI.JK)**:
   Perbankan Indonesia terkenal dengan efisiensi dana murah (*CASA*) yang sangat tinggi. Di era penurunan bunga acuan, biaya dana (*Cost of Funds*) turun lebih cepat daripada penurunan imbal hasil kredit, menopang *Net Interest Margin* (NIM) tetap sehat.
3. **Bitcoin dan Emas Sebagai Cermin Likuiditas M2 Global**:
   Secara historis, Bitcoin (BTCUSDT) dan Emas (GOLD) memiliki korelasi positif yang sangat erat dengan pertumbuhan likuiditas bank sentral global (Global M2). Ketika neraca bank sentral berekspansi, aset yang tidak dapat dicetak secara sewenang-wenang cenderung mengalami apresiasi nilai relatif.

---

### Ringkasan Taktis Komite

| Aset / Instrumen | Arah Dampak | Horizon Waktu | Tingkat Keyakinan |
|---|---|---|---|
| **BBCA.JK / BBRI.JK** | Net Inflow Asing Positif | 3–6 Bulan | Tinggi (85%) |
| **BTCUSDT** | Ekspansi Likuiditas Global | 6–12 Bulan | Tinggi (80%) |
| **GOLD** | Lindung Nilai Devaluasi Fiat | 12+ Bulan | Sangat Tinggi (90%) |`,
    author: 'AI Intelligence Desk (Kebijakan Moneter)',
    readingTimeMinutes: 4,
    publishedAt: new Date(Date.now() - 3600 * 1000 * 12), // 12 jam lalu
  },
  {
    slug: 'rekor-cadangan-emas-bank-sentral-dan-posisi-safe-haven',
    title: 'Dedolarisasi & Rekor Emas Global: Mengapa Bank Sentral Memborong Emas Fisik Tanpa Henti',
    summary: 'Volume akumulasi emas fisik oleh bank sentral global menembus rekor tertinggi sepanjang sejarah. Di tengah ketegangan geopolitik dan sanksi finansial, emas mengukuhkan diri sebagai pilar kedaulatan cadangan devisa.',
    category: 'energi-komoditas',
    tags: ['Emas', 'Komoditas', 'Dedolarisasi', 'Bank Sentral', 'Geopolitik'],
    mentionedSymbols: ['GOLD', 'ANTM.JK'],
    sentiment: 'bullish',
    impactScore: 8,
    featuredImage: THEMATIC_IMAGES.gold_commodity,
    youtubeVideo: CURATED_YOUTUBE_VIDEOS.gold_commodities,
    keyTakeaways: [
      'Pembelian emas oleh bank sentral (terutama People Bank of China dan bank sentral emerging markets) melampaui 1.000 ton per tahun secara berturut-turut.',
      'Kekhawatiran pembekuan aset devisa berbasis dolar pasca-konflik geopolitik mempercepat diversifikasi ke aset cadangan tanpa risiko pihak ketiga (counterparty risk).',
      'Harga emas batangan global menguji level tertinggi baru secara konsisten, menopang sentimen positif produsen emas domestik seperti ANTM.JK.',
      'Bagi investor ritel, emas tetap menjadi jangkar penyeimbang volatilitas portofolio saham dan kripto.'
    ],
    contentMarkdown: `## Dari Surat Utang Menuju Emas Fisik: Reorientasi Cadangan Devisa

Selama empat dekade terakhir, obligasi pemerintah AS (US Treasury) adalah aset cadangan devisa standar dunia. Namun sejak tahun 2022, ketika cadangan devisa valuta asing salah satu negara besar dibekukan melalui sistem perbankan Barat, para gubernur bank sentral di seluruh dunia menyadari satu pelajaran penting: **aset yang disimpan di neraca negara lain memiliki risiko yurisdiksi**.

Satu-satunya aset moneter internasional yang tidak memiliki *counterparty risk*, tidak dapat disanksi dari jarak jauh, dan diterima oleh seluruh peradaban manusia selama lima ribu tahun adalah **emas fisik**.

---

### Dinamika Pasar & Sentimen Saham Komoditas

- **Emas Global (GOLD)**: Menunjukkan ketahanan luar biasa bahkan ketika suku bunga riil AS sempat tinggi — anomali positif yang membuktikan bahwa permintaan tidak lagi didorong oleh spekulan suku bunga, melainkan oleh pembelian struktural bank sentral yang tidak sensitif harga.
- **Dampak Emiten Lokal (ANTM.JK)**: Peningkatan permintaan emas batangan ritel domestik memperbesar volume penjualan segmen logam mulia, memberikan bantalan pendapatan saat harga komoditas nikel mengalami siklus koreksi pasokan.`,
    author: 'AI Intelligence Desk (Komoditas Strategis)',
    readingTimeMinutes: 3,
    publishedAt: new Date(Date.now() - 3600 * 1000 * 24), // 1 hari lalu
  },
  {
    slug: 'perang-chip-semikonduktor-dan-dominasi-tsmc-nvidia',
    title: 'Perang Arsitektur Chip: Mengapa Kemacetan Fabrikasi TSMC Menentukan Nasib Saham Big Tech Global',
    summary: 'Persaingan teknologi kecerdasan buatan mengerucut pada satu titik sempit: pabrik fabrikasi Taiwan (TSMC) dan arsitektur akselerator NVIDIA. Apa artinya bagi valuasi Microsoft, Apple, Google, dan Meta?',
    category: 'teknologi-ai',
    tags: ['Semikonduktor', 'NVIDIA', 'TSMC', 'Big Tech', 'Hardware'],
    mentionedSymbols: ['NVDA', 'TSM', 'PLTR', 'ARM'],
    sentiment: 'mixed',
    impactScore: 9,
    featuredImage: THEMATIC_IMAGES.semiconductor,
    youtubeVideo: CURATED_YOUTUBE_VIDEOS.nvidia_blackwell,
    keyTakeaways: [
      'Hampir 90% chip akselerator AI tercanggih di dunia diproduksi oleh TSMC di Taiwan, menciptakan konsentrasi risiko pasokan paling ekstrem dalam sejarah industri modern.',
      'Belanja modal (capex) Big Tech (Microsoft, Meta, Google, Amazon) melampaui $200 miliar per tahun untuk mengamankan kapasitas komputasi.',
      'Saham piranti lunak analitik AI seperti PLTR (Palantir) mulai membuktikan konversi komputasi mentah menjadi kontrak pendapatan korporat riil.',
      'Tantangan utama ke depan adalah efisiensi daya dan diversifikasi geografis lokasi pabrik fabrikasi chip ke AS, Jepang, dan Eropa.'
    ],
    contentMarkdown: `## Silikon Sebagai Minyak Baru Ekonomi Abad 21

Jika minyak bumi adalah bahan bakar revolusi industri abad ke-20, maka akselerator komputasi semikonduktor adalah bahan bakar revolusi kecerdasan buatan. Setiap algoritma *large language model*, agen AI otonom, dan visi komputer memerlukan miliaran transistor yang diukir dengan presisi nanometer.

### Anatomi Monopoli Rantai Pasok

Kekuatan ekosistem semikonduktor saat ini terpusat pada tiga pilar yang saling mengunci:
1. **Desain & Arsitektur Perangkat Lunak (NVIDIA / NVDA)**: Arsitektur CUDA dan pustaka perangkat lunak eksklusif membuat pengembang sulit berpindah ke chip pesaing tanpa menulis ulang kode dasar mereka.
2. **Kekayaan Intelektual Inti (ARM Holdings / ARM)**: Arsitektur hemat daya yang mendominasi komputasi tepi dan mulai merambah server CPU cloud.
3. **Manufaktur & Pengemasan Maju (TSMC / TSM)**: Pabrik fabrikasi yang memegang kunci teknologi litografi ekstrem (EUV) dan pengemasan chip 3D (CoWoS).

> **Kesimpulan Intelijen**: Meskipun valuasi saham perangkat keras telah melonjak signifikan, kemacetan pasokan yang ketat menjamin bahwa daya tawar harga (*pricing power*) tetap berada di tangan pemilik kapasitas produksi fisik.`,
    author: 'AI Intelligence Desk (Riset Teknologi)',
    readingTimeMinutes: 4,
    publishedAt: new Date(Date.now() - 3600 * 1000 * 36), // 1.5 hari lalu
  }
]

/**
 * Inisialisasi artikel bibit jika tabel masih kosong
 */
export async function seedInitialNewsArticles(): Promise<void> {
  const existing = await getMarketNewsList({ limit: 1 })
  if (existing.length === 0) {
    console.log('[NewsAgent] Memasukkan artikel bibit intelijen pasar awal...')
    for (const article of SEED_ARTICLES) {
      await saveMarketNews(article)
    }
    console.log(`[NewsAgent] Berhasil memasukkan ${SEED_ARTICLES.length} artikel awal.`)
  }
}

/**
 * Jalankan agen AI untuk memproduksi artikel berita & analisis pasar baru secara on-demand.
 * Menggunakan model LLM dari keyring aktif (Gemini/Groq/OpenRouter).
 */
export async function generateLiveNewsArticle(input: GenerateArticleInput = {}): Promise<NewMarketNews> {
  const defaultTopic = input.topic || 'Dampak Efisiensi Energi Nuklir SMR dan Pembangkit Listrik Terhadap Saham Infrastruktur AI dan Komoditas Tembaga'
  const category = input.category || 'energi-komoditas'
  const targetSymbols = input.targetSymbols || ['NVDA', 'BREN.JK', 'AMMN.JK', 'GOLD']

  const prompt = `Anda adalah "AI Chief Financial Journalist & Intelligence Desk" pada komite investasi kuantitatif institusional.
Tugas Anda adalah menulis satu artikel berita dan analisis intelijen pasar mendalam, kredibel, tajam, dan SEO-friendly.

Fokus Topik: ${defaultTopic}
Kategori: ${category}
Simbol Aset Terkait: ${targetSymbols.join(', ')}

Artikel HARUS memenuhi kriteria:
1. Menghubungkan tren makro ekonomi / teknologi AI / energi dengan dampaknya ke saham riil (US tech, emiten IDX Indonesia, komoditas emas/energi, atau kripto).
2. Gaya bahasa jurnalisme finansial otoritatif (seperti Bloomberg, Financial Times, CNBC), dalam BAHASA INDONESIA yang lugas dan berwibawa.
3. Jangan klise atau teori umum — berikan angka, rasionalisasi arus modal, argumen bull vs bear, dan implikasi portofolio.
4. Format output WAJIB JSON murni tanpa markdown wrapping dengan struktur:
{
  "slug": "kebab-case-slug-maks-80-karakter",
  "title": "Judul Menarik & Otoritatif Maksimal 90 Karakter",
  "summary": "Ringkasan eksekutif 1-2 kalimat untuk meta description SEO (maks 180 karakter)",
  "category": "${category}",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
  "mentionedSymbols": ["${targetSymbols.join('", "')}"],
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "impactScore": 1-10,
  "keyTakeaways": [
    "Poin kunci eksekutif 1",
    "Poin kunci eksekutif 2",
    "Poin kunci eksekutif 3",
    "Poin kunci eksekutif 4"
  ],
  "contentMarkdown": "Isi lengkap artikel minimal 400 kata. Anda sangat dianjurkan memadukan Markdown dan tag HTML seperti di Microsoft Word (seperti <u>garis bawah</u>, <mark>highlight poin penting</mark>, <strong>tebal</strong>, <em>miring</em>, <table> tabel komparasi finansial, <blockquote> kutipan analisis, <hr> garis pemisah, dsb) untuk penyajian riset yang sangat rapi dan profesional.",
  "author": "AI Intelligence Desk",
  "readingTimeMinutes": 3
}`

  const response = await complete({
    messages: [
      {
        role: 'system',
        content: 'Anda adalah sistem intelejen jurnalisme pasar modal AI. Selalu balas dalam format JSON murni yang valid tanpa awalan atau akhiran teks.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.6,
    maxOutputTokens: 2500,
    json: true
  })

  let parsed: any
  try {
    const raw = response.text.trim()
    const cleanJson = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    parsed = JSON.parse(cleanJson)
  } catch (err) {
    console.error('[NewsAgent] Gagal parse JSON LLM, gunakan fallback:', err)
    parsed = {
      slug: `analisis-pasar-${Date.now()}`,
      title: defaultTopic,
      summary: `Analisis mendalam mengenai ${defaultTopic} dan implikasinya terhadap alokasi portofolio saham dan aset digital.`,
      category,
      tags: ['Pasar Modal', 'AI', 'Investasi'],
      mentionedSymbols: targetSymbols,
      sentiment: 'neutral',
      impactScore: 7,
      keyTakeaways: [
        'Volatilitas makro memicu pergeseran alokasi aset institusional.',
        'Sektor teknologi dan energi menjadi pusat perhatian perputaran dana.',
        'Investor dianjurkan mengukur margin of safety secara disiplin.'
      ],
      contentMarkdown: response.text,
      author: 'AI Intelligence Desk',
      readingTimeMinutes: 3
    }
  }

  // Pilih gambar dan video tematik yang paling cocok dengan kategori
  let featuredImg = THEMATIC_IMAGES.ai_datacenter
  let videoEmbed = CURATED_YOUTUBE_VIDEOS.ai_power_crisis

  if (category === 'ekonomi-makro') {
    featuredImg = THEMATIC_IMAGES.wall_street
    videoEmbed = CURATED_YOUTUBE_VIDEOS.fed_rate_macro
  } else if (category === 'energi-komoditas') {
    featuredImg = THEMATIC_IMAGES.nuclear_energy
    videoEmbed = CURATED_YOUTUBE_VIDEOS.ai_power_crisis
  } else if (category === 'saham-idx') {
    featuredImg = THEMATIC_IMAGES.idx_exchange
    videoEmbed = CURATED_YOUTUBE_VIDEOS.idx_indonesia_economy
  } else if (category === 'crypto-fintech') {
    featuredImg = THEMATIC_IMAGES.crypto_bitcoin
    videoEmbed = CURATED_YOUTUBE_VIDEOS.fed_rate_macro
  }

  // Jamin slug bersih, aman URL, dan ramah SEO
  const rawCandidate = parsed.slug || parsed.title || defaultTopic
  const cleanSlug = slugify(rawCandidate) || `analisis-${Date.now().toString(36)}`

  const newArticle: NewMarketNews = {
    slug: cleanSlug,
    title: parsed.title || defaultTopic,
    summary: parsed.summary || 'Analisis intelijen pasar keuangan dan teknologi AI.',
    category: parsed.category || category,
    tags: Array.isArray(parsed.tags) ? parsed.tags : ['Investasi', 'Pasar'],
    mentionedSymbols: Array.isArray(parsed.mentionedSymbols) ? parsed.mentionedSymbols : targetSymbols,
    sentiment: parsed.sentiment || 'neutral',
    impactScore: Number(parsed.impactScore) || 7,
    featuredImage: featuredImg,
    youtubeVideo: videoEmbed,
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    contentMarkdown: parsed.contentMarkdown || response.text,
    author: parsed.author || 'AI Intelligence Desk',
    readingTimeMinutes: Number(parsed.readingTimeMinutes) || 3,
    publishedAt: new Date()
  }

  // Simpan ke database
  const saved = await saveMarketNews(newArticle)
  return saved
}

/**
 * Normalisasi teks menjadi slug URL yang bersih, aman, dan ramah SEO.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

