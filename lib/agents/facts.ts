/**
 * Metrik pasar — perhitungan murni
 *
 * Tanpa I/O, tanpa jam global, tanpa database. Alasannya sama dengan
 * `lib/jobs/due.ts`: aritmetika yang salah di sini tidak akan menimbulkan galat,
 * ia hanya menghasilkan angka yang keliru sedikit, dan angka seperti itu lolos
 * sampai ke putusan komite tanpa ada yang menyadarinya. Yang bisa diuji dengan
 * deret buatan akan ketahuan sebelum sampai ke sana.
 *
 * Pengambilan datanya ada di `tools.ts`.
 */

import type { InstrumentView } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'

/** Jumlah hari perdagangan minimum sebelum sebuah metrik layak dilaporkan. */
export const MIN_CANDLES = 30

/**
 * Umur data maksimum sebelum sebuah instrumen dianggap tidak layak dinilai.
 * Crypto diperdagangkan tiap hari, jadi jeda dua hari sudah berarti pipeline
 * berhenti; bursa saham punya akhir pekan dan hari libur, jadi ambangnya lebih
 * longgar. Komite membaca ambang ini sebelum memanggil model sama sekali.
 */
export const STALE_LIMIT_DAYS: Record<MarketCode, number> = {
  CRYPTO: 2,
  IDX: 5,
  US: 5,
}

export interface PricePoint {
  date: string
  close: number
  volume: number
}

export interface MarketFacts {
  symbol: string
  market: MarketCode
  name: string
  currency: string
  /** Tanggal candle terakhir yang tersimpan, bukan tanggal hari ini. */
  asOf: string
  /** Umur data dalam hari. Tesis di atas data basi harus ditolak, bukan dipakai. */
  staleDays: number
  candleCount: number
  lastClose: number
  returns: Record<'d1' | 'd7' | 'd30' | 'd90' | 'd365', number | null>
  /** Simpangan baku imbal hasil harian, disetahunkan. */
  annualisedVolatility: number | null
  maxDrawdown: number | null
  sma: Record<'s20' | 's50' | 's200', number | null>
  /** Posisi harga terhadap rata-rata bergeraknya, dalam persen. */
  priceVsSma50Pct: number | null
  trend: 'naik' | 'turun' | 'menyamping' | 'tidak cukup data'
  /** Rasio volume 20 hari terakhir terhadap 100 hari sebelumnya. */
  volumeRatio20v100: number | null
  warnings: string[]
}

/** Dipisah dari I/O supaya bisa diuji dengan deret buatan. */
export function buildFacts(
  instrument: InstrumentView,
  series: PricePoint[],
  now: Date,
): MarketFacts {
  const warnings: string[] = []
  const closes = series.map((p) => p.close)
  const last = series[series.length - 1]

  const staleDays = Math.floor(
    (now.getTime() - new Date(`${last.date}T00:00:00Z`).getTime()) / 86_400_000,
  )

  const staleLimit = STALE_LIMIT_DAYS[instrument.market]
  if (staleDays > staleLimit) {
    warnings.push(
      `Data terakhir ${last.date}, ${staleDays} hari lalu — di atas ambang ${staleLimit} hari untuk ${instrument.market}.`,
    )
  }

  const sma20 = mean(closes.slice(-20))
  const sma50 = mean(closes.slice(-50))
  const sma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null

  if (sma200 === null) {
    warnings.push(`Riwayat ${closes.length} hari, belum cukup untuk SMA200.`)
  }

  const dailyReturns = pctChanges(closes)

  return {
    symbol: instrument.symbol,
    market: instrument.market,
    name: instrument.name,
    currency: instrument.currency,
    asOf: last.date,
    staleDays,
    candleCount: series.length,
    lastClose: last.close,
    returns: {
      d1: trailingReturn(closes, 1),
      d7: trailingReturn(closes, 7),
      d30: trailingReturn(closes, 30),
      d90: trailingReturn(closes, 90),
      d365: trailingReturn(closes, 365),
    },
    annualisedVolatility: annualisedVolatility(dailyReturns, instrument.market),
    maxDrawdown: maxDrawdown(closes),
    sma: { s20: sma20, s50: sma50, s200: sma200 },
    priceVsSma50Pct: sma50 === null ? null : round((last.close / sma50 - 1) * 100, 2),
    trend: classifyTrend(last.close, sma20, sma50, sma200),
    volumeRatio20v100: volumeRatio(series),
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((a, b) => a + b, 0) / values.length, 6)
}

