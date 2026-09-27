import { NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getAiTokensDashboardData } from '@/lib/ai/telemetry'
import { unauthorized, failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const isAdmin = (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
  if (!isAdmin) {
    return unauthorized()
  }

  try {
    const { searchParams } = new URL(request.url)
    const timeRange = (searchParams.get('range') as '24h' | '7d' | '30d') || '24h'
    const provider = searchParams.get('provider') || 'all'
    const model = searchParams.get('model') || 'all'

    const data = await getAiTokensDashboardData(timeRange, provider, model)

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
