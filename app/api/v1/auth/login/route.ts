/**
 * Masuk dengan surel dan kata sandi.
 *
 * Semua penolakan memakai satu kalimat yang sama. Membedakan "surel tidak
 * terdaftar" dari "kata sandi salah" memberi penebak daftar surel yang valid
 * secara cuma-cuma, dan itu separuh pekerjaan mereka.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyPassword } from '@/lib/auth/user-auth'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'
import { getAppUserByEmail, markUserLogin } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

const LoginSchema = z.object({
  email: z.email('Alamat surel tidak sah.').trim().max(128),
  password: z.string().min(1, 'Kata sandi wajib diisi.').max(200),
})

const GENERIC_REJECTION = 'Surel atau kata sandi salah.'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak terbaca.' }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: GENERIC_REJECTION }, { status: 401 })
  }

  const { email, password } = parsed.data

  try {
    const user = await getAppUserByEmail(email)

    // Kata sandi tetap dihitung meski penggunanya tidak ada, supaya lama
    // jawaban untuk surel terdaftar dan tidak terdaftar kira-kira sama.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? null)

    if (!user || !passwordOk) {
      return NextResponse.json({ ok: false, error: GENERIC_REJECTION }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json(
        { ok: false, error: 'Akun ini dinonaktifkan. Hubungi pengelola Komite.' },
        { status: 403 },
      )
    }

    // Stempel waktu adalah catatan, bukan syarat masuk.
    await markUserLogin(user.id).catch(() => {})

    const response = NextResponse.json({
      ok: true,
      data: { name: user.name, email: user.email, role: user.role },
    })

    response.cookies.set({
      name: USER_SESSION_COOKIE,
      value: createSessionToken({
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role === 'admin' ? 'admin' : 'user',
      }),
      ...sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    })

    return response
  } catch (err) {
    console.error('[auth/login]', err)
    return NextResponse.json(
      { ok: false, error: 'Server autentikasi sedang bermasalah. Coba lagi sebentar lagi.' },
      { status: 500 },
    )
  }
}
