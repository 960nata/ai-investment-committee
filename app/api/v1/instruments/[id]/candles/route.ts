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
import { badRequest, failure, notFound, NO_STORE } from '@/lib/http/errors'
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
    return badRequest('Id instrumen tidak sah')
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? isoDaysAgo(DEFAULT_RANGE_DAYS)
  const to = url.searchParams.get('to') ?? isoDaysAgo(0)

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return badRequest('Tanggal harus berformat YYYY-MM-DD')
  }
  if (from > to) {
    return badRequest('Tanggal awal melewati tanggal akhir')
  }

  try {
    const instrument = await getInstrumentById(instrumentId)
    if (!instrument) {
      return notFound('Instrumen tidak ditemukan')
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

    return NextResponse.json(data, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/candles', err)
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
