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
import { mirrorInternetImageToSupabase } from '@/lib/storage/supabase-storage'
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
  },
  copper_mining: {
    url: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=1200&q=80',
    caption: 'Kabel tembaga dan logam industri esensial sebagai penghantar listrik utama bagi infrastruktur komputasi AI.',
    credit: 'Unsplash / Dan Meyers',
    alt: 'Copper Mining & Electrical Infrastructure'
  },
  banking_finance: {
    url: 'https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?auto=format&fit=crop&w=1200&q=80',
    caption: 'Gedung pencakar langit finansial dan aktivitas perbankan korporasi penopang likuiditas ekonomi riil.',
    credit: 'Unsplash / Sean Pollock',
    alt: 'Banking & Financial District Capital'
  },
  geothermal_green: {
    url: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1200&q=80',
    caption: 'Pembangkit energi baru terbarukan dan pasokan listrik ramah lingkungan tanpa emisi karbon.',
    credit: 'Unsplash / Karsten Würth',
    alt: 'Renewable Clean Energy Infrastructure'
  },
  oil_energy: {
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    caption: 'Fasilitas eksplorasi dan transmisi minyak dan gas bumi penggerak ketahanan energi global.',
    credit: 'Unsplash / Matthew Henry',
    alt: 'Oil & Gas Energy Sector'
  },
  ai_software: {
    url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
    caption: 'Arsitektur algoritma dan perangkat lunak komputasi kecerdasan buatan enterprise.',
    credit: 'Unsplash / Fabian Grohs',
    alt: 'AI Software & Algorithm Code'
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
  },
  {
    slug: 'eskalasi-geopolitik-selat-hormuz-minyak-mentah-brent-dan-rekor-emas',
    title: 'Eskalasi Konflik Geopolitik & Disrupsi Jalur Minyak: Mengapa Emas Mengunci Rekor Baru dan Dolar Menguat',
    summary: 'Ketegangan militer di jalur pasokan minyak dunia memicu premi risiko global. Analisis dampak langsung terhadap harga minyak mentah Brent, lonjakan safe-haven emas fisik, serta tekanan depresiasi nilai tukar mata uang berkembang.',
    category: 'komoditi-emas',
    tags: ['Geopolitik', 'Minyak Mentah', 'Emas', 'Komoditi', 'Inflasi', 'Dolar AS'],
    mentionedSymbols: ['CL=F', 'BZ=F', 'XAUUSD', 'MEDC.JK', 'PGAS.JK', 'USDIDR'],
    sentiment: 'bullish',
    impactScore: 9,
    featuredImage: THEMATIC_IMAGES.gold_commodity,
    youtubeVideo: null, // CONTOH NYATA: Tanpa video YouTube. Player otomatis tersembunyi total di reader!
    keyTakeaways: [
      'Disrupsi jalur maritim energi di Selat Hormuz berpotensi memotong pasokan 20% minyak mentah dunia, mendorong premi risiko kilat di pasar berjangka Brent dan WTI.',
      'Bank sentral global dan dana institusional memindahkan aset likuid ke emas fisik murni (XAUUSD) sebagai instrumen lindung nilai mutlak bebas risiko sanksi.',
      'Emiten migas dan energi hulu domestik seperti MEDC.JK dan ELSA.JK mencatat kenaikan rata-rata harga jual (ASP) seketika.',
      'Risiko imported inflation memaksa otoritas moneter mempertahankan suku bunga tinggi demi meredam gejolak nilai tukar mata uang domestik.'
    ],
    contentMarkdown: `## Anatomi Kejutan Geopolitik: Ketika Pasokan Fisik Terancam
Ketika ketegangan militer memuncak di titik-titik penyempitan maritim (*chokepoints*) energi dunia, pasar finansial tidak lagi bereaksi terhadap laporan laba kuartalan, melainkan terhadap <strong>ketersediaan fisik pasokan energi dan keamanan logistik</strong>.

Premi risiko geopolitik (*geopolitical risk premium*) langsung tercermin pada harga minyak mentah Brent yang menguji level kritis di atas $85 per barel. Bagi negara importir neto minyak, setiap kenaikan $10 per barel memperlebar defisit transaksi berjalan dan memberi tekanan depresiasi pada nilai tukar mata uang lokal terhadap Dolar AS (USD).

---

### Tiga Pilar Dampak Harga di Portofolio Global & Domestik

1. **Emas (XAUUSD) Sebagai Benteng Lindung Nilai Mutlak**:
   Berbeda dari instrumen surat utang yang masih membawa risiko gagal bayar atau pembekuan cadangan devisa, emas fisik tidak memiliki risiko pihak ketiga (*counterparty risk*). Pembelian masif oleh bank-bank sentral Asia dan Timur Tengah mengonfirmasi bahwa emas kini diperlakukan sebagai jangkar moneter alternatif.

2. **Dinamika Saham Hulu Migas Domestik (MEDC.JK & PGAS.JK)**:
   Perusahaan eksplorasi dan produksi minyak hulu (*upstream*) seperti Medco Energi (MEDC) menikmati *operating leverage* instan: biaya pengangkatan (*lifting cost*) relatif tetap, sementara pendapatan melonjak mengikuti harga patokan minyak mentah dunia.

3. **Ancaman Imported Inflation & Respon Bank Sentral**:
   Biaya logistik pelayaran internasional dan premi asuransi kapal tanker melonjak hingga 300%. Kenaikan biaya bahan bakar menular ke rantai pasok pangan dan manufaktur, menahan bank sentral untuk tidak terburu-buru melonggarkan suku bunga acuan.

> **Protokol Risiko Komite**: Hindari mengejar reli spekulatif pada kontrak berjangka minyak dengan *leverage* tinggi saat volatilitas tersirat (*implied volatility*) melonjak ekstrem. Lindung nilai defensif paling terukur tetap berada pada alokasi emas murni dan saham produsen energi dengan rasio kas kuat.`,
    author: 'AI Intelligence Desk (Makro & Geopolitik)',
    readingTimeMinutes: 4,
    publishedAt: new Date(Date.now() - 3600 * 1000 * 12), // 12 jam lalu
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
      const art = { ...article }
      if (art.featuredImage?.url) {
        try {
          const mirror = await mirrorInternetImageToSupabase(art.featuredImage.url, art.slug)
          if (mirror.isMirrored) {
            art.featuredImage = { ...art.featuredImage, url: mirror.url }
          }
        } catch {
          // graceful fallback jika offline
        }
      }
      await saveMarketNews(art)
    }
    console.log(`[NewsAgent] Berhasil memasukkan ${SEED_ARTICLES.length} artikel awal.`)
  }
}

