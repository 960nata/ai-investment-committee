/**
 * Job perhitungan fitur.
 *
 * Membaca `candle_daily`, menghitung seluruh set fitur, menulis `feature_daily`.
 * Tabel candle tidak pernah disentuh: fakta mentah dan hasil turunan dipisah
 * total, dan seluruh isi `feature_daily` selalu boleh dibuang lalu dihitung
 * ulang dari nol.
 */

import {
  getCandles,
  getFundamentalsAsOf,
  getInstrumentBySymbol,
  listInstruments,
  upsertFeatures,
  type FeatureInput,
  type InstrumentView,
} from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { getOwnershipAsOf } from '@/lib/db/ownership-queries'
import { macroRange } from '@/lib/db/macro-queries'
import { COT_CONTRACTS, TFF_CONTRACTS } from '@/lib/external/sources'
import { describeError } from '@/lib/http/errors'
import type { MaybeSeries, OhlcvSeries } from './indicators'
import { computeFeatures, MIN_CANDLES_FOR_FEATURES } from './compute'

/**
 * Riwayat yang dimuat tiap kali job berjalan.
 *
 * Harus menutup jendela persentil dua tahun ditambah pemanasan indikator
 * terpanjang, yaitu rata-rata bergerak 200 hari. Memuat lebih sedikit membuat
 * persentil dihitung dari jendela yang pendek diam-diam.
 */
const LOOKBACK_DAYS = 1100

/**
 * Hanya beberapa hari terakhir yang ditulis ulang tiap kali job jalan.
 *
 * Nilai fitur hari-hari lama tidak pernah berubah ketika data baru masuk — sifat
 * itu diuji di `scripts/test-features.ts` dan merupakan syarat agar backtest
 * jujur. Karena tidak berubah, menulisnya ulang setiap jam hanya membakar kuota
 * basis data tanpa mengubah satu angka pun.
 */
const WRITE_WINDOW_DAYS = 7

/**
 * Tolok ukur tiap instrumen.
 *
 * Indeks tercatat di pasar `global`, bukan di pasar saham yang diwakilinya:
 * pasar menunjukkan kalender perdagangan, dan indeks dunia tidak terikat satu
 * bursa saham mana pun. Karena itu tolok ukurnya membawa pasarnya sendiri, dan
 * pencariannya tidak boleh dilakukan di pasar instrumen yang sedang dihitung.
 *
 * Dipilih per instrumen, bukan per pasar: pasar `global` memuat saham Tokyo,
 * indeks dunia, dan minyak sekaligus, dan satu tolok ukur untuk ketiganya tidak
 * menjawab pertanyaan apa pun. Dulu pasar itu tidak diberi tolok ukur sama
 * sekali, dan kelompok "kekuatan relatif" kosong untuk seluruh isinya.
 */
type Benchmark = { kind: 'symbol'; symbol: string; market: MarketCode } | { kind: 'komoditi' }

/** Saham global dibandingkan terhadap indeks bursanya sendiri, dikenali dari akhiran simbol. */
const EXCHANGE_INDEX: Record<string, string> = {
  '.T': '^N225',
  '.HK': '^HSI',
  '.KS': '^KS11',
  '.TW': '^TWII',
  '.SS': '000001.SS',
  '.L': '^FTSE',
  '.DE': '^GDAXI',
  '.PA': '^FCHI',
  '.AS': '^STOXX50E',
  '.MI': '^STOXX50E',
  '.SW': '^STOXX50E',
  '.AX': '^AXJO',
  '.NS': '^NSEI',
  '.SI': '^STI',
}

