import { NextResponse, type NextRequest } from 'next/server'
import { isRequestAdminAuthenticated, verifyAdminSession } from '@/lib/auth/admin-auth'
import { countDismissals, createAnnouncement, listAnnouncements } from '@/lib/db/member-queries'
import { badRequest, failure, NO_STORE } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'
import { AnnouncementFields } from '@/lib/member/announcement-schema'

export const dynamic = 'force-dynamic'

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak. Diperlukan sesi Admin.' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(req))) return forbidden()
  try {
    const [rows, dismissals] = await Promise.all([listAnnouncements(), countDismissals()])
    return NextResponse.json(
      { ok: true, data: rows.map((r) => ({ ...r, dismissals: dismissals.get(r.id) ?? 0 })) },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('Admin announcements GET', err)
  }
}

export async function POST(req: NextRequest) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(req))) return forbidden()
  const body = await readBody(req, AnnouncementFields)
  if (!body.ok) return body.response
  const input = body.data
  if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
    return badRequest('Waktu selesai harus setelah waktu mulai.')
  }

  try {
    const row = await createAnnouncement(input)
    return NextResponse.json({ ok: true, data: row }, { headers: NO_STORE })
  } catch (err) {
    return failure('Admin announcements POST', err)
  }
}
