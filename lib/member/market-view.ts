/**
 * Satu potret pasar untuk halaman alat investor: harga penutupan terakhir,
 * skor tiga horizon, dan putusan komite terakhir tiap instrumen.
 *
 * Dibaca dengan tiga kueri untuk seluruh instrumen sekaligus. Watchlist,
 * screener, portofolio, dan bandingkan semuanya memakai potret yang sama,
 * jadi angka untuk satu instrumen tidak pernah berbeda antarhalaman.
 */

import {
  getLatestScoredModelVersion,
  listInstrumentQuotes,
  listLatestScores,
  type InstrumentQuote,
} from '@/lib/db/queries'
import { listLatestVerdictByInstrument, type LatestVerdict } from '@/lib/db/member-queries'
import { MODEL_VERSION } from '@/lib/scoring/weights'

export type Horizon = 'pendek' | 'menengah' | 'panjang'

export interface MarketRow {
  id: number
  symbol: string
  name: string
  market: string
  assetClass: string
  region: string | null
  sector: string | null
  currency: string
  lastClose: number | null
  lastDate: string | null
  changePct: number | null
  candleCount: number
  scores: Partial<Record<Horizon, { score: number; confidence: string; date: string }>>
  verdict: Pick<LatestVerdict, 'verdict' | 'confidence' | 'finishedAt'> | null
}

/**
 * Versi model yang dipakai: `MODEL_VERSION` bila sudah punya skor, selainnya
 * versi terbaru yang punya. Sama dengan beranda — begitu versi dinaikkan,
 * versi barunya kosong sampai job skor berjalan, dan halaman tidak boleh
 * diam-diam kehilangan seluruh skornya di antara dua waktu itu.
 */
export async function resolveScoreVersion(): Promise<string> {
  return (await getLatestScoredModelVersion(MODEL_VERSION).catch(() => null)) ?? MODEL_VERSION
}

export async function loadMarketView(): Promise<MarketRow[]> {
  const [quotes, scores, verdicts] = await Promise.all([
    listInstrumentQuotes(),
    resolveScoreVersion().then(listLatestScores),
    listLatestVerdictByInstrument(),
  ])

  const scoreMap = new Map<number, MarketRow['scores']>()
  for (const s of scores) {
    const bucket = scoreMap.get(s.instrumentId) ?? {}
    bucket[s.horizon] = { score: s.score, confidence: s.confidence, date: s.date }
    scoreMap.set(s.instrumentId, bucket)
  }

  return quotes.map((q: InstrumentQuote) => {
    const v = verdicts.get(q.id)
    return {
      id: q.id,
      symbol: q.symbol,
      name: q.name,
      market: q.market,
      assetClass: q.assetClass,
      region: q.region,
      sector: q.sector,
      currency: q.currency,
      lastClose: q.lastClose,
      lastDate: q.lastDate,
      changePct: q.changePct,
      candleCount: q.candleCount,
      scores: scoreMap.get(q.id) ?? {},
      verdict: v ? { verdict: v.verdict, confidence: v.confidence, finishedAt: v.finishedAt } : null,
    }
  })
}

export { ASSET_CLASS_LABEL } from './labels'
