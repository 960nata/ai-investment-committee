/**
 * Candle untuk grafik simulator, pada timeframe 1m sampai 1w.
 *
 * Kripto dari Binance (lewat cermin yang lolos blokir ISP); sisanya dari
 * Yahoo, dengan interval yang tidak dimiliki Yahoo (4h) dirakit dari 1 jam.
 * Pembaruan detik-per-detik untuk kripto datang lewat WebSocket Binance di
 * peramban; endpoint ini hanya mengisi riwayat dan menjadi cadangan polling.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import { CHART_INTERVALS, type ChartInterval } from '@/lib/simulator/config'
import { cryptoBars, isCryptoSymbol, yahooBars, type Bar } from '@/lib/simulator/prices'
import { badRequest, failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const Query = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.^=_-]{1,24}$/),
  interval: z.enum(CHART_INTERVALS),
})

const YAHOO: Record<ChartInterval, { range: string; interval: string; bucketMs?: number }> = {
  '1m': { range: '1d', interval: '1m' },
  '5m': { range: '5d', interval: '5m' },
  '15m': { range: '1mo', interval: '15m' },
  '1h': { range: '3mo', interval: '60m' },
  '4h': { range: '1y', interval: '60m', bucketMs: 4 * 3_600_000 },
  '1d': { range: '5y', interval: '1d' },
  '1w': { range: '10y', interval: '1wk' },
}

/** Cache singkat: banyak tab pada simbol yang sama tidak boleh membanjiri sumber. */
const CACHE = new Map<string, { bars: Bar[]; expiresAt: number }>()
const TTL_MS: Record<ChartInterval, number> = {
  '1m': 3_000,
  '5m': 5_000,
  '15m': 10_000,
  '1h': 20_000,
  '4h': 30_000,
  '1d': 60_000,
  '1w': 120_000,
}

function bucket(bars: Bar[], ms: number): Bar[] {
  const out: Bar[] = []
  for (const b of bars) {
    const t = b.time - (b.time % ms)
    const prev = out[out.length - 1]
    if (prev && prev.time === t) {
      prev.high = Math.max(prev.high, b.high)
      prev.low = Math.min(prev.low, b.low)
      prev.close = b.close
      prev.volume += b.volume
    } else out.push({ ...b, time: t })
  }
  return out
}

export async function GET(req: Request) {
  const access = await resolveSimAccess()
  if (!access.ok) {
    return NextResponse.json({ error: ACCESS_MESSAGE[access.reason] }, { status: 403, headers: NO_STORE })
  }

  const params = new URL(req.url).searchParams
  const parsed = Query.safeParse({ symbol: params.get('symbol'), interval: params.get('interval') })
  if (!parsed.success) return badRequest('Simbol atau timeframe tidak sah.')
  const { symbol, interval } = parsed.data

  const key = `${symbol}:${interval}`
  const hit = CACHE.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json({ data: hit.bars }, { headers: NO_STORE })
  }

  try {
    let bars: Bar[]
    if (isCryptoSymbol(symbol)) {
      bars = await cryptoBars(symbol, interval, 500)
    } else {
      const map = YAHOO[interval]
      bars = await yahooBars(symbol, map.range, map.interval)
      if (map.bucketMs) bars = bucket(bars, map.bucketMs)
    }
    CACHE.set(key, { bars, expiresAt: Date.now() + TTL_MS[interval] })
    if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value!)
    return NextResponse.json({ data: bars }, { headers: NO_STORE })
  } catch (err) {
    return failure('simulator candles', err, 502)
  }
}
