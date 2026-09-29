/**
 * Job perhitungan skor.
 *
 * Membaca `feature_daily`, menulis `score_daily`. Tabel fitur tidak pernah
 * disentuh, dan seluruh isi tabel skor selalu boleh dibuang lalu dihitung ulang
 * dari nol — itulah yang membuat perubahan bobot bisa dievaluasi, bukan sekadar
 * dipercaya.
 */

import {
  getCandles,
  getInstrumentBySymbol,
  getLatestFeature,
  upsertScores,
  type ScoreInputRow,
} from '@/lib/db/queries'
import type { AssetClass, MarketCode } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { latestMacro } from '@/lib/db/macro-queries'
import { scoreInstrument } from './engine'
import { fundamentalsApply } from './weights'

/**
 * Ambang likuiditas per pasar, dalam mata uang instrumennya.
 *
 * Kasar dan sengaja begitu: tujuannya memisahkan yang benar-benar tipis dari
 * yang wajar, bukan memberi peringkat halus. Sinyal statistik butuh volume, dan
 * instrumen tipis menghasilkan derau yang terlihat seperti sinyal.
 */
const TURNOVER_THRESHOLD: Record<MarketCode, number> = {
  CRYPTO: 5_000_000,
  US: 5_000_000,
  GLOBAL: 5_000_000,
  // Rupiah, jadi angkanya tiga orde lebih besar untuk nilai ekonomi yang sama.
  IDX: 5_000_000_000,
}

/**
 * Dolar per satu satuan harga per kontrak berjangka, sesuai kutipan Yahoo.
 *
 * Volume berjangka dihitung dalam kontrak, bukan unit barang. Tanpa pengali ini
 * `harga × volume` minyak WTI keluar sekitar $30 juta sehari — lebih tipis dari
 * saham gocap — padahal nilai sebenarnya puluhan miliar. Komoditas yang
 * dikutip dalam sen (biji-bijian, kopi, gula, kapas, ternak) sudah dibagi 100
 * di sini.
 */
/** Porsi open interest yang dianggap berpindah tangan tiap hari; lihat `recentContext`. */
const OI_DAILY_TURNOVER = 0.05

const CONTRACT_MULTIPLIER: Record<string, number> = {
  'CL=F': 1_000,
  'BZ=F': 1_000,
  'NG=F': 10_000,
  'HO=F': 42_000,
  'RB=F': 42_000,
  'GC=F': 100,
  'SI=F': 5_000,
  'HG=F': 25_000,
  'PL=F': 50,
  'PA=F': 100,
  'ZC=F': 50,
  'ZW=F': 50,
  'ZS=F': 50,
  'ZO=F': 50,
  'ZL=F': 600,
  'ZM=F': 100,
  'ZR=F': 2_000,
  'KC=F': 375,
  'SB=F': 1_120,
  'CT=F': 500,
  'CC=F': 10,
  'OJ=F': 150,
  'LBR=F': 27.5,
  'LBS=F': 110,
  'LE=F': 400,
  'HE=F': 400,
  'GF=F': 500,
}

export interface ScoreJobInput {
  symbols: string[]
  market: MarketCode
}

export interface ScoreJobResult {
  itemsProcessed: number
  itemsFailed: number
  scoresWritten: number
  skipped: { symbol: string; reason: string }[]
  errors: string[]
}

export async function runScoreJob(input: ScoreJobInput): Promise<ScoreJobResult> {
  const { symbols, market } = input
  const result: ScoreJobResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    scoresWritten: 0,
    skipped: [],
    errors: [],
  }

  const rows: ScoreInputRow[] = []

  for (const symbol of symbols) {
    try {
      const instrument = await getInstrumentBySymbol(market, symbol)
      if (!instrument) {
        result.skipped.push({ symbol, reason: 'instrumen belum terdaftar' })
        continue
      }

      const feature = await getLatestFeature(instrument.id, FEATURE_SET_VERSION)
      if (!feature) {
        result.skipped.push({ symbol, reason: 'belum ada baris fitur' })
        result.itemsProcessed++
        continue
      }

      const { staleDays, turnover } = await recentContext(
        instrument.id,
        instrument.symbol,
        instrument.assetClass,
        feature.date,
      )

      const scored = scoreInstrument({
        values: feature.values,
        hasFundamentals: fundamentalsApply(instrument.assetClass),
        staleDays,
        turnover,
        turnoverThreshold: TURNOVER_THRESHOLD[market],
      })

      for (const horizon of scored.horizons) {
        rows.push({
          instrumentId: instrument.id,
          date: feature.date,
          horizon: horizon.horizon,
          modelVersion: scored.modelVersion,
          featureSetVersion: FEATURE_SET_VERSION,
          score: horizon.score,
          probability: horizon.probability,
          confidence: horizon.confidence,
          confidenceScore: horizon.confidenceScore,
          missingWeight: horizon.missingWeight,
          drivers: horizon.drivers as unknown as Record<string, unknown>,
          groups: horizon.groups as unknown as Record<string, unknown>[],
        })
      }

      result.itemsProcessed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Skor] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  result.scoresWritten = await upsertScores(rows)
  return result
}

