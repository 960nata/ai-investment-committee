/**
 * GET /api/v1/instruments/[id]/candles
 *
 * Riwayat OHLCV satu instrumen. Rentang bawaan 90 hari terakhir.
 *
 * Yang dikembalikan hanya candle tertutup yang tersimpan di database. Harga
 * realtime tidak pernah lewat sini — browser mengambilnya langsung dari bursa,
 * dan skor selalu dihitung dari data yang sama dengan yang dipakai backtest.
 */

import { NextResponse } from 'next/server'
import { cache } from '@/lib/cache/redis'
import { getCandleCount, getCandles, getInstrumentById } from '@/lib/db/queries'

const DEFAULT_RANGE_DAYS = 90
const CACHE_TTL_SECONDS = 300
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  ctx: RouteContext<'/api/v1/instruments/[id]/candles'>,
) {
  const { id } = await ctx.params
  const instrumentId = Number(id)

  if (!Number.isInteger(instrumentId) || instrumentId <= 0) {
    return NextResponse.json({ error: `Id instrumen tidak sah: ${id}` }, { status: 400 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? isoDaysAgo(DEFAULT_RANGE_DAYS)
  const to = url.searchParams.get('to') ?? isoDaysAgo(0)

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'Tanggal harus berformat YYYY-MM-DD' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: '`from` melewati `to`' }, { status: 400 })
  }

  try {
    const instrument = await getInstrumentById(instrumentId)
    if (!instrument) {
      return NextResponse.json({ error: 'Instrumen tidak ditemukan' }, { status: 404 })
    }

    const data = await cache.getOrSet(
      `api:candles:${instrumentId}:${from}:${to}`,
      async () => {
        const [rows, totalCount] = await Promise.all([
          getCandles(instrumentId, from, to),
          getCandleCount(instrumentId),
        ])

        return {
          instrument,
          range: { from, to },
          totalCandleCount: totalCount,
          // Konversi ke number hanya di sini, di batas tampilan. Di database
          // nilainya tetap numeric agar tidak ada galat pembulatan biner.
          candles: rows.map((c) => ({
            date: c.date,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
            source: c.sourceId,
          })),
        }
      },
      CACHE_TTL_SECONDS,
    )

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API] candles:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
