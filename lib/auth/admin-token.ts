/**
 * Tanda tangan sesi admin — bagian yang tidak butuh API server component.
 *
 * Dipisahkan dari `admin-auth.ts` karena `proxy.ts` perlu memeriksa cookie admin
 * juga, dan proxy berjalan sebelum route mana pun sehingga tidak boleh menyentuh
 * `next/headers`. Satu logika tanda tangan, dua tempat pemakaian.
 */

import crypto from 'crypto'

export const COOKIE_NAME = 'komite_admin_session'

/**
 * Rahasia admin, atau null bila belum diisi.
 *
 * Dulu ada nilai cadangan tertulis di sini, dan repo ini publik: siapa pun bisa
 * membacanya, masuk dengan PIN itu, atau langsung menghitung cookie admin
 * tanpa masuk sama sekali. Tanpa rahasia, jalur PIN dan token admin kini mati —
 * akun ber-peran admin tetap bisa masuk lewat email dan kata sandinya.
 */
const ADMIN_SECRET = (process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PIN || '').trim() || null

if (!ADMIN_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] ADMIN_SECRET_KEY / ADMIN_PIN belum diisi — masuk admin lewat PIN dimatikan.')
}

/**
 * Buat tanda tangan session token yang aman berbasis HMAC.
 * Null bila rahasia admin belum diisi: tidak ada cookie PIN yang sah.
 */
export function createSessionSignature(): string | null {
  if (!ADMIN_SECRET) return null
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  const signature = crypto.createHmac('sha256', ADMIN_SECRET).update(`admin:${expires}`).digest('hex')
  return `${expires}.${signature}`
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Cocokkan dengan tanda tangan sesi admin; selalu salah tanpa rahasia. */
export function isValidAdminSignature(value: string | undefined | null): boolean {
  if (!ADMIN_SECRET || !value) return false
  const [expires, signature, extra] = value.split('.')
  if (extra || !/^\d+$/.test(expires) || !signature || Number(expires) <= Date.now() / 1000) return false
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(`admin:${expires}`).digest('hex')
  return safeEqual(signature, expected)
}

/**
 * Periksa apakah PIN atau kata sandi yang dimasukkan cocok dengan konfigurasi admin.
 */
export function verifyAdminPin(pin: string): boolean {
  if (!pin || !ADMIN_SECRET) return false
  return safeEqual(pin.trim(), ADMIN_SECRET)
}

/**
 * Periksa session admin dari HTTP Request (misal Authorization header atau Cookie header).
 */
export function isRequestAdminAuthenticated(req: Request): boolean {
  try {
    // Cek Authorization Bearer
    const authHeader = req.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      if (verifyAdminPin(token) || isValidAdminSignature(token)) {
        return true
      }
    }

    // Cek Cookie header
    const cookieHeader = req.headers.get('cookie') || ''
    const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    if (match && match[1]) {
      if (isValidAdminSignature(match[1])) return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Buat nilai cookie session valid untuk response.
 */
export function getAdminSessionCookieValue(): string | null {
  return createSessionSignature()
}
