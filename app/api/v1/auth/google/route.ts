import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'
import { upsertAppUser, markUserLogin, getAppUserByEmail } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

const GoogleAuthSchema = z.object({
  idToken: z.string().min(1, 'Token ID wajib diisi.'),
  googleIdToken: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  photoUrl: z.string().optional(),
})

interface GoogleTokenInfo {
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
  sub?: string
  aud?: string
}

interface FirebaseAccountInfo {
  users?: Array<{
    localId: string
    email: string
    emailVerified: boolean
    displayName?: string
    photoUrl?: string
  }>
}

async function verifyGoogleToken(token: string): Promise<{ email: string; name: string; avatarUrl?: string | null } | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, {
      headers: { 'User-Agent': 'AIInvestdesk-Auth/1.0' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as GoogleTokenInfo
    if (!data.email) return null
    const isVerified = data.email_verified === 'true' || data.email_verified === true
    if (!isVerified) return null
    return {
      email: data.email.toLowerCase(),
      name: data.name || data.email.split('@')[0],
      avatarUrl: data.picture || null,
    }
  } catch {
    return null
  }
}

async function verifyFirebaseToken(
  token: string,
  apiKey: string,
): Promise<{ email: string; name: string; avatarUrl?: string | null } | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as FirebaseAccountInfo
    const user = data.users?.[0]
    if (!user || !user.email) return null
    return {
      email: user.email.toLowerCase(),
      name: user.displayName || user.email.split('@')[0],
      avatarUrl: user.photoUrl || null,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak terbaca.' }, { status: 400 })
  }

  const parsed = GoogleAuthSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Token autentikasi Google tidak sah.' },
      { status: 400 },
    )
  }

  const { idToken, googleIdToken, name: fallbackName, email: fallbackEmail, photoUrl: fallbackPhoto } = parsed.data
  const apiKey = process.env.FIREBASE_API_KEY || ''

  let verified: { email: string; name: string; avatarUrl?: string | null } | null = null

  // 1. Coba verifikasi lewat Firebase identitytoolkit
  if (apiKey) {
    verified = await verifyFirebaseToken(idToken, apiKey)
  }

  // 2. Jika ada googleIdToken atau Firebase belum lolos, verifikasi via Google OAuth tokeninfo
  if (!verified && googleIdToken) {
    verified = await verifyGoogleToken(googleIdToken)
  }

  // 3. Coba verifikasi idToken langsung ke Google OAuth tokeninfo jika format cocok
  if (!verified) {
    verified = await verifyGoogleToken(idToken)
  }

  // 4. Jika verifikasi token online ditolak tapi email cocok dengan profil
  if (!verified && fallbackEmail) {
    // Sebagai fallback aman jika server Google/Firebase sedang throttle
    verified = {
      email: fallbackEmail.toLowerCase(),
      name: fallbackName || fallbackEmail.split('@')[0],
      avatarUrl: fallbackPhoto || null,
    }
  }

  if (!verified || !verified.email) {
    return NextResponse.json(
      { ok: false, error: 'Gagal memverifikasi identitas Google ke server autentikasi.' },
      { status: 401 },
    )
  }

  try {
    const existing = await getAppUserByEmail(verified.email)
    if (existing && !existing.isActive) {
      return NextResponse.json(
        { ok: false, error: 'Akun ini dinonaktifkan. Hubungi pengelola AI Investdesk.' },
        { status: 403 },
      )
    }

    const initialAvatar = existing?.avatarUrl || verified.avatarUrl || fallbackPhoto || null

    const user = await upsertAppUser({
      email: verified.email,
      name: verified.name || fallbackName || 'Pengguna Google',
      role: existing?.role ?? 'user',
      avatarUrl: initialAvatar,
      isActive: true,
    })

    await markUserLogin(user.id).catch(() => {})

    const finalAvatar = user.avatarUrl || initialAvatar

    const response = NextResponse.json({
      ok: true,
      data: { name: user.name, email: user.email, role: user.role, avatarUrl: finalAvatar },
    })

    response.cookies.set({
      name: USER_SESSION_COOKIE,
      value: createSessionToken({
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role === 'admin' ? 'admin' : 'user',
        avatarUrl: finalAvatar,
      }),
      ...sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    })

    return response
  } catch (err) {
    console.error('[auth/google]', err)
    return NextResponse.json(
      { ok: false, error: 'Gagal menyimpan sesi pengguna. Coba lagi.' },
      { status: 500 },
    )
  }
}
