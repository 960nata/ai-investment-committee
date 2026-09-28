import { NextResponse, type NextRequest } from 'next/server'
import { isRequestAdminAuthenticated, verifyAdminSession } from '@/lib/auth/admin-auth'
import { deleteAnnouncement, updateAnnouncement } from '@/lib/db/member-queries'
import { badRequest, failure, notFound, NO_STORE } from '@/lib/http/errors'
import { parseId, readBody } from '@/lib/member/http'
import { AnnouncementPatch } from '@/lib/member/announcement-schema'

export const dynamic = 'force-dynamic'

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak. Diperlukan sesi Admin.' }, { status: 403 })
}

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/v1/admin/announcements/[id]'>) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(req))) return forbidden()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')
  const body = await readBody(req, AnnouncementPatch)
  if (!body.ok) return body.response

  try {
    const row = await updateAnnouncement(id, body.data)
    return row ? NextResponse.json({ ok: true, data: row }, { headers: NO_STORE }) : notFound('Pengumuman tidak ditemukan')
  } catch (err) {
    return failure('Admin announcements PATCH', err)
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/v1/admin/announcements/[id]'>) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(req))) return forbidden()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')

  try {
    const ok = await deleteAnnouncement(id)
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound('Pengumuman tidak ditemukan')
  } catch (err) {
    return failure('Admin announcements DELETE', err)
  }
}
