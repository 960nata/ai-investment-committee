/**
 * Pengujian engine fitur.
 *
 *   npm test
 *
 * Engine fitur adalah satu-satunya bagian sistem yang angkanya masuk ke skor,
 * jadi ia yang paling pantas diuji. Dua jenis pemeriksaan dipakai di sini:
 *
 * 1. Nilai acuan, dihitung terpisah di luar kode ini. Kalau rumusnya bergeser,
 *    angkanya tidak akan cocok lagi.
 * 2. Sifat yang harus selalu benar, terutama ketiadaan look-ahead. Yang terakhir
 *    lebih berharga daripada semua nilai acuan digabung: fitur yang diam-diam
 *    melihat ke depan membuat backtest tampak jauh lebih pintar daripada
 *    kenyataannya, dan kesalahan itu tidak pernah muncul sebagai error.
 */

import {
  adx,
  atr,
  bollinger,
  ema,
  logReturns,
  maxDrawdown,
  momentum12m1m,
  realizedVolatility,
  relativeStrength,
  rollingPercentile,
  rollingRobustZ,
  rsi,
  sma,
  winsorize,
  type MaybeSeries,
} from '../lib/features/indicators'
import { computeFeatures, FEATURE_SET_VERSION } from '../lib/features/compute'
import { FEATURES, normalisedFeatureNames } from '../lib/features/registry'

// ---------------------------------------------------------------------------
// Kerangka uji minimal
// ---------------------------------------------------------------------------

let passed = 0
const failures: string[] = []

function test(name: string, body: () => void): void {
  try {
    body()
    passed++
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Ditulis sebagai fungsi penegasan TypeScript, bukan pemeriksa boolean biasa.
 * Dengan begitu pemeriksa tipe ikut mempersempit tipe setelah pemanggilan, dan
 * uji bisa langsung membaca bidang yang hanya ada di cabang tertentu.
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number | null, expected: number, tolerance = 1e-5): void {
  if (actual === null) throw new Error(`diharapkan ${expected}, dapat null`)
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`diharapkan ${expected}, dapat ${actual} (selisih ${actual - expected})`)
  }
}

function assertNulls(series: MaybeSeries, upToExclusive: number, label: string): void {
  for (let i = 0; i < upToExclusive; i++) {
    assert(series[i] === null, `${label}: indeks ${i} seharusnya null, dapat ${series[i]}`)
  }
  assert(
    series[upToExclusive] !== null,
    `${label}: indeks ${upToExclusive} seharusnya terisi, dapat null`,
  )
}

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

/** Deret penutupan yang dipakai di banyak buku teks indikator. */
const CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
  46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35,
  44.03, 44.18, 44.22, 44.57,
]

const HIGHS = CLOSES.map((c) => c + 0.5)
const LOWS = CLOSES.map((c) => c - 0.5)

/** Deret panjang dan bergerigi, untuk menguji sifat pada data yang realistis. */
function syntheticSeries(length: number) {
  const close: number[] = []
  const high: number[] = []
  const low: number[] = []
  const open: number[] = []
  const volume: number[] = []
  const date: string[] = []

  // Deret semu-acak deterministik: pengujian tidak boleh berubah hasilnya
  // antar-jalan, jadi tidak ada Math.random di sini.
  let seed = 12345
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  let price = 100
  const start = Date.UTC(2023, 0, 1)

  for (let i = 0; i < length; i++) {
    const drift = (next() - 0.48) * 3
    price = Math.max(1, price * (1 + drift / 100))
    const spread = price * 0.01 * (0.5 + next())

    open.push(price * (1 + (next() - 0.5) / 200))
    high.push(price + spread)
    low.push(Math.max(0.5, price - spread))
    close.push(price)
    volume.push(1_000_000 * (0.4 + next() * 1.6))
    date.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10))
  }

  return { date, open, high, low, close, volume }
}

// ---------------------------------------------------------------------------
// Nilai acuan
// ---------------------------------------------------------------------------

test('sma menghitung rata-rata dan memberi null sebelum periode penuh', () => {
  const result = sma([1, 2, 3, 4, 5], 3)
  assertNulls(result, 2, 'sma')
  near(result[2], 2)
  near(result[3], 3)
  near(result[4], 4)
  assert(result.length === 5, 'panjang keluaran harus sama dengan masukan')
})

test('sma deret konstan mengembalikan konstanta itu', () => {
  const result = sma(new Array(50).fill(7), 20)
  near(result[49], 7)
})