/**
 * Umur data dan nilai transaksi harian rata-rata dua puluh hari terakhir.
 *
 * Umur dihitung terhadap tanggal fitur, bukan terhadap hari ini saja: skor yang
 * dihitung dari fitur berumur seminggu harus mengaku berumur seminggu, berapa
 * pun jam ia dijalankan. Satuannya hari perdagangan — akhir pekan tidak
 * dihitung kecuali untuk kripto, yang memang diperdagangkan setiap hari. Data
 * Jumat yang dinilai Senin pagi bukan data basi tiga hari.
 *
 * Turnover null berarti likuiditas tidak bisa diukur dari volume yang ada, dan
 * engine lalu tidak menghukumnya: indeks tidak diperdagangkan langsung (volume
 * ^VIX dan DXY selalu nol), dan berjangka yang ukuran kontraknya tidak dikenal
 * lebih baik tidak dinilai daripada dinilai dengan angka yang keliru ribuan
 * kali lipat.
 */
async function recentContext(
  instrumentId: number,
  symbol: string,
  assetClass: AssetClass,
  featureDate: string,
): Promise<{ staleDays: number; turnover: number | null }> {
  const to = featureDate
  const from = new Date(new Date(`${featureDate}T00:00:00Z`).getTime() - 40 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const candles = await getCandles(instrumentId, from, to)
  const recent = candles.slice(-20)

  const multiplier =
    assetClass === 'indeks' ? null : assetClass === 'komoditi' ? CONTRACT_MULTIPLIER[symbol] ?? null : 1

  let turnover =
    recent.length === 0 || multiplier === null
      ? null
      : (recent.reduce((sum, c) => sum + Number(c.close) * Number(c.volume), 0) / recent.length) * multiplier

  // Volume Yahoo untuk simbol `=F` hanya milik satu bulan kontrak dan jatuh ke
  // nol di sekitar pergantian kontrak — platinum yang diperdagangkan belasan
  // ribu kontrak sehari tercatat 0, 0, 0. Open interest CFTC adalah angka
  // resmi seluruh bulan kontrak. Nilai transaksi harian ditaksir dari 5% open
  // interest: batas bawah yang konservatif, karena volume harian kontrak
  // berjangka yang aktif umumnya 20–50% open interest-nya.
  if (assetClass === 'komoditi' && multiplier !== null && recent.length > 0) {
    const oi = await latestMacro(`COTOI:${symbol}`).catch(() => null)
    const ageDays = oi ? (Date.parse(featureDate) - Date.parse(oi.date)) / 86_400_000 : Infinity
    if (oi && ageDays <= 21) {
      const fromOi = oi.value * OI_DAILY_TURNOVER * Number(recent[recent.length - 1].close) * multiplier
      turnover = Math.max(turnover ?? 0, fromOi)
    }
  }

  const staleDays = elapsedDays(featureDate, new Date(), assetClass !== 'crypto' && assetClass !== 'memecoin')

  return { staleDays, turnover }
}

/** Hari yang lewat sejak `date` sampai `now`, tanpa Sabtu-Minggu bila `weekdaysOnly`. */
function elapsedDays(date: string, now: Date, weekdaysOnly: boolean): number {
  const start = new Date(`${date}T00:00:00Z`)
  const total = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000))
  if (!weekdaysOnly) return total

  let days = 0
  for (let i = 1; i <= total; i++) {
    const dow = new Date(start.getTime() + i * 86_400_000).getUTCDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}
