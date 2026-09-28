/**
 * Kotak masuk pengguna: pengumuman admin yang berlaku dan notifikasi alert.
 *
 * Dipanggil berkala oleh pita pengumuman di dashboard. Sekalian menjalankan
 * evaluasi alert milik pengguna ini — dibatasi sekali per lima menit — supaya
 * alert terasa hidup meski job terjadwal belum dipasang.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import {
  countUnreadNotifications,
  dismissAnnouncement,
  listActiveAnnouncementsForUser,
  listNotifications,
  markNotificationsRead,
} from '@/lib/db/member-queries'
import { evaluateAlertsForUserThrottled } from '@/lib/member/alerts'
import { failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  try {
    await evaluateAlertsForUserThrottled(user.uid)
    const [announcements, notifications, unread] = await Promise.all([
      listActiveAnnouncementsForUser(user.uid),
      listNotifications(user.uid, 20),
      countUnreadNotifications(user.uid),
    ])
    return NextResponse.json({ announcements, notifications, unread }, { headers: NO_STORE })
  } catch (err) {
    return failure('Notifications GET', err)
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dismiss-announcement'), id: z.number().int().positive() }),
  z.object({ action: z.literal('read'), ids: z.array(z.number().int().positive()).max(200).optional() }),
])

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    if (body.data.action === 'dismiss-announcement') {
      await dismissAnnouncement(user.uid, body.data.id)
    } else {
      await markNotificationsRead(user.uid, body.data.ids)
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return failure('Notifications POST', err)
  }
}
