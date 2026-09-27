import { NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getAiTokensDashboardData, TIME_RANGES, type TimeRange } from '@/lib/ai/telemetry'
import { unauthorized, failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const isAdmin = (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
  if (!isAdmin) {
    return unauthorized()
  }

  try {
    const { searchParams } = new URL(request.url)
    const requested = searchParams.get('range')
    const range: TimeRange = TIME_RANGES.includes(requested as TimeRange) ? (requested as TimeRange) : '24h'

    const data = await getAiTokensDashboardData(range)

    return NextResponse.json(data, {
      headers: {
        ...NO_STORE,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    return failure('api/v1/admin/ai-tokens', err)
  }
}
