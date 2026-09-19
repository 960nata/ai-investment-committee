/**
 * Daftar fitur — kontrak antara engine fitur dan engine skor.
 *
 * Tiap fitur harus lolos tiga uji kelayakan sebelum boleh ada di sini:
 *
 * 1. Bisa dihitung ulang persis. Masukan sama menghasilkan keluaran sama,
 *    selamanya.
 * 2. Punya riwayat. Fitur tanpa data historis tidak bisa di-backtest, dan yang
 *    tidak bisa di-backtest tidak boleh masuk skor.
 * 3. Punya alasan ekonomi. Korelasi tanpa penjelasan sebab adalah penambangan
 *    data, dan itulah kenapa tiap entri di bawah membawa satu kalimat alasan.
 *
 * Bidang `direction` sengaja mengizinkan null. Sebagian hubungan memang belum
 * jelas arahnya, dan menebaknya lebih buruk daripada mengakuinya: fitur bertanda
 * null baru boleh masuk skor setelah regresi pada data historis menentukan
 * tandanya sendiri.
 */

export type FeatureGroup =
  | 'tren'
  | 'momentum'
  | 'volatilitas'
  | 'volume'
  | 'struktur'
  | 'relatif'

/**
 * Peran fitur di dalam sistem.
 *
 *   score     ikut dijumlah ke dalam skor
 *   modifier  mengubah bobot atau confidence, tidak pernah menambah arah
 *   display   hanya untuk ditampilkan; tidak pernah masuk perhitungan
 */
export type FeatureRole = 'score' | 'modifier' | 'display'

/**
 * Arah fitur setelah diseragamkan.
 *
 *    1  nilai lebih tinggi berarti lebih baik
 *   -1  nilai lebih rendah berarti lebih baik
 *   null arahnya belum ditetapkan; harus datang dari kalibrasi, bukan dugaan
 */
export type FeatureDirection = 1 | -1 | null

export interface FeatureSpec {
  name: string
  group: FeatureGroup
  role: FeatureRole
  direction: FeatureDirection
  /** Label pendek berbahasa Indonesia untuk ditampilkan ke pembaca. */
  label: string
  /** Satu kalimat alasan ekonomi. Tanpa ini fitur tidak boleh ada di daftar. */
  rationale: string
  /** Disimpan juga sebagai robust z-score dan persentil terhadap riwayat sendiri. */
  normalise: boolean
}

