/**
 * GET /api/v1/instruments
 *
 * Daftar instrumen aktif. Parameter `market` menerima CRYPTO, IDX, atau US.
 * Jawaban di-cache di Redis; daftar instrumen jarang berubah sementara halaman
 * yang memakainya sering dibuka.
 */

import { NextResponse } from 'next/server'
import { cache } from '@/lib/cache/redis'
import { getCandleCountsByInstrument, listInstruments } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'

const MARKETS: MarketCode[] = ['CRYPTO', 'IDX', 'US']
const CACHE_TTL_SECONDS = 300

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('market')?.toUpperCase()

  if (raw && !MARKETS.includes(raw as MarketCode)) {
    return NextResponse.json(
      { error: `Pasar tidak dikenal: ${raw}`, allowed: MARKETS },
      { status: 400 },
    )
  }

  const market = raw as MarketCode | undefined
  const includeDelisted = url.searchParams.get('includeDelisted') === 'true'

  try {
    const data = await cache.getOrSet(
      `api:instruments:${market ?? 'all'}:${includeDelisted}`,
      async () => {
        const instruments = await listInstruments(market, { includeDelisted })
        const counts = await getCandleCountsByInstrument(instruments.map((i) => i.id))

        return instruments.map((i) => ({
          ...i,
          candleCount: counts.get(i.id)?.count ?? 0,
          latestCandleDate: counts.get(i.id)?.latestDate ?? null,
        }))
      },
      CACHE_TTL_SECONDS,
    )

    return NextResponse.json({ data, count: data.length, cached: cache.isAvailable() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API] instruments:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
