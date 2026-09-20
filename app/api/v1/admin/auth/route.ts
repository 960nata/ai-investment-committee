import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminPin, getAdminSessionCookieValue, verifyAdminSession, COOKIE_NAME } from '@/lib/auth/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Cek status autentikasi admin saat ini.
 */
export async function GET() {
  const isAuthed = await verifyAdminSession()
  return NextResponse.json({
    authenticated: isAuthed,
    role: isAuthed ? 'admin' : 'user',
  })
}

/**
 * Login admin dengan PIN / Passphrase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const pin = body.pin || body.password

    if (!pin || !verifyAdminPin(pin)) {
      return NextResponse.json(
        { ok: false, error: 'PIN atau kunci otorisasi Komite salah.' },
        { status: 401 },
      )
    }

    const response = NextResponse.json({
      ok: true,
      role: 'admin',
      message: 'Otorisasi kredensial berhasil.',
    })

    // Pasang cookie session HttpOnly yang aman selama 7 hari
    response.cookies.set({
      name: COOKIE_NAME,
      value: getAdminSessionCookieValue(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })

    return response
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Logout admin dan hapus cookie session.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: 'Sesi ditutup.' })
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return response
}
