/**
 * Keadaan sesi yang sedang berjalan.
 *
 * Dipakai bagian antarmuka yang berjalan di peramban dan tidak menerima sesi
 * sebagai prop. Yang dikirim balik hanya yang memang perlu ditampilkan — nama,
 * surel, peran — bukan seluruh baris pengguna.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getCurrentUser()

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null })
  }

  return NextResponse.json({
    authenticated: true,
    user: { name: session.name, email: session.email, role: session.role },
  })
}