export const FEATURES: FeatureSpec[] = [
  // --- tren ---------------------------------------------------------------
  {
    name: 'sma_20',
    group: 'tren',
    role: 'display',
    direction: null,
    label: 'Rata-rata 20 hari',
    rationale: 'Tingkat harga mentah; hanya berguna ditampilkan, tidak dibandingkan.',
    normalise: false,
  },
  {
    name: 'sma_50',
    group: 'tren',
    role: 'display',
    direction: null,
    label: 'Rata-rata 50 hari',
    rationale: 'Tingkat harga mentah; hanya berguna ditampilkan.',
    normalise: false,
  },
  {
    name: 'sma_200',
    group: 'tren',
    role: 'display',
    direction: null,
    label: 'Rata-rata 200 hari',
    rationale: 'Tingkat harga mentah; hanya berguna ditampilkan.',
    normalise: false,
  },
  {
    name: 'price_vs_sma_20_pct',
    group: 'tren',
    role: 'score',
    direction: null,
    label: 'Harga vs rata-rata 20 hari',
    rationale:
      'Jarak pendek dari rata-rata bisa berarti momentum maupun pembalikan; ' +
      'tandanya harus datang dari kalibrasi.',
    normalise: true,
  },
  {
    name: 'price_vs_sma_50_pct',
    group: 'tren',
    role: 'score',
    direction: 1,
    label: 'Harga vs rata-rata 50 hari',
    rationale: 'Harga di atas rata-rata menengah menandakan tren yang sedang berjalan.',
    normalise: true,
  },
  {
    name: 'price_vs_sma_200_pct',
    group: 'tren',
    role: 'score',
    direction: 1,
    label: 'Harga vs rata-rata 200 hari',
    rationale: 'Pemisah klasik antara pasar naik dan pasar turun untuk satu instrumen.',
    normalise: true,
  },
  {
    name: 'sma_50_slope_pct',
    group: 'tren',
    role: 'score',
    direction: 1,
    label: 'Kemiringan rata-rata 50 hari',
    rationale:
      'Tren bertahan karena aliran dana institusi masuk bertahap selama berminggu-minggu, ' +
      'bukan sekaligus.',
    normalise: true,
  },
  {
    name: 'ma_alignment',
    group: 'tren',
    role: 'score',
    direction: 1,
    label: 'Susunan rata-rata bergerak',
    rationale: 'Susunan rapi menandakan tren yang konsisten di beberapa rentang waktu sekaligus.',
    normalise: false,
  },
  {
    name: 'adx_14',
    group: 'tren',
    role: 'modifier',
    direction: null,
    label: 'Kekuatan tren',
    rationale:
      'Mengukur seberapa berarah pasar, bukan ke arah mana. Dipakai menaikkan atau ' +
      'menurunkan bobot fitur tren.',
    normalise: true,
  },
  {
    name: 'plus_di_14',
    group: 'tren',
    role: 'display',
    direction: null,
    label: 'Tekanan naik',
    rationale: 'Komponen ADX; ditampilkan untuk pembaca yang ingin menelusuri perhitungannya.',
    normalise: false,
  },
  {
    name: 'minus_di_14',
    group: 'tren',
    role: 'display',
    direction: null,
    label: 'Tekanan turun',
    rationale: 'Komponen ADX; ditampilkan untuk penelusuran.',
    normalise: false,
  },

  // --- momentum -----------------------------------------------------------
  {
    name: 'rsi_14',
    group: 'momentum',
    role: 'display',
    direction: null,
    label: 'RSI 14 hari',
    rationale:
      'Tidak monoton terhadap imbal hasil: 30 dan 70 sama-sama ekstrem dengan arti ' +
      'berlawanan, jadi tidak boleh dijumlah langsung.',
    normalise: true,
  },
  {
    name: 'rsi_oversold',
    group: 'momentum',
    role: 'score',
    direction: null,
    label: 'Intensitas jenuh jual',
    rationale:
      'Sisi bawah RSI dipisah menjadi fitur monoton tersendiri; menjumlahkan fitur ' +
      'non-monoton menghasilkan skor yang tidak bermakna.',
    normalise: true,
  },
  {
    name: 'rsi_overbought',
    group: 'momentum',
    role: 'score',
    direction: null,
    label: 'Intensitas jenuh beli',
    rationale: 'Sisi atas RSI, dipisah dengan alasan yang sama.',
    normalise: true,
  },
  {
    name: 'macd_histogram_pct',
    group: 'momentum',
    role: 'score',
    direction: 1,
    label: 'Histogram MACD',
    rationale:
      'Percepatan momentum. Dibagi harga supaya bisa dibandingkan antar-instrumen ' +
      'dengan tingkat harga berbeda.',
    normalise: true,
  },
  {
    name: 'roc_20',
    group: 'momentum',
    role: 'score',
    direction: null,
    label: 'Perubahan 20 hari',
    rationale: 'Rentang sependek ini sering membalik; tandanya harus dari kalibrasi.',
    normalise: true,
  },
  {
    name: 'roc_60',
    group: 'momentum',
    role: 'score',
    direction: 1,
    label: 'Perubahan 60 hari',
    rationale: 'Momentum menengah adalah salah satu anomali paling bertahan lintas pasar.',
    normalise: true,
  },
  {
    name: 'roc_120',
    group: 'momentum',
    role: 'score',
    direction: 1,
    label: 'Perubahan 120 hari',
    rationale: 'Momentum menengah, jendela lebih panjang.',
    normalise: true,
  },
  {
    name: 'momentum_12_1',
    group: 'momentum',
    role: 'score',
    direction: 1,
    label: 'Momentum 12 bulan tanpa bulan terakhir',
    rationale:
      'Versi yang paling konsisten terbukti; bulan terakhir dilewatkan karena efek ' +
      'pembalikan jangka sangat pendek mengacaukannya.',
    normalise: true,
  },

  // --- volatilitas --------------------------------------------------------
  {
    name: 'atr_14_pct',
    group: 'volatilitas',
    role: 'score',
    direction: -1,
    label: 'Rentang harian rata-rata',
    rationale: 'Ukuran risiko; pada tingkat imbal hasil yang sama, yang lebih tenang lebih baik.',
    normalise: true,
  },
  {
    name: 'realized_vol_20',
    group: 'volatilitas',
    role: 'score',
    direction: -1,
    label: 'Volatilitas terealisasi',
    rationale: 'Dihitung dari imbal hasil logaritmik karena nilainya dijumlah antar-waktu.',
    normalise: true,
  },
  {
    name: 'bollinger_width_pct',
    group: 'volatilitas',
    role: 'score',
    direction: null,
    label: 'Lebar pita Bollinger',
    rationale:
      'Pemampatan volatilitas sering mendahului pergerakan besar, tetapi tidak memberi ' +
      'tahu arahnya.',
    normalise: true,
  },
  {
    name: 'percent_b',
    group: 'volatilitas',
    role: 'score',
    direction: null,
    label: 'Posisi dalam pita',
    rationale: 'Sama seperti RSI, ekstrem di kedua sisi punya arti berlawanan.',
    normalise: true,
  },
  {
    name: 'vol_ratio_20_120',
    group: 'volatilitas',
    role: 'modifier',
    direction: null,
    label: 'Rasio volatilitas 20 banding 120',
    rationale:
      'Di atas 1,5 pasar sedang gelisah pada instrumen itu; menurunkan confidence, ' +
      'bukan menentukan arah.',
    normalise: true,
  },

  // --- volume -------------------------------------------------------------
  {
    name: 'volume_relative_20',
    group: 'volume',
    role: 'score',
    direction: null,
    label: 'Volume relatif',
    rationale:
      'Volume besar menguatkan arah yang sedang berjalan, jadi tandanya bergantung pada ' +
      'arah itu, bukan berdiri sendiri.',
    normalise: true,
  },
  {
    name: 'obv_change_20',
    group: 'volume',
    role: 'score',
    direction: 1,
    label: 'Perubahan OBV 20 hari',
    rationale:
      'Kenaikan harga dengan volume di bawah rata-rata berarti sedikit pihak yang ' +
      'benar-benar setuju dengan harga baru itu.',
    normalise: true,
  },
  {
    name: 'adl_change_20',
    group: 'volume',
    role: 'score',
    direction: 1,
    label: 'Perubahan akumulasi–distribusi',
    rationale:
      'Menimbang posisi penutupan di dalam rentang harian, bukan sekadar arah ' +
      'penutupan terhadap hari sebelumnya.',
    normalise: true,
  },
  {
    name: 'vwap_deviation_20_pct',
    group: 'volume',
    role: 'score',
    direction: null,
    label: 'Simpangan terhadap VWAP',
    rationale:
      'Harga jauh di atas rata-rata tertimbang volume bisa berarti kekuatan maupun ' +
      'kelelahan.',
    normalise: true,
  },

  // --- struktur -----------------------------------------------------------
  {
    name: 'distance_from_high_pct',
    group: 'struktur',
    role: 'score',
    direction: 1,
    label: 'Jarak ke tertinggi 52 minggu',
    rationale:
      'Instrumen dekat tertinggi setahun cenderung melanjutkan; salah satu anomali ' +
      'yang paling bertahan lintas pasar dan lintas dekade.',
    normalise: true,
  },
  {
    name: 'distance_from_low_pct',
    group: 'struktur',
    role: 'score',
    direction: null,
    label: 'Jarak dari terendah 52 minggu',
    rationale: 'Bisa berarti pemulihan maupun sekadar pantulan sementara.',
    normalise: true,
  },
  {
    name: 'position_in_range',
    group: 'struktur',
    role: 'score',
    direction: 1,
    label: 'Posisi dalam rentang setahun',
    rationale: 'Bentuk ternormalisasi dari jarak ke tertinggi dan terendah.',
    normalise: true,
  },
  {
    name: 'pivot_position',
    group: 'struktur',
    role: 'score',
    direction: null,
    label: 'Posisi terhadap level pivot',
    rationale: 'Level pivot banyak dipakai pelaku pasar, tetapi arah tembusnya tidak tetap.',
    normalise: true,
  },

  // --- relatif ------------------------------------------------------------
  {
    name: 'relative_strength_20',
    group: 'relatif',
    role: 'score',
    direction: 1,
    label: 'Kekuatan relatif 20 hari',
    rationale:
      'Naik 5% saat pasar naik 8% sebenarnya sedang tertinggal; tanpa fitur ini ' +
      'perbedaan itu tidak terlihat sama sekali.',
    normalise: true,
  },
  {
    name: 'relative_strength_60',
    group: 'relatif',
    role: 'score',
    direction: 1,
    label: 'Kekuatan relatif 60 hari',
    rationale: 'Sama, pada rentang yang lebih panjang.',
    normalise: true,
  },
]

const BY_NAME = new Map(FEATURES.map((f) => [f.name, f]))

export function featureSpec(name: string): FeatureSpec | undefined {
  return BY_NAME.get(name)
}

export function featuresByRole(role: FeatureRole): FeatureSpec[] {
  return FEATURES.filter((f) => f.role === role)
}

export function normalisedFeatureNames(): string[] {
  return FEATURES.filter((f) => f.normalise).map((f) => f.name)
}

/**
 * Terapkan arah supaya nilai lebih tinggi selalu berarti lebih baik.
 *
 * Fitur yang arahnya belum ditetapkan dikembalikan sebagai null, bukan nol.
 * Nol akan terbaca sebagai "netral", padahal yang sebenarnya terjadi adalah
 * sistem belum tahu tanda mana yang benar.
 */
export function applyDirection(name: string, z: number | null): number | null {
  if (z === null) return null
  const spec = BY_NAME.get(name)
  if (!spec || spec.direction === null) return null
  return z * spec.direction
}
