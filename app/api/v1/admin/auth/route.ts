import { NextRequest, NextResponse } from 'next/server'
import {
  verifyAdminPin,
  getAdminSessionCookieValue,
  verifyAdminSession,
  COOKIE_NAME,
} from '@/lib/auth/admin-auth'
import { getAppUserByEmail, markUserLogin } from '@/lib/db/news-queries'
import { verifyPassword } from '@/lib/auth/user-auth'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'

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
 * Otorisasi masuk Administrator.
 * Mendukung:
 * 1. PIN / Kunci Akses Rahasia Administrator (Master Key).
 * 2. Akun Administrator (Email & Kata Sandi terdaftar dengan role 'admin').
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim() : null
    const password = typeof body.password === 'string' ? body.password : null
    const pin =
      typeof body.pin === 'string'
        ? body.pin.trim()
        : typeof body.key === 'string'
        ? body.key.trim()
        : null

    // Jalur 1: Otorisasi Akun Administrator (Email + Password)
    if (email && password) {
      const user = await getAppUserByEmail(email)
      const passwordOk = await verifyPassword(password, user?.passwordHash ?? null)

      if (!user || !passwordOk) {
        return NextResponse.json(
          { ok: false, error: 'Surel atau kata sandi administrator salah.' },
          { status: 401 },
        )
      }

      if (user.role !== 'admin') {
        return NextResponse.json(
          {
            ok: false,
            isUserAccount: true,
            error:
              'Akses Ditolak: Akun ini terdaftar sebagai Pengguna Biasa, bukan Administrator. Silakan masuk melalui halaman login pengguna.',
          },
          { status: 403 },
        )
      }

      if (!user.isActive) {
        return NextResponse.json(
          { ok: false, error: 'Akun administrator ini telah dinonaktifkan. Hubungi superadmin.' },
          { status: 403 },
        )
      }

      await markUserLogin(user.id).catch(() => {})

      const response = NextResponse.json({
        ok: true,
        role: 'admin',
        data: { name: user.name, email: user.email, role: 'admin' },
        message: 'Otorisasi administrator berhasil.',
      })

      // Pasang cookie admin session
      response.cookies.set({
        name: COOKIE_NAME,
        value: getAdminSessionCookieValue(),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      })

      // Pasang juga cookie user session dengan role admin
      response.cookies.set({
        name: USER_SESSION_COOKIE,
        value: createSessionToken({
          uid: user.id,
          email: user.email,
          name: user.name,
          role: 'admin',
        }),
        ...sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
      })

      return response
    }

    // Jalur 2: Otorisasi Kunci Akses / Master PIN Administrator
    if (!pin || !verifyAdminPin(pin)) {
      return NextResponse.json(
        { ok: false, error: 'PIN atau kunci otorisasi administrator tidak valid.' },
        { status: 401 },
      )
    }

    const response = NextResponse.json({
      ok: true,
      role: 'admin',
      message: 'Otorisasi kunci akses admin berhasil.',
    })

    response.cookies.set({
      name: COOKIE_NAME,
      value: getAdminSessionCookieValue(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
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
  response.cookies.set({
    name: USER_SESSION_COOKIE,
    value: '',
    ...sessionCookieOptions(0),
  })
  return response
}