test('ema cocok dengan nilai acuan', () => {
  const result = ema(CLOSES, 10)
  assertNulls(result, 9, 'ema')
  near(result[9], 44.779, 1e-3)
  near(result[29], 44.999461, 1e-3)
})

test('rsi cocok dengan nilai acuan Wilder', () => {
  const result = rsi(CLOSES, 14)
  assertNulls(result, 14, 'rsi')
  near(result[14], 70.464135, 1e-4)
  near(result[15], 66.249619, 1e-4)
  near(result[29], 45.499497, 1e-4)
})

test('rsi mencapai 100 saat tidak pernah turun dan 0 saat tidak pernah naik', () => {
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i)
  const falling = Array.from({ length: 40 }, (_, i) => 140 - i)
  near(rsi(rising, 14)[39], 100, 1e-9)
  near(rsi(falling, 14)[39], 0, 1e-9)
})

test('rsi tidak pernah keluar dari rentang 0..100', () => {
  const series = syntheticSeries(600)
  for (const value of rsi(series.close, 14)) {
    if (value === null) continue
    assert(value >= 0 && value <= 100, `rsi di luar rentang: ${value}`)
  }
})

test('atr cocok dengan nilai acuan', () => {
  const result = atr(HIGHS, LOWS, CLOSES, 14)
  assertNulls(result, 14, 'atr')
  near(result[14], 1.030714, 1e-4)
  near(result[29], 1.083364, 1e-4)
})

test('lebar bollinger nol pada deret konstan', () => {
  const result = bollinger(new Array(40).fill(50), 20, 2)
  near(result.widthPct[39], 0, 1e-9)
  near(result.middle[39], 50)
})

test('maxDrawdown nol pada deret yang selalu naik', () => {
  near(maxDrawdown([1, 2, 3, 4, 5]), 0, 1e-12)
})

test('maxDrawdown menangkap penurunan terdalam, bukan yang terakhir', () => {
  // Turun 50% dari 100 ke 50, lalu pulih, lalu turun 20% dari 120 ke 96.
  near(maxDrawdown([100, 50, 120, 96]), -0.5, 1e-12)
})

test('kekuatan relatif terhadap diri sendiri selalu nol', () => {
  const series = syntheticSeries(200)
  const result = relativeStrength(series.close, series.close, 20)
  for (const value of result) {
    if (value === null) continue
    near(value, 0, 1e-9)
  }
})

test('persentil bergulir berada di rentang 0..1 dan menandai nilai tertinggi', () => {
  const rising = Array.from({ length: 120 }, (_, i) => i)
  const result = rollingPercentile(rising, 100)

  for (const value of result) {
    if (value === null) continue
    assert(value >= 0 && value <= 1, `persentil di luar rentang: ${value}`)
  }
  // Nilai terakhir adalah yang tertinggi sejauh ini, jadi persentilnya penuh.
  near(result[119], 1, 1e-12)
})

// ---------------------------------------------------------------------------
// Sifat: tidak ada look-ahead
// ---------------------------------------------------------------------------

test('persentil bergulir tidak melihat ke depan', () => {
  const series = syntheticSeries(400)
  const full = rollingPercentile(series.close, 200)
  const prefix = rollingPercentile(series.close.slice(0, 250), 200)

  for (let i = 0; i < prefix.length; i++) {
    assert(
      full[i] === prefix[i],
      `persentil indeks ${i} berubah saat data masa depan ditambahkan: ` +
        `${prefix[i]} menjadi ${full[i]}`,
    )
  }
})

test('seluruh set fitur tidak berubah saat data masa depan ditambahkan', () => {
  const series = syntheticSeries(900)
  const cut = 600

  const full = computeFeatures({ market: 'CRYPTO', series })
  const prefix = computeFeatures({
    market: 'CRYPTO',
    series: {
      date: series.date.slice(0, cut),
      open: series.open.slice(0, cut),
      high: series.high.slice(0, cut),
      low: series.low.slice(0, cut),
      close: series.close.slice(0, cut),
      volume: series.volume.slice(0, cut),
    },
  })

  assert(prefix.rows.length > 100, 'deret potongan harus menghasilkan cukup baris untuk diuji')

  const fullByDate = new Map(full.rows.map((r) => [r.date, r.values]))

  for (const row of prefix.rows) {
    const later = fullByDate.get(row.date)
    assert(later !== undefined, `tanggal ${row.date} hilang dari hitungan deret penuh`)

    for (const [name, value] of Object.entries(row.values)) {
      assert(
        value === later![name],
        `fitur "${name}" pada ${row.date} berubah setelah data masa depan masuk: ` +
          `${value} menjadi ${later![name]} — ini look-ahead bias`,
      )
    }
  }
})

