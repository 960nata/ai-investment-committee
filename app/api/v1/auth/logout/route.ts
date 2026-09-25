/**
 * Keluar.
 *
 * Cookie admin ikut dihapus. Orang yang menekan "keluar" bermaksud meninggalkan
 * kursi ini sepenuhnya, dan meninggalkan sesi admin tetap hidup di peramban yang
 * sama adalah kejutan yang tidak ada gunanya.
 */

import { NextResponse } from 'next/server'
import { sessionCookieOptions, USER_SESSION_COOKIE } from '@/lib/auth/session'
import { COOKIE_NAME as ADMIN_COOKIE } from '@/lib/auth/admin-auth'

export const dynamic = 'force-dynamic'

function clearSessions() {
  const response = NextResponse.json({ ok: true, message: 'Sesi ditutup.' })

  for (const name of [USER_SESSION_COOKIE, ADMIN_COOKIE]) {
    response.cookies.set({ name, value: '', ...sessionCookieOptions(0) })
  }

  return response
}

export async function POST() {
  return clearSessions()
}

export async function DELETE() {
  return clearSessions()
}
