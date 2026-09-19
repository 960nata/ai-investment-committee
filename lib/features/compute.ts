/**
 * Engine fitur — dari candle mentah menjadi baris `feature_daily`.
 *
 * Seluruhnya kode deterministik. Tidak ada model bahasa di jalur ini, dan tidak
 * akan pernah ada: angka yang masuk ke skor harus bisa dihitung ulang persis
 * sama bertahun-tahun kemudian, kalau tidak backtest-nya tidak berarti apa-apa.
 *
 * Tiap fitur yang layak dinormalisasi disimpan tiga kali: nilai mentah, robust
 * z-score, dan persentil, keduanya terhadap riwayat dua tahun instrumen itu
 * sendiri. Nilai mentah tidak bisa dibandingkan antar instrumen, karena RSI 70
 * pada aset yang memang selalu bergerak keras bukan peristiwa yang sama dengan
 * RSI 70 pada aset tenang. Z-score dipakai untuk perhitungan; persentil dipakai
 * untuk ditampilkan, karena "di persentil 15" langsung dimengerti orang awam
 * sementara "z-score −1,2" tidak.
 */

import type { MarketCode } from '@/lib/db/schema'
import {
  accumulationDistribution,
  adx,
  atr,
  atrPct,
  bollinger,
  macd,
  maxDrawdown,
  momentum12m1m,
  obv,
  pivotLevels,
  rangePosition,
  realizedVolatility,
  relativeStrength,
  relativeVolume,
  roc,
  rollingPercentile,
  rollingRobustZ,
  rsi,
  sma,
  slopePct,
  volatilityRatio,
  vwapDeviationPct,
  type MaybeSeries,
  type OhlcvSeries,
  type Series,
} from './indicators'
import { FEATURES, normalisedFeatureNames } from './registry'
import { computeFundamentalFeatures, type FundamentalPeriod } from './fundamentals'

/**
 * Versi set fitur, ikut tersimpan di tiap baris.
 *
 * Begitu formula mana pun di file ini berubah, angka ini wajib naik. Tanpa itu,
 * baris lama dan baris baru terlihat sebanding padahal dihitung dengan rumus
 * berbeda, dan perbandingan performa antar versi kehilangan artinya.
 *
 * Riwayat:
 *   fs-2026-09-a  set awal
 *   fs-2026-09-b  volatilitas pindah ke imbal hasil logaritmik, histogram MACD
 *                 dibagi harga, ditambah ADX, momentum 12-1, %b, rasio
 *                 volatilitas, akumulasi–distribusi, dan robust z-score
 *   fs-2026-09-c  lapisan fundamental: valuasi, profitabilitas, kesehatan,
 *                 kualitas laba, pertumbuhan, Altman, dan Piotroski
 */
export const FEATURE_SET_VERSION = 'fs-2026-09-c'

/** Hari perdagangan per tahun. Crypto buka setiap hari; bursa saham tidak. */
const PERIODS_PER_YEAR: Record<MarketCode, number> = {
  CRYPTO: 365,
  IDX: 252,
  US: 252,
  GLOBAL: 252,
}

/** Jendela normalisasi deret waktu: riwayat dua tahun instrumen itu sendiri. */
function normalisationWindow(market: MarketCode): number {
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
  /**
   * Laporan keuangan, diurutkan dari yang terbaru menurut tanggal terbit.
   *
   * Dipilih per tanggal menurut `reportedAt`, bukan menurut akhir periode.
   * Laporan kuartal pertama terbit akhir April sampai Mei, dan memakainya pada
   * 1 April adalah melihat masa depan.
   */
  fundamentals?: FundamentalPeriod[]
}

export interface ComputeResult {
  featureSetVersion: string
  rows: FeatureRow[]
  /** Fitur yang tidak bisa dihitung sama sekali, untuk ditampilkan apa adanya. */
  unavailable: string[]
  /** Benar bila harga sudah disesuaikan aksi korporasi. */
  priceAdjusted: boolean
}

/**
 * Sesuaikan seluruh deret harga terhadap aksi korporasi.
 *
 * Faktor penyesuaian diturunkan dari perbandingan penutupan tersesuaikan
 * terhadap penutupan mentah, lalu diterapkan ke pembukaan, tertinggi, dan
 * terendah. Menyesuaikan penutupan saja akan membuat rentang harian salah, dan
 * bersamanya seluruh keluarga indikator yang memakai tertinggi dan terendah.
 *
 * Tanpa kolom tersesuaikan, deret dikembalikan apa adanya dan pemanggil diberi
 * tahu lewat `adjusted: false`, bukan dibiarkan menduga.
 */