function benchmarkFor(instrument: InstrumentView, market: MarketCode): Benchmark | null {
  // Hampir seluruh crypto bergerak mengikuti Bitcoin; tanpa membandingkan
  // terhadapnya, "naik 8% minggu ini" tidak memberi tahu apa pun.
  if (market === 'CRYPTO') {
    return instrument.symbol === 'BTCUSDT' ? null : { kind: 'symbol', symbol: 'BTCUSDT', market: 'CRYPTO' }
  }
  // Saham dibandingkan terhadap indeks pasarnya sendiri: naik 5% saat pasar
  // naik 8% sebenarnya sedang tertinggal, dan tanpa fitur ini itu tidak terlihat.
  if (market === 'IDX') return { kind: 'symbol', symbol: '^JKSE', market: 'GLOBAL' }
  if (market === 'US') return { kind: 'symbol', symbol: '^GSPC', market: 'GLOBAL' }

  switch (instrument.assetClass) {
    case 'saham': {
      const suffix = Object.keys(EXCHANGE_INDEX).find((s) => instrument.symbol.endsWith(s))
      return suffix ? { kind: 'symbol', symbol: EXCHANGE_INDEX[suffix], market: 'GLOBAL' } : null
    }
    // Indeks dunia terhadap S&P 500, pasar terbesar yang ikut menggerakkan
    // yang lain; S&P 500 sendiri terhadap Euro Stoxx 50.
    case 'indeks':
      return instrument.symbol === '^GSPC'
        ? { kind: 'symbol', symbol: '^STOXX50E', market: 'GLOBAL' }
        : { kind: 'symbol', symbol: '^GSPC', market: 'GLOBAL' }
    // Komoditas tidak punya satu indeks induk yang tercatat di sini. Yang
    // dipakai keranjang berbobot sama dari seluruh komoditas yang dilacak:
    // minyak yang naik 3% saat keranjangnya naik 5% sedang tertinggal.
    case 'komoditi':
    case 'emas':
      return { kind: 'komoditi' }
    default:
      return null
  }
}

export interface FeatureJobResult {
  itemsProcessed: number
  itemsFailed: number
  rowsWritten: number
  skipped: { symbol: string; reason: string }[]
  errors: string[]
}

export interface FeatureJobInput {
  symbols: string[]
  market: MarketCode
  /**
   * Tulis baris mulai tanggal ini. Dikosongkan berarti hanya beberapa hari
   * terakhir; diisi tanggal jauh di belakang berarti mengisi ulang riwayat.
   */
  writeFrom?: string
}

/**
 * Pemanasan yang harus ada sebelum tanggal tulis paling awal.
 *
 * Jendela persentil dua tahun ditambah rata-rata bergerak dua ratus hari.
 * Tanpa pemanasan sepanjang ini, baris pertama dihitung dari jendela yang
 * pendek diam-diam, dan nilainya tidak sebanding dengan baris sesudahnya.
 */
const WARMUP_DAYS = 1000

/**
 * Riwayat lama disimpan mingguan, bukan harian.
 *
 * Tier gratis memberi setengah gigabyte, dan satu baris fitur memakan sekitar
 * dua kilobyte. Sebelas tahun harian untuk seratus emiten saja sudah melewati
 * batas itu sendirian.
 *
 * Yang hilang hampir tidak ada. Untuk horizon lima, enam puluh tiga, dan dua
 * ratus lima puluh dua hari, pengamatan harian saling tumpang tindih di atas
 * sembilan puluh persen — itu sebabnya jumlah pengamatan bebas dihitung dengan
 * membagi rentang waktunya. Menyimpan setiap hari berarti membayar sepuluh kali
 * lipat ruang untuk informasi yang praktis sama.
 *
 * Angkanya dinaikkan dari lima ke sepuluh setelah diukur: sebelas tahun riwayat
 * untuk tiga ratus instrumen pada jarak lima hari saja sudah melewati batas
 * setengah gigabyte, dan basis data yang penuh menghentikan seluruh penulisan,
 * bukan hanya yang terakhir.
 */
const HISTORY_STRIDE = 10

/** Hari terakhir yang tetap disimpan harian, karena inilah yang dilihat orang. */
const DENSE_WINDOW_DAYS = 120

