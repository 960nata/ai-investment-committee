/**
 * GET /api/v1/stats
 *
 * Ringkasan kesehatan pipeline untuk dashboard.
 *
 * Kesegaran data dihitung di sini dan dikirim apa adanya, termasuk saat buruk.
 * Data basi yang tidak diberi label adalah kegagalan produk, bukan sekadar
 * kegagalan teknis: user yang tidak tahu datanya mati akan menganggapnya hidup.
 */

import { NextResponse } from 'next/server'
import { cache } from '@/lib/cache/redis'
import { failure, NO_STORE } from '@/lib/http/errors'
import { getDashboardStats, listAdapterHealth } from '@/lib/db/queries'
import { isQStashConfigured } from '@/lib/queue/qstash'

const CACHE_TTL_SECONDS = 60

/** Ingest crypto jalan tiap jam; lewat tiga jam berarti ada yang berhenti. */
const STALE_AFTER_MINUTES = 180

export type Freshness = 'fresh' | 'stale' | 'empty'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await cache.getOrSet(
      'api:stats',
      async () => {
        const [stats, health] = await Promise.all([getDashboardStats(), listAdapterHealth()])

        const ageMinutes = stats.latestFetchedAt
          ? Math.floor((Date.now() - new Date(stats.latestFetchedAt).getTime()) / 60_000)
          : null

        const freshness: Freshness =
          ageMinutes === null ? 'empty' : ageMinutes > STALE_AFTER_MINUTES ? 'stale' : 'fresh'

        return {
          ...stats,
          freshness,
          ageMinutes,
          staleAfterMinutes: STALE_AFTER_MINUTES,
          // Status adaptor dibaca dari database, bukan dari memori proses.
          // Function serverless tidak berbagi memori antar-invocation, jadi
          // hitungan kegagalan yang disimpan di memori selalu kembali nol.
          adapters: health.map((h) => ({
            sourceId: h.sourceId,
            status: h.status,
            consecutiveFailures: h.consecutiveFailures,
            lastError: h.lastError,
            lastSuccessAt: h.lastSuccessAt,
            checkedAt: h.checkedAt,
          })),
          queueConfigured: isQStashConfigured(),
          cacheAvailable: cache.isAvailable(),
          generatedAt: new Date().toISOString(),
        }
      },
      CACHE_TTL_SECONDS,
    )

    return NextResponse.json(data, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/stats', err)
  }
}