function adjustForCorporateActions(series: OhlcvSeries): {
  open: Series
  high: Series
  low: Series
  close: Series
  adjusted: boolean
} {
  const { open, high, low, close, adjClose } = series

  const usable =
    adjClose !== undefined &&
    adjClose.length === close.length &&
    adjClose.some((v, i) => v > 0 && v !== close[i])

  if (!usable || adjClose === undefined) {
    return { open, high, low, close, adjusted: false }
  }

  const factor = close.map((raw, i) => (raw > 0 ? adjClose[i] / raw : 1))

  return {
    open: open.map((v, i) => v * factor[i]),
    high: high.map((v, i) => v * factor[i]),
    low: low.map((v, i) => v * factor[i]),
    close: [...adjClose],
    adjusted: true,
  }
}

export function computeFeatures(input: ComputeInput): ComputeResult {
  const { market, series, benchmarkClose } = input
  const length = series.close.length

  if (length === 0) {
    return {
      featureSetVersion: FEATURE_SET_VERSION,
      rows: [],
      unavailable: [],
      priceAdjusted: false,
    }
  }

  const price = adjustForCorporateActions(series)
  const { high, low, close } = price
  const { date, volume } = series
  const periodsPerYear = PERIODS_PER_YEAR[market]

  // --- tren -----------------------------------------------------------------
  const sma20 = sma(close, 20)
  const sma50 = sma(close, 50)
  const sma200 = sma(close, 200)
  const directional = adx(high, low, close, 14)

  // --- momentum -------------------------------------------------------------
  const rsi14 = rsi(close, 14)
  const macdResult = macd(close)
  const mom12m1m = momentum12m1m(close)

  // --- volatilitas ----------------------------------------------------------
  const atr14Pct = atrPct(atr(high, low, close, 14), close)
  const bands = bollinger(close, 20, 2)
  const vol20 = realizedVolatility(close, 20, periodsPerYear)
  const volRatio = volatilityRatio(close, 20, 120, periodsPerYear)

  // --- volume ---------------------------------------------------------------
  const obvSeries = obv(close, volume)
  const adlSeries = accumulationDistribution(high, low, close, volume)
  const avgVolume20 = sma(volume, 20)

  // --- struktur dan relatif -------------------------------------------------
  const range = rangePosition(high, low, close, periodsPerYear)
  const pivots = pivotLevels(high, low, close)

  const hasBenchmark = benchmarkClose !== undefined && benchmarkClose.length === length
  const benchmark: MaybeSeries = hasBenchmark
    ? benchmarkClose
    : new Array<number | null>(length).fill(null)

  const raw: Record<string, MaybeSeries> = {
    sma_20: sma20,
    sma_50: sma50,
    sma_200: sma200,
    price_vs_sma_20_pct: ratioPct(close, sma20),
    price_vs_sma_50_pct: ratioPct(close, sma50),
    price_vs_sma_200_pct: ratioPct(close, sma200),
    sma_50_slope_pct: slopePct(sma50, 20),
    ma_alignment: alignment(sma20, sma50, sma200),
    adx_14: directional.adx,
    plus_di_14: directional.plusDi,
    minus_di_14: directional.minusDi,

    rsi_14: rsi14,
    // RSI dipecah jadi dua sisi monoton. Menjumlahkan fitur non-monoton secara
    // langsung menghasilkan skor yang tidak bermakna, dan kesalahan itu mudah
    // lolos dari perhatian karena tidak pernah muncul sebagai error.
    rsi_oversold: rsi14.map((v) => (v === null ? null : Math.max(0, 50 - v) / 50)),
    rsi_overbought: rsi14.map((v) => (v === null ? null : Math.max(0, v - 50) / 50)),
    // Histogram mentah tidak bisa dibandingkan antar-instrumen dengan tingkat
    // harga berbeda, jadi yang disimpan sebagai fitur adalah versi relatifnya.
    macd_histogram_pct: perPrice(macdResult.histogram, close),
    roc_20: roc(close, 20),
    roc_60: roc(close, 60),
    roc_120: roc(close, 120),
    momentum_12_1: mom12m1m,

    atr_14_pct: atr14Pct,
    realized_vol_20: vol20,
    bollinger_width_pct: bands.widthPct,
    percent_b: bands.percentB,
    vol_ratio_20_120: volRatio,

    volume_relative_20: relativeVolume(volume, 20),
    obv_change_20: changeInAverageVolume(obvSeries, avgVolume20, 20),
    adl_change_20: changeInAverageVolume(adlSeries, avgVolume20, 20),
    vwap_deviation_20_pct: vwapDeviationPct(high, low, close, volume, 20),

    distance_from_high_pct: range.distanceFromHighPct,
    distance_from_low_pct: range.distanceFromLowPct,
    position_in_range: range.positionInRange,
    pivot_position: pivots.positionBetweenLevels,

    relative_strength_20: relativeStrength(close, benchmark, 20),
    relative_strength_60: relativeStrength(close, benchmark, 60),
  }

  // --- fundamental ----------------------------------------------------------
  // Kuncinya selalu ada, isinya boleh kosong. Kunci yang hilang dan nilai yang
  // kosong berbeda arti: yang pertama terbaca sebagai fitur yang tidak dikenal
  // sistem, yang kedua sebagai fitur yang memang belum ada datanya.
  for (const spec of FEATURES) {
    if (spec.group !== 'valuasi' && spec.group !== 'kualitas') continue
    raw[spec.name] = new Array<number | null>(length).fill(null)
  }

  if (input.fundamentals && input.fundamentals.length > 0) {
    for (const [name, serie] of Object.entries(
      fundamentalSeries(date, close, input.fundamentals),
    )) {
      raw[name] = serie
    }
  }

  const window = normalisationWindow(market)
  for (const name of normalisedFeatureNames()) {
    const serie = raw[name]
    if (!serie) continue
    raw[`${name}_z`] = rollingRobustZ(serie, window)
    raw[`${name}_pctile`] = rollingPercentile(serie, window)
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

  return {
    featureSetVersion: FEATURE_SET_VERSION,
    rows,
    unavailable,
    priceAdjusted: price.adjusted,
  }
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
  priceAdjusted: boolean
}

export function latestSnapshot(input: ComputeInput): FeatureSnapshot | null {
  const result = computeFeatures(input)
  const last = result.rows.at(-1)
  if (!last) return null

  return {
    date: last.date,
    values: last.values,
    maxDrawdown: round(maxDrawdown(input.series.adjClose ?? input.series.close)),
    featureSetVersion: result.featureSetVersion,
    priceAdjusted: result.priceAdjusted,
  }
}

// ---------------------------------------------------------------------------

/**
 * Deret fitur fundamental, satu nilai per hari.
 *
 * Tiap hari memakai laporan terakhir yang sudah terbit pada hari itu, bukan
 * laporan yang periodenya sudah lewat. Nilainya bertahan sampai laporan
 * berikutnya terbit, dan pada hari terbit ia melompat — lompatan itu memang
 * nyata, karena di situlah informasinya baru sampai ke pasar.
 */
function fundamentalSeries(
  dates: readonly string[],
  close: Series,
  periods: FundamentalPeriod[],
): Record<string, MaybeSeries> {
  const sorted = [...periods].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  const out: Record<string, MaybeSeries> = {}

  // Hasil dihitung ulang hanya ketika himpunan laporan yang tersedia berubah,
  // bukan tiap hari. Rasio yang sama dihitung ratusan kali kalau tidak.
  let cursor = sorted.length
  let cached: Record<string, number | null> | null = null

  for (let i = 0; i < dates.length; i++) {
    const available = sorted.filter((p) => p.reportedAt <= dates[i])

    if (available.length !== cursor) {
      cursor = available.length
      cached =
        available.length === 0
          ? null
          : (computeFundamentalFeatures(available, close[i])?.values ?? null)
    } else if (cached !== null && available.length > 0) {
      // Harga berubah tiap hari meski laporannya tetap, jadi rasio yang memakai
      // harga wajib dihitung ulang. Sisanya diambil dari hasil sebelumnya.
      cached = computeFundamentalFeatures(available, close[i])?.values ?? null
    }

    if (cached === null) continue

    for (const [name, value] of Object.entries(cached)) {
      const serie = (out[name] ??= new Array<number | null>(dates.length).fill(null))
      serie[i] = value
    }
  }

  return out
}

function ratioPct(values: Series, reference: MaybeSeries): MaybeSeries {
  const out: MaybeSeries = new Array<number | null>(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const ref = reference[i]
    if (ref === null || ref === 0) continue
    out[i] = ((values[i] - ref) / ref) * 100
  }
  return out
}

/** Nyatakan sebuah deret sebagai persen harga, supaya bisa dibandingkan lintas instrumen. */
function perPrice(values: MaybeSeries, close: Series): MaybeSeries {
  const out: MaybeSeries = new Array<number | null>(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null || close[i] === 0) continue
    out[i] = (v / close[i]) * 100
  }
  return out
}

/**
 * Perubahan deret kumulatif selama `period` hari, dinyatakan dalam satuan
 * volume harian rata-rata.
 *
 * OBV dan garis akumulasi–distribusi adalah angka kumulatif yang titik nolnya
 * sembarang, jadi tingkatnya tidak berarti apa-apa. Yang bermakna hanya
 * perubahannya, dan itu pun baru bisa dibandingkan antar-instrumen setelah
 * dibagi volume hariannya sendiri.
 */
function changeInAverageVolume(
  cumulative: MaybeSeries,
  averageVolume: MaybeSeries,
  period: number,
): MaybeSeries {
  const out: MaybeSeries = new Array<number | null>(cumulative.length).fill(null)

  for (let i = period; i < cumulative.length; i++) {
    const now = cumulative[i]
    const then = cumulative[i - period]
    const average = averageVolume[i]
    if (now === null || then === null || average === null || average <= 0) continue
    out[i] = (now - then) / average
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
