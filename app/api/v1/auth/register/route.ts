/**
 * Pendaftaran akun pengguna.
 *
 * Berhasil mendaftar langsung berarti masuk: memaksa orang mengetik ulang
 * kredensial yang baru saja mereka buat tidak menambah keamanan apa pun.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hashPassword } from '@/lib/auth/user-auth'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'
import { registerAppUser } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama terlalu panjang.'),
  email: z.email('Alamat surel tidak sah.').trim().max(128),
  password: z
    .string()
    .min(8, 'Kata sandi minimal 8 karakter.')
    .max(200, 'Kata sandi terlalu panjang.')
    .regex(/[a-zA-Z]/, 'Kata sandi harus memuat setidaknya satu huruf.')
    .regex(/[0-9]/, 'Kata sandi harus memuat setidaknya satu angka.'),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak terbaca.' }, { status: 400 })
  }

  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Data pendaftaran tidak sah.' },
      { status: 400 },
    )
  }

  const { name, email, password } = parsed.data

  try {
    const result = await registerAppUser({
      email,
      name,
      passwordHash: await hashPassword(password),
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: 'Surel ini sudah terdaftar. Silakan masuk.' },
        { status: 409 },
      )
    }

    const user = result.user
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
    console.error('[auth/register]', err)
    return NextResponse.json(
      { ok: false, error: 'Pendaftaran gagal diproses. Coba lagi sebentar lagi.' },
      { status: 500 },
    )
  }
}
