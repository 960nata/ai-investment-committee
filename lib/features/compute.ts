/**
 * Engine fitur — dari candle mentah menjadi baris `feature_daily`.
 *
 * Seluruhnya kode deterministik. Tidak ada model bahasa di jalur ini, dan tidak
 * akan pernah ada: angka yang masuk ke skor harus bisa dihitung ulang persis
 * sama bertahun-tahun kemudian, kalau tidak backtest-nya tidak berarti apa-apa.
 *
 * Tiap fitur disimpan dua kali, mentah dan sebagai persentil terhadap riwayat
 * dua tahun instrumen itu sendiri. Nilai mentah tidak bisa dibandingkan antar
 * instrumen: RSI 70 pada aset yang memang selalu bergerak keras bukan peristiwa
 * yang sama dengan RSI 70 pada aset tenang. Persentil-lah yang membuat keduanya
 * bisa masuk ke satu skor.
 */

import type { MarketCode } from '@/lib/db/schema'
import {
  atr,
  atrPct,
  bollinger,
  macd,
  maxDrawdown,
  obv,
  pivotLevels,
  rangePosition,
  realizedVolatility,
  relativeStrength,
  relativeVolume,
  roc,
  rollingPercentile,
  rsi,
  sma,
  slopePct,
  vwapDeviationPct,
  type MaybeSeries,
  type OhlcvSeries,
} from './indicators'

/**
 * Versi set fitur, ikut tersimpan di tiap baris.
 *
 * Begitu formula mana pun di file ini berubah, angka ini wajib naik. Tanpa itu,
 * baris lama dan baris baru terlihat sebanding padahal dihitung dengan rumus
 * berbeda, dan perbandingan performa antar versi kehilangan artinya.
 */
export const FEATURE_SET_VERSION = 'fs-2026-09-a'

/** Hari perdagangan per tahun. Crypto buka setiap hari; bursa saham tidak. */
const PERIODS_PER_YEAR: Record<MarketCode, number> = {
  CRYPTO: 365,
  IDX: 252,
  US: 252,
}

/** Jendela persentil: riwayat dua tahun instrumen itu sendiri. */
function percentileWindow(market: MarketCode): number {
  return PERIODS_PER_YEAR[market] * 2
}

/**
 * Candle paling sedikit yang harus ada sebelum satu baris fitur layak disimpan.
 *
 * Di bawah ini sebagian besar kolom berisi null, dan baris yang hampir kosong
 * hanya membuat tabel terlihat penuh tanpa menambah satu pun informasi.
 */
export const MIN_CANDLES_FOR_FEATURES = 60

export interface FeatureRow {
  date: string
  values: Record<string, number | null>
}

export interface ComputeInput {
  market: MarketCode
  series: OhlcvSeries
  /**
   * Penutupan tolok ukur, sudah disejajarkan indeks per indeks dengan `series`.
   * Kosongkan bila tidak ada; fitur kekuatan relatif akan berisi null, bukan nol.
   */
  benchmarkClose?: MaybeSeries
}

export interface ComputeResult {
  featureSetVersion: string
  rows: FeatureRow[]
  /** Fitur yang tidak bisa dihitung sama sekali, untuk ditampilkan apa adanya. */
  unavailable: string[]
}

/** Fitur yang ikut disimpan sebagai persentil terhadap riwayatnya sendiri. */
const PERCENTILED = [
  'rsi_14',
  'roc_20',
  'roc_60',
  'roc_120',
  'atr_14_pct',
  'bollinger_width_pct',
  'realized_vol_20',
  'volume_relative_20',
  'obv_change_20',
  'vwap_deviation_20_pct',
  'macd_histogram',
  'price_vs_sma_50_pct',
  'relative_strength_20',
  'relative_strength_60',
] as const

