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
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import {
  countUnreadNotifications,
  dismissAnnouncement,
  listActiveAnnouncementsForUser,
  listAnnouncements,
  listNotifications,
  markNotificationsRead,
} from '@/lib/db/member-queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { evaluateAlertsForUserThrottled } from '@/lib/member/alerts'
import { failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  const isAdmin = !user ? await verifyAdminSession().catch(() => false) : false
  if (!user && !isAdmin) return unauthorized()

  try {
    if (user) {
      await evaluateAlertsForUserThrottled(user.uid)
    }

    const [announcements, notifications, unread, news] = await Promise.all([
      user ? listActiveAnnouncementsForUser(user.uid) : listAnnouncements(),
      user ? listNotifications(user.uid, 30) : Promise.resolve([]),
      user ? countUnreadNotifications(user.uid) : Promise.resolve(0),
      getMarketNewsList({ limit: 20 }).catch(() => []),
    ])

    return NextResponse.json(
      {
        announcements,
        notifications,
        unread,
        news: news.map((n) => ({
          id: n.id,
          slug: n.slug,
          title: n.title,
          summary: n.summary,
          category: n.category,
          sentiment: n.sentiment,
          impactScore: n.impactScore,
          publishedAt: n.publishedAt,
          featuredImage: n.featuredImage,
        })),
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('Notifications GET', err)
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dismiss-announcement'), id: z.number().int().positive() }),
  z.object({ action: z.literal('read'), ids: z.array(z.number().int().positive()).max(200).optional() }),
  z.object({ action: z.literal('mark-all-read') }),
])

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    if (body.data.action === 'dismiss-announcement') {
      await dismissAnnouncement(user.uid, body.data.id)
    } else if (body.data.action === 'read') {
      await markNotificationsRead(user.uid, body.data.ids)
    } else if (body.data.action === 'mark-all-read') {
      await markNotificationsRead(user.uid)
      const activeAnnouncements = await listActiveAnnouncementsForUser(user.uid)
      await Promise.all(
        activeAnnouncements.map((a) => dismissAnnouncement(user.uid, a.id).catch(() => {})),
      )
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return failure('Notifications POST', err)
  }
}
