/**
 * Job pengambilan data non-harga: Fear & Greed, taker-buy Binance, COT, TFF.
 *
 * Satu job untuk keempat sumber, dijalankan sekali sehari sebelum job fitur.
 * Taker-buy diambil bertahap: kalau deret sudah ada, hanya mulai beberapa hari
 * sebelum titik terakhirnya; kalau belum, seluruh riwayatnya sekali jalan.
 * COT dan TFF diambil utuh — CFTC merevisi laporan lama, dan seluruh riwayat
 * satu kontrak hanya satu permintaan.
 */

import { latestMacro, upsertMacro } from '@/lib/db/macro-queries'
import { listInstruments } from '@/lib/db/queries'
import { describeError } from '@/lib/http/errors'
import { COT_CONTRACTS, TFF_CONTRACTS, fetchCot, fetchFearGreed, fetchTakerBuyRatio, fetchTff } from './sources'

export interface ExternalJobResult {
  seriesProcessed: number
  rowsWritten: number
  errors: string[]
}

/** Awal riwayat taker-buy yang diambil untuk koin yang belum punya deret. */
const TAKER_SINCE = Date.UTC(2017, 0, 1)

export async function runExternalJob(options: { only?: ('fng' | 'taker' | 'cot' | 'tff')[] } = {}): Promise<ExternalJobResult> {
  const want = new Set(options.only ?? ['fng', 'taker', 'cot', 'tff'])
  const result: ExternalJobResult = { seriesProcessed: 0, rowsWritten: 0, errors: [] }

  const run = async (label: string, fn: () => Promise<{ seriesId: string; date: string; value: number; source: string }[]>) => {
    try {
      const points = await fn()
      result.rowsWritten += await upsertMacro(points)
      result.seriesProcessed++
    } catch (err) {
      result.errors.push(`${label}: ${describeError(err)}`)
    }
  }

  if (want.has('fng')) await run('FNG', fetchFearGreed)

  if (want.has('taker')) {
    const coins = (await listInstruments('CRYPTO')).map((i) => i.symbol).filter((s) => s.endsWith('USDT'))
    for (const symbol of coins) {
      await run(`TAKER:${symbol}`, async () => {
        const last = await latestMacro(`TAKER:${symbol}`)
        const from = last ? new Date(`${last.date}T00:00:00Z`).getTime() - 3 * 86_400_000 : TAKER_SINCE
        return fetchTakerBuyRatio(symbol, from)
      })
    }
  }

  if (want.has('cot')) for (const symbol of Object.keys(COT_CONTRACTS)) await run(`COT:${symbol}`, () => fetchCot(symbol))
  if (want.has('tff')) for (const symbol of Object.keys(TFF_CONTRACTS)) await run(`TFF:${symbol}`, () => fetchTff(symbol))

  return result
}