export function computeFeatures(input: ComputeInput): ComputeResult {
  const { market, series, benchmarkClose } = input
  const { date, high, low, close, volume } = series
  const length = close.length

  if (length === 0) {
    return { featureSetVersion: FEATURE_SET_VERSION, rows: [], unavailable: [] }
  }

  const periodsPerYear = PERIODS_PER_YEAR[market]

  // --- tren -----------------------------------------------------------------
  const sma20 = sma(close, 20)
  const sma50 = sma(close, 50)
  const sma200 = sma(close, 200)
  const sma50Slope = slopePct(sma50, 20)

  // --- momentum -------------------------------------------------------------
  const rsi14 = rsi(close, 14)
  const macdResult = macd(close)
  const roc20 = roc(close, 20)
  const roc60 = roc(close, 60)
  const roc120 = roc(close, 120)

  // --- volatilitas ----------------------------------------------------------
  const atr14 = atr(high, low, close, 14)
  const atr14Pct = atrPct(atr14, close)
  const bands = bollinger(close, 20, 2)
  const vol20 = realizedVolatility(close, 20, periodsPerYear)

  // --- volume ---------------------------------------------------------------
  const relVolume20 = relativeVolume(volume, 20)
  const obvSeries = obv(close, volume)
  const avgVolume20 = sma(volume, 20)
  const vwapDev20 = vwapDeviationPct(high, low, close, volume, 20)

  // --- struktur -------------------------------------------------------------
  const range = rangePosition(high, low, close, periodsPerYear)
  const pivots = pivotLevels(high, low, close)

  // --- relatif --------------------------------------------------------------
  const hasBenchmark = benchmarkClose !== undefined && benchmarkClose.length === length
  const emptySeries: MaybeSeries = new Array<number | null>(length).fill(null)
  const benchmark = hasBenchmark ? benchmarkClose : emptySeries
  const rel20 = relativeStrength(close, benchmark, 20)
  const rel60 = relativeStrength(close, benchmark, 60)

  // --- turunan --------------------------------------------------------------
  const priceVsSma20 = ratioPct(close, sma20)
  const priceVsSma50 = ratioPct(close, sma50)
  const priceVsSma200 = ratioPct(close, sma200)
  const maAlignment = alignment(sma20, sma50, sma200)

  // OBV mentah adalah angka kumulatif tanpa satuan yang berarti. Perubahannya
  // dibagi rata-rata volume harian supaya terbaca sebagai "berapa hari volume".
  const obvChange20: MaybeSeries = new Array<number | null>(length).fill(null)
  for (let i = 20; i < length; i++) {
    const now = obvSeries[i]
    const then = obvSeries[i - 20]
    const avg = avgVolume20[i]
    if (now === null || then === null || avg === null || avg <= 0) continue
    obvChange20[i] = (now - then) / avg
  }

  const raw: Record<string, MaybeSeries> = {
    sma_20: sma20,
    sma_50: sma50,
    sma_200: sma200,
    sma_50_slope_pct: sma50Slope,
    price_vs_sma_20_pct: priceVsSma20,
    price_vs_sma_50_pct: priceVsSma50,
    price_vs_sma_200_pct: priceVsSma200,
    ma_alignment: maAlignment,
    rsi_14: rsi14,
    macd: macdResult.macd,
    macd_signal: macdResult.signal,
    macd_histogram: macdResult.histogram,
    roc_20: roc20,
    roc_60: roc60,
    roc_120: roc120,
    atr_14_pct: atr14Pct,
    bollinger_width_pct: bands.widthPct,
    realized_vol_20: vol20,
    volume_relative_20: relVolume20,
    obv_change_20: obvChange20,
    vwap_deviation_20_pct: vwapDev20,
    distance_from_high_pct: range.distanceFromHighPct,
    distance_from_low_pct: range.distanceFromLowPct,
    position_in_range: range.positionInRange,
    pivot_position: pivots.positionBetweenLevels,
    relative_strength_20: rel20,
    relative_strength_60: rel60,
  }

  const window = percentileWindow(market)
  for (const name of PERCENTILED) {
    raw[`${name}_pctile`] = rollingPercentile(raw[name], window)
  }

  const rows: FeatureRow[] = []
  for (let i = MIN_CANDLES_FOR_FEATURES - 1; i < length; i++) {
    const values: Record<string, number | null> = {}
    for (const [name, serie] of Object.entries(raw)) {
      values[name] = round(serie[i])
    }
    rows.push({ date: date[i], values })
  }

  const unavailable = Object.entries(raw)
    .filter(([, serie]) => serie.every((v) => v === null))
    .map(([name]) => name)

  return { featureSetVersion: FEATURE_SET_VERSION, rows, unavailable }
}

/**
 * Ringkasan satu instrumen pada hari terakhir, untuk ditampilkan dan untuk
 * dibaca lapisan lain tanpa perlu menghitung ulang seluruh deret.
 */
export interface FeatureSnapshot {
  date: string
  values: Record<string, number | null>
  maxDrawdown: number | null
  featureSetVersion: string
}

export function latestSnapshot(
  input: ComputeInput,
): FeatureSnapshot | null {
  const result = computeFeatures(input)
  const last = result.rows.at(-1)
  if (!last) return null

  return {
    date: last.date,
    values: last.values,
    maxDrawdown: round(maxDrawdown(input.series.close)),
    featureSetVersion: result.featureSetVersion,
  }
}

// ---------------------------------------------------------------------------

function ratioPct(values: readonly number[], reference: MaybeSeries): MaybeSeries {
  const out: MaybeSeries = new Array<number | null>(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const ref = reference[i]
    if (ref === null || ref === 0) continue
    out[i] = ((values[i] - ref) / ref) * 100
  }
  return out
}

/**
 * Susunan rata-rata bergerak, disederhanakan jadi tiga keadaan.
 *
 *   +1  20 di atas 50 di atas 200 — tren naik tersusun rapi
 *   -1  kebalikannya
 *    0  saling silang, artinya tidak ada susunan yang jelas
 */
function alignment(short: MaybeSeries, mid: MaybeSeries, long: MaybeSeries): MaybeSeries {
  const out: MaybeSeries = new Array<number | null>(short.length).fill(null)
  for (let i = 0; i < short.length; i++) {
    const s = short[i]
    const m = mid[i]
    const l = long[i]
    if (s === null || m === null || l === null) continue
    if (s > m && m > l) out[i] = 1
    else if (s < m && m < l) out[i] = -1
    else out[i] = 0
  }
  return out
}

/**
 * Dibulatkan ke enam angka di belakang koma sebelum disimpan.
 *
 * Presisi penuh float menambah puluhan digit tanpa arti ke setiap baris JSONB,
 * dan tier gratis Postgres hanya memberi setengah gigabyte.
 */
function round(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  return Math.round(value * 1e6) / 1e6
}
