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
import type { MarketCode } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
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

      const { staleDays, turnover } = await recentContext(instrument.id, feature.date)

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
 * Umur dihitung dalam hari kalender terhadap tanggal fitur, bukan terhadap hari
 * ini saja: skor yang dihitung dari fitur berumur seminggu harus mengaku
 * berumur seminggu, berapa pun jam ia dijalankan.
 */
async function recentContext(
  instrumentId: number,
  featureDate: string,
): Promise<{ staleDays: number; turnover: number | null }> {
  const to = featureDate
  const from = new Date(new Date(`${featureDate}T00:00:00Z`).getTime() - 40 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const candles = await getCandles(instrumentId, from, to)
  const recent = candles.slice(-20)

  const turnover =
    recent.length === 0
      ? null
      : recent.reduce((sum, c) => sum + Number(c.close) * Number(c.volume), 0) / recent.length

  const ageMs = Date.now() - new Date(`${featureDate}T00:00:00Z`).getTime()
  const staleDays = Math.max(0, Math.floor(ageMs / 86_400_000))

  return { staleDays, turnover }
}
