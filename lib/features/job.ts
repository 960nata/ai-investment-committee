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
  upsertFeatures,
  type FeatureInput,
} from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
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

/** Tolok ukur per pasar, dipakai untuk fitur kekuatan relatif. */
const BENCHMARK: Record<MarketCode, string | null> = {
  // Hampir seluruh crypto bergerak mengikuti Bitcoin; tanpa membandingkan
  // terhadapnya, "naik 8% minggu ini" tidak memberi tahu apa pun.
  CRYPTO: 'BTCUSDT',
  // Saham dibandingkan terhadap indeks pasarnya sendiri: naik 5% saat pasar
  // naik 8% sebenarnya sedang tertinggal, dan tanpa fitur ini itu tidak terlihat.
  IDX: '^JKSE',
  US: '^GSPC',
  // Emas dan komoditi tidak punya indeks induk yang wajar; membandingkan minyak
  // terhadap emas tidak menjawab pertanyaan apa pun.
  GLOBAL: null,
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

  // Tolok ukur dimuat sekali untuk seluruh batch, bukan sekali per simbol.
  const benchmarkByDate = await loadBenchmark(market, from, to)

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
      const benchmarkClose: MaybeSeries | undefined = benchmarkByDate
        ? series.date.map((d) => benchmarkByDate.get(d) ?? null)
        : undefined

      // Seluruh laporan yang pernah terbit ditarik sekali, lalu engine fitur
      // memilih per tanggal mana yang sudah tersedia saat itu. Satu kueri per
      // hari akan berarti ratusan perjalanan bolak-balik untuk satu instrumen.
      const fundamentals = await getFundamentalsAsOf(instrument.id, to, 80)

      const computed = computeFeatures({ market, series, benchmarkClose, fundamentals })

      const rows: FeatureInput[] = computed.rows
        .filter((row) => row.date >= writeFrom)
        .map((row) => ({
          instrumentId: instrument.id,
          date: row.date,
          featureSetVersion: computed.featureSetVersion,
          values: row.values,
        }))

      result.rowsWritten += await upsertFeatures(rows)
      result.itemsProcessed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
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
  market: MarketCode,
  from: string,
  to: string,
): Promise<Map<string, number> | null> {
  const symbol = BENCHMARK[market]
  if (!symbol) return null

  const instrument = await getInstrumentBySymbol(market, symbol)
  if (!instrument) {
    console.warn(`[Fitur] Tolok ukur ${symbol} belum terdaftar; kekuatan relatif dilewati.`)
    return null
  }

  const candles = await getCandles(instrument.id, from, to)
  if (candles.length === 0) return null

  return new Map(candles.map((c) => [c.date, Number(c.close)]))
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
