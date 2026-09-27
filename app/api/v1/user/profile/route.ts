import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'
import { getAppUserByEmail, updateUserProfile } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama maksimal 80 huruf.'),
})

export async function GET() {
  const session = await getCurrentUser()
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Sesi tidak sah. Silakan masuk terlebih dahulu.' },
      { status: 401 },
    )
  }

  const user = await getAppUserByEmail(session.email)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Pengguna tidak ditemukan.' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getCurrentUser()
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Sesi tidak sah. Silakan masuk terlebih dahulu.' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak terbaca.' }, { status: 400 })
  }

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak sah.' },
      { status: 400 },
    )
  }

  const { name } = parsed.data
  const updatedUser = await updateUserProfile(session.uid, { name })

  if (!updatedUser) {
    return NextResponse.json(
      { ok: false, error: 'Gagal memperbarui profil pengguna di basis data.' },
      { status: 500 },
    )
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      avatarUrl: updatedUser.avatarUrl,
    },
    message: 'Profil berhasil diperbarui.',
  })

  response.cookies.set({
    name: USER_SESSION_COOKIE,
    value: createSessionToken({
      uid: session.uid,
      email: session.email,
      name: updatedUser.name,
      role: session.role,
      avatarUrl: updatedUser.avatarUrl,
    }),
    ...sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  })

  return response
}
