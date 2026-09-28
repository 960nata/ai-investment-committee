/**
 * Pengaturan halaman donasi — khusus admin.
 *
 * Tidak ada GET publik. Halaman /donasi membaca basis data langsung di server,
 * jadi tidak ada alasan membuka isi pengaturan (termasuk metode yang sedang
 * dimatikan) lewat API.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getDonationSettings, saveDonationSettings } from '@/lib/db/donation-queries'
import { DonationSettingsSchema } from '@/lib/donation/providers'
import { NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

async function isAdmin(req: NextRequest): Promise<boolean> {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }
  try {
    return NextResponse.json({ ok: true, data: await getDonationSettings() }, { headers: NO_STORE })
  } catch (err) {
    console.error('[admin/donation GET]', err)
    return NextResponse.json({ ok: false, error: 'Gagal membaca pengaturan donasi.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan bukan JSON yang sah.' }, { status: 400 })
  }

  const parsed = DonationSettingsSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.includes('methods') ? `Metode #${Number(issue.path[1]) + 1}: ` : ''
    return NextResponse.json(
      { ok: false, error: `${where}${issue?.message ?? 'Data tidak sah.'}` },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(
      { ok: true, data: await saveDonationSettings(parsed.data) },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[admin/donation PUT]', err)
    return NextResponse.json({ ok: false, error: 'Gagal menyimpan pengaturan donasi.' }, { status: 500 })
  }
}