/**
 * Imbal hasil selama `days` hari data terakhir.
 * Mengembalikan null bila riwayatnya belum sepanjang itu — bukan nol.
 */
function trailingReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null
  const past = closes[closes.length - 1 - days]
  if (past <= 0) return null
  return round((closes[closes.length - 1] / past - 1) * 100, 2)
}

function pctChanges(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1)
  }
  return out
}

/**
 * Volatilitas disetahunkan. Faktor akarnya berbeda per pasar: crypto punya 365
 * hari perdagangan setahun, bursa saham sekitar 252. Memakai 252 untuk crypto
 * akan melaporkan volatilitas yang terlalu rendah sekitar 20%.
 */
function annualisedVolatility(returns: number[], market: MarketCode): number | null {
  if (returns.length < MIN_CANDLES) return null

  const avg = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((acc, r) => acc + (r - avg) ** 2, 0) / (returns.length - 1)
  const periodsPerYear = market === 'CRYPTO' ? 365 : 252

  return round(Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100, 2)
}

/** Penurunan terdalam dari puncak ke lembah, dalam persen (selalu <= 0). */
function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null

  let peak = closes[0]
  let worst = 0

  for (const close of closes) {
    if (close > peak) peak = close
    if (peak > 0) {
      const drawdown = close / peak - 1
      if (drawdown < worst) worst = drawdown
    }
  }

  return round(worst * 100, 2)
}

function classifyTrend(
  last: number,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
): MarketFacts['trend'] {
  if (sma20 === null || sma50 === null) return 'tidak cukup data'

  const above200 = sma200 === null ? true : last > sma200

  if (last > sma20 && sma20 > sma50 && above200) return 'naik'
  if (last < sma20 && sma20 < sma50) return 'turun'
  return 'menyamping'
}

/** Volume 20 hari terakhir dibanding 100 hari sebelumnya — penanda minat yang berubah. */
function volumeRatio(series: PricePoint[]): number | null {
  if (series.length < 120) return null

  const recent = mean(series.slice(-20).map((p) => p.volume))
  const baseline = mean(series.slice(-120, -20).map((p) => p.volume))

  if (recent === null || baseline === null || baseline <= 0) return null
  return round(recent / baseline, 2)
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Ubah fakta menjadi blok teks untuk model.
 *
 * Sengaja tabel datar, bukan JSON bersarang: model lebih jarang salah membaca
 * angka dari baris berlabel daripada dari struktur bertingkat, dan `null` yang
 * ditulis "tidak tersedia" lebih sulit disalahartikan sebagai nol.
 */
export function factsToPrompt(facts: MarketFacts): string {
  const fmt = (value: number | null, suffix = '%') =>
    value === null ? 'tidak tersedia' : `${value}${suffix}`

  const lines = [
    `Instrumen: ${facts.symbol} (${facts.name}) — pasar ${facts.market}, mata uang ${facts.currency}`,
    `Data per: ${facts.asOf} (umur ${facts.staleDays} hari, ${facts.candleCount} candle tersimpan)`,
    `Harga penutupan terakhir: ${facts.lastClose}`,
    ``,
    `Imbal hasil 1 hari   : ${fmt(facts.returns.d1)}`,
    `Imbal hasil 7 hari   : ${fmt(facts.returns.d7)}`,
    `Imbal hasil 30 hari  : ${fmt(facts.returns.d30)}`,
    `Imbal hasil 90 hari  : ${fmt(facts.returns.d90)}`,
    `Imbal hasil 365 hari : ${fmt(facts.returns.d365)}`,
    ``,
    `Volatilitas disetahunkan : ${fmt(facts.annualisedVolatility)}`,
    `Penurunan terdalam       : ${fmt(facts.maxDrawdown)}`,
    `SMA20 / SMA50 / SMA200   : ${facts.sma.s20 ?? 'n/a'} / ${facts.sma.s50 ?? 'n/a'} / ${facts.sma.s200 ?? 'n/a'}`,
    `Harga vs SMA50           : ${fmt(facts.priceVsSma50Pct)}`,
    `Arah tren                : ${facts.trend}`,
    `Rasio volume 20v100      : ${fmt(facts.volumeRatio20v100, 'x')}`,
  ]

  if (facts.warnings.length > 0) {
    lines.push(``, `PERINGATAN DATA:`, ...facts.warnings.map((w) => `- ${w}`))
  }

  return lines.join('\n')
}
