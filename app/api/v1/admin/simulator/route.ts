/**
 * Pengaturan simulator — khusus admin.
 *
 * GET  apakah simulator sudah dibuka untuk pengguna Premium
 * PUT  { premiumEnabled } buka atau tutup akses Premium
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isRequestAdminAuthenticated, verifyAdminSession } from '@/lib/auth/admin-auth'
import { getSimSettings, setSimPremiumEnabled } from '@/lib/db/simulator-queries'
import { failure, NO_STORE } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

async function isAdmin(req: NextRequest): Promise<boolean> {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
}

const denied = () => NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return denied()
  try {
    return NextResponse.json({ ok: true, data: await getSimSettings() }, { headers: NO_STORE })
  } catch (err) {
    return failure('admin/simulator GET', err)
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin(req))) return denied()
  const parsed = await readBody(req, z.object({ premiumEnabled: z.boolean() }))
  if (!parsed.ok) return parsed.response
  try {
    return NextResponse.json(
      { ok: true, data: await setSimPremiumEnabled(parsed.data.premiumEnabled) },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('admin/simulator PUT', err)
  }
}