// ---------------------------------------------------------------------------
// Bentuk keluaran
// ---------------------------------------------------------------------------

test('computeFeatures menandai versinya dan melewati riwayat yang terlalu pendek', () => {
  const short = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(40) })
  assert(short.rows.length === 0, 'riwayat 40 hari seharusnya belum menghasilkan baris')

  const enough = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(300) })
  assert(enough.featureSetVersion === FEATURE_SET_VERSION, 'versi set fitur harus ikut dikirim')
  assert(enough.rows.length === 300 - 59, `jumlah baris tak terduga: ${enough.rows.length}`)
})

test('tanpa tolok ukur, kekuatan relatif berisi null dan bukan nol', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(300) })
  const last = result.rows.at(-1)!

  assert(
    last.values.relative_strength_20 === null,
    'tanpa tolok ukur nilainya harus null; nol akan terbaca sebagai "setara pasar"',
  )
  assert(
    result.unavailable.includes('relative_strength_20'),
    'fitur yang tidak bisa dihitung harus dilaporkan sebagai tidak tersedia',
  )
})

test('dengan tolok ukur, kekuatan relatif terisi', () => {
  const series = syntheticSeries(300)
  const benchmark = syntheticSeries(300).close

  const result = computeFeatures({ market: 'CRYPTO', series, benchmarkClose: benchmark })
  const last = result.rows.at(-1)!

  assert(
    typeof last.values.relative_strength_20 === 'number',
    'kekuatan relatif seharusnya terisi saat tolok ukur tersedia',
  )
  assert(
    !result.unavailable.includes('relative_strength_20'),
    'kekuatan relatif tidak boleh dilaporkan tidak tersedia',
  )
})

test('tiap fitur berpersentil punya pasangan persentilnya', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(900) })
  const last = result.rows.at(-1)!

  for (const name of ['rsi_14', 'atr_14_pct', 'volume_relative_20', 'roc_60']) {
    assert(`${name}_pctile` in last.values, `persentil untuk ${name} tidak ada`)
    const value = last.values[`${name}_pctile`]
    assert(
      value !== null && value >= 0 && value <= 1,
      `persentil ${name} di luar rentang: ${value}`,
    )
  }
})

test('tidak ada NaN atau Infinity yang lolos ke baris fitur', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(500) })
  for (const row of result.rows) {
    for (const [name, value] of Object.entries(row.values)) {
      assert(
        value === null || Number.isFinite(value),
        `nilai tidak terhingga pada ${name} tanggal ${row.date}: ${value}`,
      )
    }
  }
})

test('volume nol tidak menghasilkan pembagian nol', () => {
  const series = syntheticSeries(300)
  const zeroVolume = { ...series, volume: new Array(300).fill(0) }

  const result = computeFeatures({ market: 'CRYPTO', series: zeroVolume })
  const last = result.rows.at(-1)!

  assert(last.values.volume_relative_20 === null, 'volume relatif harus null, bukan Infinity')
  assert(last.values.vwap_deviation_20_pct === null, 'simpangan VWAP harus null')
})

// ---------------------------------------------------------------------------
// Indikator tambahan
// ---------------------------------------------------------------------------

test('adx dan indikator arah cocok dengan nilai acuan', () => {
  const result = adx(HIGHS, LOWS, CLOSES, 14)

  near(result.plusDi[14], 23.146223, 1e-4)
  near(result.minusDi[14], 9.70201, 1e-4)
  near(result.plusDi[29], 16.958268, 1e-4)
  near(result.minusDi[29], 20.313063, 1e-4)

  // ADX adalah penghalusan atas 14 nilai DX, dan DX sendiri baru ada di indeks
  // 14, jadi nilai ADX pertama jatuh di indeks 27.
  assert(result.adx[26] === null, 'adx seharusnya belum terisi di indeks 26')
  assert(result.adx[27] !== null, 'adx seharusnya sudah terisi di indeks 27')
  near(result.adx[29], 22.009172, 1e-4)
})

test('adx tidak pernah negatif dan berhenti di 100', () => {
  const series = syntheticSeries(600)
  const result = adx(series.high, series.low, series.close, 14)
  for (const value of result.adx) {
    if (value === null) continue
    assert(value >= 0 && value <= 100, `adx di luar rentang: ${value}`)
  }
})