export async function runFeatureJob(input: FeatureJobInput): Promise<FeatureJobResult> {
  const { symbols, market } = input
  const result: FeatureJobResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    rowsWritten: 0,
    skipped: [],
    errors: [],
  }

  const to = isoDaysAgo(0)
  const writeFrom = input.writeFrom ?? isoDaysAgo(WRITE_WINDOW_DAYS)

  // Riwayat yang dimuat mengikuti tanggal tulis paling awal, bukan angka tetap.
  // Mengisi ulang sepuluh tahun dengan jendela muat tiga tahun akan diam-diam
  // menghasilkan tujuh tahun baris kosong, dan itu terlihat seperti data yang
  // memang tidak ada.
  const earliest = new Date(`${writeFrom}T00:00:00Z`).getTime() - WARMUP_DAYS * 86_400_000
  const from = new Date(Math.min(earliest, Date.now() - LOOKBACK_DAYS * 86_400_000))
    .toISOString()
    .slice(0, 10)

  // Tolok ukur dimuat sekali per batch untuk tiap tolok ukur yang dipakai,
  // bukan sekali per simbol.
  const benchmarks = new Map<string, Promise<Map<string, number> | null>>()
  // Deret pasar (Fear & Greed, VIX) sama untuk seluruh batch.
  const shared = new Map<string, Promise<Map<string, number>>>()
  const sharedSeries = (key: string, load: () => Promise<Map<string, number>>) => {
    if (!shared.has(key)) shared.set(key, load().catch(() => new Map()))
    return shared.get(key)!
  }
  const benchmarkSeries = (b: Benchmark) => {
    const key = b.kind === 'komoditi' ? 'komoditi' : b.symbol
    if (!benchmarks.has(key)) benchmarks.set(key, loadBenchmark(b, from, to))
    return benchmarks.get(key)!
  }

  for (const symbol of symbols) {
    try {
      const instrument = await getInstrumentBySymbol(market, symbol)
      if (!instrument) {
        result.skipped.push({ symbol, reason: 'instrumen belum terdaftar' })
        continue
      }

      const candles = await getCandles(instrument.id, from, to)
      if (candles.length < MIN_CANDLES_FOR_FEATURES) {
        result.skipped.push({
          symbol,
          reason: `riwayat ${candles.length} hari, minimum ${MIN_CANDLES_FOR_FEATURES}`,
        })
        result.itemsProcessed++
        continue
      }

      // Penutupan tersesuaikan hanya disertakan bila memang sudah terisi.
      // Mengirim deret berisi null akan membuat engine mengira harga sudah
      // disesuaikan padahal belum.
      const hasAdjusted = candles.every((c) => c.adjClose !== null)

      const series: OhlcvSeries = {
        date: candles.map((c) => c.date),
        open: candles.map((c) => Number(c.open)),
        high: candles.map((c) => Number(c.high)),
        low: candles.map((c) => Number(c.low)),
        close: candles.map((c) => Number(c.close)),
        volume: candles.map((c) => Number(c.volume)),
        adjClose: hasAdjusted ? candles.map((c) => Number(c.adjClose)) : undefined,
      }

      // Tolok ukur disejajarkan menurut tanggal, bukan menurut posisi. Dua deret
      // bisa punya jumlah baris berbeda kalau satu sumber melewatkan satu hari,
      // dan menyejajarkannya per posisi akan menggeser seluruh riwayat.
      const benchmark = benchmarkFor(instrument, market)
      const benchmarkByDate = benchmark ? await benchmarkSeries(benchmark) : null
      // Dibawa maju sampai lima hari: bursa punya hari libur berbeda (S&P 500
      // tutup saat Nikkei buka), dan candle tolok ukur hari ini sering belum
      // masuk saat instrumennya sudah. Tanpa ini baris terbaru kehilangan
      // kekuatan relatifnya justru pada hari yang dilihat orang.
      const benchmarkClose: MaybeSeries | undefined = benchmarkByDate
        ? alignForward(series.date, benchmarkByDate, 5)
        : undefined

      // Seluruh laporan yang pernah terbit ditarik sekali, lalu engine fitur
      // memilih per tanggal mana yang sudah tersedia saat itu. Satu kueri per
      // hari akan berarti ratusan perjalanan bolak-balik untuk satu instrumen.
      const fundamentals = await getFundamentalsAsOf(instrument.id, to, 80)

      // KSEI hanya mencatat efek di bursa Indonesia; pasar lain tidak ditanya
      // sama sekali, supaya tidak ada kueri yang pasti kosong di tiap instrumen.
      const ownership = market === 'IDX' ? await getOwnershipAsOf(instrument.id, to) : undefined

      // Yahoo mengutip saham London dalam pence, sedangkan instrumennya
      // dicatat GBP. Laporan keuangannya dalam pound.
      const priceCurrency = instrument.symbol.endsWith('.L') && instrument.currency === 'GBP' ? 'GBp' : instrument.currency

      const external = await externalFor(instrument, market, series.date, from, to, sharedSeries)

      const computed = computeFeatures({
        market,
        series,
        benchmarkClose,
        fundamentals,
        ownership,
        priceCurrency,
        external,
      })

      const dense = isoDaysAgo(DENSE_WINDOW_DAYS)
      const selected = computed.rows.filter((row, index) => {
        if (row.date < writeFrom) return false
        // Jendela terakhir selalu utuh; sebelum itu diambil tiap hari kelima.
        return row.date >= dense || index % HISTORY_STRIDE === 0
      })

      const rows: FeatureInput[] = selected
        .map((row) => ({
          instrumentId: instrument.id,
          date: row.date,
          featureSetVersion: computed.featureSetVersion,
          values: row.values,
        }))

      result.rowsWritten += await upsertFeatures(rows)
      result.itemsProcessed++
    } catch (err) {
      const message = describeError(err)
      console.error(`[Fitur] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  return result
}

/**
 * Muat penutupan tolok ukur sebagai peta tanggal ke harga.
 *
 * Tolok ukur yang tidak ada bukan kegagalan: fitur kekuatan relatif cukup
 * berisi null. Mengisinya dengan nol akan terbaca sebagai "setara pasar",
 * yang merupakan pernyataan, bukan ketiadaan data.
 */
async function loadBenchmark(
  benchmark: Benchmark,
  from: string,
  to: string,
): Promise<Map<string, number> | null> {
  if (benchmark.kind === 'komoditi') return loadCommodityBasket(from, to)

  const instrument = await getInstrumentBySymbol(benchmark.market, benchmark.symbol)
  if (!instrument) {
    console.warn(
      `[Fitur] Tolok ukur ${benchmark.symbol} belum terdaftar; kekuatan relatif dilewati.`,
    )
    return null
  }

  const candles = await getCandles(instrument.id, from, to)
  if (candles.length === 0) return null

  return new Map(candles.map((c) => [c.date, Number(c.close)]))
}

/**
 * Indeks keranjang komoditas berbobot sama, dari 100.
 *
 * Tiap hari memakai rata-rata imbal hasil harian komoditas yang punya harga
 * hari itu dan hari perdagangan sebelumnya. Rata-rata imbal hasil, bukan
 * rata-rata harga: minyak di 80 dan kopi di 300 tidak boleh berbobot beda
 * hanya karena satuannya.
 */
async function loadCommodityBasket(from: string, to: string): Promise<Map<string, number> | null> {
  const members = (await listInstruments('GLOBAL')).filter((i) => i.assetClass === 'komoditi')
  if (members.length === 0) return null

  const returnsByDate = new Map<string, number[]>()
  for (const member of members) {
    const candles = await getCandles(member.id, from, to)
    for (let i = 1; i < candles.length; i++) {
      const prev = Number(candles[i - 1].close)
      const cur = Number(candles[i].close)
      if (!(prev > 0) || !Number.isFinite(cur)) continue
      const list = returnsByDate.get(candles[i].date) ?? []
      list.push(cur / prev - 1)
      returnsByDate.set(candles[i].date, list)
    }
  }

  const out = new Map<string, number>()
  let level = 100
  for (const date of [...returnsByDate.keys()].sort()) {
    const list = returnsByDate.get(date)!
    level *= 1 + list.reduce((a, b) => a + b, 0) / list.length
    out.set(date, level)
  }
  return out.size > 0 ? out : null
}

/**
 * Deret non-harga untuk satu instrumen, disejajarkan dengan tanggal candle-nya.
 *
 * Nilai terakhir dibawa maju, tetapi hanya sampai umur tertentu: Fear & Greed
 * yang terlambat dua hari masih keadaan pasar yang sama, laporan COT yang
 * terlambat tiga minggu sudah bukan. Sesudah batas itu nilainya null, bukan
 * angka lama yang tampak segar.
 */
async function externalFor(
  instrument: InstrumentView,
  market: MarketCode,
  dates: readonly string[],
  from: string,
  to: string,
  sharedSeries: (key: string, load: () => Promise<Map<string, number>>) => Promise<Map<string, number>>,
): Promise<Record<string, MaybeSeries>> {
  const out: Record<string, MaybeSeries> = {}
  const cls = instrument.assetClass

  if (market === 'CRYPTO') {
    out.fear_greed = alignForward(dates, await sharedSeries('FNG', () => macroRange('FNG', from, to)), 3)
    const taker = alignForward(dates, await macroRange(`TAKER:${instrument.symbol}`, from, to), 3)
    out.taker_buy_ratio_20 = rollingMean(taker, 20, 15)
  }

  if (cls === 'saham' || cls === 'indeks') {
    const vix = await sharedSeries('^VIX', async () => {
      const inst = await getInstrumentBySymbol('GLOBAL', '^VIX')
      if (!inst) return new Map()
      return new Map((await getCandles(inst.id, from, to)).map((c) => [c.date, Number(c.close)]))
    })
    out.vix_level = alignForward(dates, vix, 5)
  }

  const weekly = async (prefix: 'COT' | 'TFF', level: string, change: string) => {
    const raw = await macroRange(`${prefix}:${instrument.symbol}`, from, to)
    const sorted = [...raw.entries()].sort(([a], [b]) => a.localeCompare(b))
    const chg = new Map<string, number>()
    // Laporan mingguan: empat baris ke belakang adalah empat minggu.
    for (let i = 4; i < sorted.length; i++) chg.set(sorted[i][0], sorted[i][1] - sorted[i - 4][1])
    out[level] = alignForward(dates, raw, 14)
    out[change] = alignForward(dates, chg, 14)
  }
  if ((cls === 'komoditi' || cls === 'emas') && COT_CONTRACTS[instrument.symbol]) {
    await weekly('COT', 'cot_mm_net_pct', 'cot_mm_net_chg_4w')
  }
  if (TFF_CONTRACTS[instrument.symbol]) {
    await weekly('TFF', 'tff_lev_net_pct', 'tff_lev_net_chg_4w')
  }

  return out
}

/** Nilai terakhir yang tanggalnya tidak melewati tiap tanggal, paling tua `maxAgeDays`. */
function alignForward(dates: readonly string[], values: Map<string, number>, maxAgeDays: number): MaybeSeries {
  const points = [...values.entries()].sort(([a], [b]) => a.localeCompare(b))
  const out: (number | null)[] = new Array(dates.length).fill(null)
  let j = -1
  for (let i = 0; i < dates.length; i++) {
    while (j + 1 < points.length && points[j + 1][0] <= dates[i]) j++
    if (j < 0) continue
    const age = (Date.parse(dates[i]) - Date.parse(points[j][0])) / 86_400_000
    if (age <= maxAgeDays) out[i] = points[j][1]
  }
  return out
}

/** Rata-rata bergulir yang melewati null, asal cukup banyak yang terisi. */
function rollingMean(values: MaybeSeries, window: number, minCount: number): MaybeSeries {
  return values.map((_, i) => {
    if (i + 1 < window) return null
    let sum = 0
    let n = 0
    for (let k = i + 1 - window; k <= i; k++) {
      const v = values[k]
      if (v !== null && v !== undefined) {
        sum += v
        n++
      }
    }
    return n >= minCount ? sum / n : null
  })
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