/**
 * Pilih gambar editorial internet terverifikasi (Unsplash CDN direct image URLs)
 * berdasarkan topik, simbol, dan kategori.
 * PENTING: AI dilarang men-generate gambar artifisial, sistem murni mengambil data
 * foto internet asli dan menyimpannya ke database (Supabase / Postgres).
 */
export function resolveInternetPhoto(
  category: string,
  topic: string,
  symbols: string[],
): typeof THEMATIC_IMAGES.ai_datacenter {
  const t = topic.toLowerCase()
  const syms = symbols.map((s) => s.toLowerCase())

  if (
    syms.some((x) => x.includes('nvda') || x.includes('tsm') || x.includes('arm')) ||
    t.includes('chip') ||
    t.includes('semikonduktor')
  ) {
    return THEMATIC_IMAGES.semiconductor
  }
  if (
    syms.some((x) => x.includes('ammn') || x.includes('tembaga') || x.includes('copper')) ||
    t.includes('tembaga') ||
    t.includes('copper') ||
    t.includes('kabel')
  ) {
    return THEMATIC_IMAGES.copper_mining
  }
  if (
    syms.some((x) => x.includes('bbca') || x.includes('bbri') || x.includes('bmri') || x.includes('bbni')) ||
    t.includes('bank') ||
    t.includes('perbankan') ||
    t.includes('kredit') ||
    t.includes('casa')
  ) {
    return THEMATIC_IMAGES.banking_finance
  }
  if (
    syms.some((x) => x.includes('gold') || x.includes('antm')) ||
    t.includes('emas') ||
    t.includes('bullion')
  ) {
    return THEMATIC_IMAGES.gold_commodity
  }
  if (
    syms.some((x) => x.includes('bren') || x.includes('pgeo')) ||
    t.includes('panas bumi') ||
    t.includes('geotermal') ||
    t.includes('terbarukan')
  ) {
    return THEMATIC_IMAGES.geothermal_green
  }
  if (
    syms.some((x) => x.includes('pgas') || x.includes('medc')) ||
    t.includes('minyak') ||
    t.includes('gas') ||
    t.includes('crude oil')
  ) {
    return THEMATIC_IMAGES.oil_energy
  }
  if (
    syms.some((x) => x.includes('pltr')) ||
    t.includes('software') ||
    t.includes('algoritma') ||
    t.includes('model ai')
  ) {
    return THEMATIC_IMAGES.ai_software
  }
  if (
    t.includes('energi') ||
    t.includes('listrik') ||
    t.includes('nuklir')
  ) {
    return THEMATIC_IMAGES.nuclear_energy
  }
  if (
    syms.some((x) => x.includes('btc') || x.includes('eth') || x.includes('sol')) ||
    t.includes('kripto') ||
    t.includes('bitcoin')
  ) {
    return THEMATIC_IMAGES.crypto_bitcoin
  }
  if (
    category === 'saham-idx' ||
    syms.some((x) => x.includes('.jk')) ||
    t.includes('ihsg') ||
    t.includes('bursa')
  ) {
    return THEMATIC_IMAGES.idx_exchange
  }
  if (
    category === 'ekonomi-makro' ||
    t.includes('fed') ||
    t.includes('suku bunga') ||
    t.includes('inflasi')
  ) {
    return THEMATIC_IMAGES.wall_street
  }
  return THEMATIC_IMAGES.ai_datacenter
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

  interface ParsedNewsPayload {
    slug?: string
    title?: string
    summary?: string
    category?: string
    tags?: string[]
    mentionedSymbols?: string[]
    sentiment?: string
    impactScore?: number
    keyTakeaways?: string[]
    contentMarkdown?: string
    author?: string
    readingTimeMinutes?: number
  }

  let parsed: ParsedNewsPayload
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

  // Jamin slug bersih, aman URL, dan ramah SEO
  const rawCandidate = parsed.slug || parsed.title || defaultTopic
  const cleanSlug = slugify(rawCandidate) || `analisis-${Date.now().toString(36)}`

  // 1. Pilih foto internet terverifikasi (resolusi tinggi editorial sesuai topik)
  const featuredImg = { ...resolveInternetPhoto(category, parsed.title || defaultTopic, targetSymbols) }

  // 2. Unduh foto internet & unggah langsung ke Supabase Storage (bucket: 'ai investasi')
  if (featuredImg.url) {
    try {
      console.log(`[NewsAgent] Mengunggah foto internet ke Supabase Storage untuk artikel: ${cleanSlug}...`)
      const mirrorResult = await mirrorInternetImageToSupabase(featuredImg.url, cleanSlug)
      if (mirrorResult.isMirrored) {
        featuredImg.url = mirrorResult.url
        console.log(`[NewsAgent] Foto tersimpan di Supabase Storage: ${featuredImg.url}`)
      }
    } catch (imgErr) {
      console.warn('[NewsAgent] Peringatan unggah foto ke Supabase Storage, menggunakan foto internet asli:', imgErr)
    }
  }

  let videoEmbed = CURATED_YOUTUBE_VIDEOS.ai_power_crisis
  if (category === 'ekonomi-makro' || category === 'crypto-fintech') {
    videoEmbed = CURATED_YOUTUBE_VIDEOS.fed_rate_macro
  } else if (category === 'saham-idx') {
    videoEmbed = CURATED_YOUTUBE_VIDEOS.idx_indonesia_economy
  }

  // 3. Selesai upload foto, baru buat data artikel dan simpan ke database
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
 * Sinkronkan gambar artikel yang sudah ada di database agar juga ter-hosting
 * di Supabase Storage.
 */
export async function syncExistingNewsImagesToSupabase(): Promise<{ updated: number; skipped: number }> {
  const articles = await getMarketNewsList({ limit: 100 })
  let updated = 0
  let skipped = 0

  for (const article of articles) {
    if (article.featuredImage?.url && !article.featuredImage.url.includes('supabase.co')) {
      const res = await mirrorInternetImageToSupabase(article.featuredImage.url, article.slug)
      if (res.isMirrored) {
        await saveMarketNews({
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          category: article.category,
          tags: article.tags,
          mentionedSymbols: article.mentionedSymbols,
          sentiment: article.sentiment,
          impactScore: article.impactScore,
          featuredImage: {
            ...article.featuredImage,
            url: res.url,
          },
          youtubeVideo: article.youtubeVideo,
          keyTakeaways: article.keyTakeaways,
          contentMarkdown: article.contentMarkdown,
          author: article.author,
          readingTimeMinutes: article.readingTimeMinutes,
          publishedAt: article.publishedAt,
        })
        updated++
      } else {
        skipped++
      }
    } else {
      skipped++
    }
  }

  return { updated, skipped }
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