test('imbal hasil logaritmik bersifat aditif antar-waktu', () => {
  const values = [100, 110, 99, 123.75]
  const lr = logReturns(values)

  const total = (lr[1] ?? 0) + (lr[2] ?? 0) + (lr[3] ?? 0)
  near(total, Math.log(values[3] / values[0]), 1e-12)
})

test('volatilitas terealisasi memakai imbal hasil logaritmik', () => {
  near(realizedVolatility(CLOSES, 20, 252)[29], 0.176416, 1e-5)
  near(realizedVolatility(CLOSES, 20, 365)[29], 0.212317, 1e-5)
})

test('pita bollinger dan %b cocok dengan nilai acuan', () => {
  const result = bollinger(CLOSES, 20, 2)
  near(result.percentB[29], 0.142969, 1e-5)
  near(result.widthPct[29], 6.668313, 1e-5)
})

test('momentum 12-1 melewatkan bulan terakhir', () => {
  // Harga naik mantap lalu jatuh di dua puluh hari terakhir. Momentum 12-1
  // harus mengabaikan kejatuhan itu; itulah gunanya melewatkan satu bulan.
  const values: number[] = []
  for (let i = 0; i < 300; i++) values.push(100 * (1 + i / 1000))
  for (let i = 280; i < 300; i++) values[i] = 50

  const result = momentum12m1m(values, 21, 252)
  const value = result[299]

  assert(value !== null, 'momentum 12-1 seharusnya terisi pada indeks 299')
  assert(value! > 0, `kejatuhan bulan terakhir seharusnya diabaikan, dapat ${value}`)
  assert(result[251] === null, 'belum boleh terisi sebelum 252 hari riwayat')
})

test('robust z-score bergulir cocok dengan nilai acuan', () => {
  // Jendela 30 atas deret 30 titik: hanya titik terakhir yang punya sampel penuh.
  const result = rollingRobustZ([...CLOSES], 30)
  near(result[29], -1.296195, 1e-5)
  assert(result[28] === null, 'sampel belum cukup di indeks 28')
})

test('robust z-score dipangkas di tiga simpangan', () => {
  const values: (number | null)[] = Array.from({ length: 79 }, (_, i) => i + 1)
  values.push(10_000)

  const result = rollingRobustZ(values, 80)
  near(result[79], 3, 1e-12)
})

test('robust z-score nol saat seluruh populasi bernilai sama', () => {
  const result = rollingRobustZ(new Array(80).fill(42), 80)
  near(result[79], 0, 1e-12)
})

test('pencilan tunggal di populasi seragam tetap ditandai ekstrem', () => {
  // MAD bernilai nol di sini, tetapi nilai terakhir jelas menyimpang. Jawaban
  // nol akan menyembunyikan justru pencilan yang paling perlu terlihat.
  const values: (number | null)[] = new Array(79).fill(10)
  values.push(10_000)

  near(rollingRobustZ(values, 80)[79], 3, 1e-12)
})

test('winsorisasi memangkas pencilan tanpa membuang barisnya', () => {
  const values = [...Array.from({ length: 98 }, (_, i) => i + 1), -9999, 9999]
  const result = winsorize(values, 0.01, 0.99)

  assert(result.length === values.length, 'jumlah baris tidak boleh berubah')
  assert(Math.max(...result) < 9999, 'pencilan atas seharusnya terpangkas')
  assert(Math.min(...result) > -9999, 'pencilan bawah seharusnya terpangkas')
  assert(result[49] === values[49], 'nilai di tengah tidak boleh tersentuh')
})

// ---------------------------------------------------------------------------
// Penyesuaian aksi korporasi
// ---------------------------------------------------------------------------

test('stock split tanpa penyesuaian terbaca sebagai kejatuhan harga', () => {
  const split = splitSeries()

  const unadjusted = computeFeatures({
    market: 'CRYPTO',
    series: { ...split.series, adjClose: undefined },
  })
  const row = unadjusted.rows.find((r) => r.date === split.dateAfterSplit)!

  assert(unadjusted.priceAdjusted === false, 'seharusnya dilaporkan belum disesuaikan')
  assert(
    row.values.roc_20! < -40,
    `tanpa penyesuaian, split 1:2 harus tampak seperti kejatuhan besar, dapat ${row.values.roc_20}`,
  )
})

