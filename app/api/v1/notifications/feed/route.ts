import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { getUnifiedNotificationFeed } from '@/lib/notifications/feed'
import { dismissAnnouncement, markNotificationsRead } from '@/lib/db/member-queries'
import { NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUser()
    const items = await getUnifiedNotificationFeed(user?.uid ?? null)

    return NextResponse.json(
      {
        ok: true,
        items,
        total: items.length,
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[API /api/v1/notifications/feed GET Error]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), items: [], total: 0 },
      { status: 500, headers: NO_STORE },
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      id?: string
      ids?: string[]
    }

    if (user && body.action === 'mark-read' && body.id) {
      if (body.id.startsWith('admin-')) {
        const idNum = parseInt(body.id.replace('admin-', ''), 10)
        if (!isNaN(idNum)) {
          await dismissAnnouncement(user.uid, idNum).catch(() => {})
        }
      } else if (body.id.startsWith('alert-')) {
        const idNum = parseInt(body.id.replace('alert-', ''), 10)
        if (!isNaN(idNum)) {
          await markNotificationsRead(user.uid, [idNum]).catch(() => {})
        }
      }
    } else if (user && body.action === 'mark-all-read') {
      const ids = Array.isArray(body.ids) ? body.ids : []
      const alertIds = ids
        .filter((id) => id.startsWith('alert-'))
        .map((id) => parseInt(id.replace('alert-', ''), 10))
        .filter((n) => !isNaN(n))

      if (alertIds.length > 0) {
        await markNotificationsRead(user.uid, alertIds).catch(() => {})
      } else {
        await markNotificationsRead(user.uid).catch(() => {})
      }

      const adminIds = ids
        .filter((id) => id.startsWith('admin-'))
        .map((id) => parseInt(id.replace('admin-', ''), 10))
        .filter((n) => !isNaN(n))

      for (const aId of adminIds) {
        await dismissAnnouncement(user.uid, aId).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    console.error('[API /api/v1/notifications/feed POST Error]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: NO_STORE })
  }
}