test('harga tersesuaikan menghapus lompatan semu akibat split', () => {
  const split = splitSeries()

  const adjusted = computeFeatures({ market: 'CRYPTO', series: split.series })
  const row = adjusted.rows.find((r) => r.date === split.dateAfterSplit)!

  assert(adjusted.priceAdjusted === true, 'seharusnya dilaporkan sudah disesuaikan')
  assert(
    Math.abs(row.values.roc_20!) < 10,
    `setelah disesuaikan tidak boleh ada kejatuhan semu, dapat ${row.values.roc_20}`,
  )
})

/**
 * Deret dengan stock split 1:2 di indeks 200: harga kuotasi terbelah dua,
 * sementara penutupan tersesuaikan menyatakan seluruh riwayat dalam satuan
 * setelah split sehingga tetap bersambung.
 */
function splitSeries() {
  const base = syntheticSeries(300)
  const splitAt = 200

  const close = base.close.map((p, i) => (i < splitAt ? p : p / 2))
  const adjClose = base.close.map((p) => p / 2)

  return {
    dateAfterSplit: base.date[splitAt + 5],
    series: {
      date: base.date,
      open: close.map((p) => p * 0.999),
      high: close.map((p) => p * 1.01),
      low: close.map((p) => p * 0.99),
      close,
      volume: base.volume,
      adjClose,
    },
  }
}

// ---------------------------------------------------------------------------
// Kontrak dengan daftar fitur
// ---------------------------------------------------------------------------

test('tiap fitur di daftar benar-benar dihasilkan engine', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(900) })
  const produced = new Set(Object.keys(result.rows.at(-1)!.values))

  for (const spec of FEATURES) {
    assert(produced.has(spec.name), `fitur "${spec.name}" ada di daftar tapi tidak dihasilkan`)
  }
})

test('tiap fitur ternormalisasi punya pasangan z-score dan persentil', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(900) })
  const values = result.rows.at(-1)!.values

  for (const name of normalisedFeatureNames()) {
    assert(`${name}_z` in values, `z-score untuk ${name} tidak ada`)
    assert(`${name}_pctile` in values, `persentil untuk ${name} tidak ada`)

    const z = values[`${name}_z`]
    if (z !== null) {
      assert(z >= -3 && z <= 3, `z-score ${name} di luar batas pemangkasan: ${z}`)
    }
  }
})

test('tiap fitur di daftar membawa alasan ekonominya', () => {
  for (const spec of FEATURES) {
    assert(
      spec.rationale.trim().length > 20,
      `fitur "${spec.name}" tidak punya alasan ekonomi yang berarti`,
    )
  }
})

test('sisi RSI dipecah jadi dua fitur yang keduanya monoton', () => {
  const result = computeFeatures({ market: 'CRYPTO', series: syntheticSeries(400) })

  for (const row of result.rows) {
    const rsiValue = row.values.rsi_14
    const oversold = row.values.rsi_oversold
    const overbought = row.values.rsi_overbought
    if (rsiValue === null) continue

    assert(oversold! >= 0 && overbought! >= 0, 'kedua sisi tidak boleh negatif')
    assert(
      oversold === 0 || overbought === 0,
      `hanya satu sisi boleh aktif pada RSI ${rsiValue}`,
    )
    near(oversold! + overbought!, Math.abs(rsiValue - 50) / 50, 1e-6)
  }
})

test('histogram MACD tidak berubah saat seluruh harga dikali dua', () => {
  const base = syntheticSeries(400)
  const doubled = {
    ...base,
    open: base.open.map((v) => v * 2),
    high: base.high.map((v) => v * 2),
    low: base.low.map((v) => v * 2),
    close: base.close.map((v) => v * 2),
  }

  const a = computeFeatures({ market: 'CRYPTO', series: base }).rows.at(-1)!
  const b = computeFeatures({ market: 'CRYPTO', series: doubled }).rows.at(-1)!

  // Inilah gunanya membagi histogram dengan harga: tanpa itu, instrumen mahal
  // dan instrumen murah tidak bisa masuk ke satu skor yang sama.
  near(b.values.macd_histogram_pct, a.values.macd_histogram_pct!, 1e-6)
})

test('menjalankan ulang atas data yang sama menghasilkan baris identik', () => {
  const series = syntheticSeries(500)
  const first = computeFeatures({ market: 'CRYPTO', series })
  const second = computeFeatures({ market: 'CRYPTO', series })

  assert(
    JSON.stringify(first.rows) === JSON.stringify(second.rows),
    'hasil harus identik bit-per-bit antar-jalan',
  )
})

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} uji gagal:\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}\n`)
  console.error(`${passed} lolos, ${failures.length} gagal\n`)
  process.exit(1)
}

console.log(`\n${passed} uji lolos.\n`)
