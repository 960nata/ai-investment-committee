/**
 * Tanda tangan sesi admin — bagian yang tidak butuh API server component.
 *
 * Dipisahkan dari `admin-auth.ts` karena `proxy.ts` perlu memeriksa cookie admin
 * juga, dan proxy berjalan sebelum route mana pun sehingga tidak boleh menyentuh
 * `next/headers`. Satu logika tanda tangan, dua tempat pemakaian.
 */

import crypto from 'crypto'
import { USER_SESSION_COOKIE, readSessionToken } from './session'

export const COOKIE_NAME = 'komite_admin_session'

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PIN || 'komite-admin-2026'

/**
 * Buat tanda tangan session token yang aman berbasis HMAC.
 */
export function createSessionSignature(): string {
  return crypto.createHmac('sha256', ADMIN_SECRET).update('komite-admin-authenticated').digest('hex')
}

/**
 * Periksa apakah PIN atau kata sandi yang dimasukkan cocok dengan konfigurasi admin.
 */
export function verifyAdminPin(pin: string): boolean {
  if (!pin) return false
  const expected = ADMIN_SECRET.trim()
  const candidate = pin.trim()
  return expected === candidate
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
      if (token === ADMIN_SECRET || token === createSessionSignature()) {
        return true
      }
    }

    // Cek Cookie header
    const cookieHeader = req.headers.get('cookie') || ''
    const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    if (match && match[1]) {
      if (match[1] === createSessionSignature()) return true
    }

    // Cek Cookie user session bila memiliki role admin
    const userMatch = cookieHeader.match(new RegExp(`(?:^|; )${USER_SESSION_COOKIE}=([^;]*)`))
    if (userMatch && userMatch[1]) {
      const user = readSessionToken(decodeURIComponent(userMatch[1]))
      if (user?.role === 'admin') return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Buat nilai cookie session valid untuk response.
 */
export function getAdminSessionCookieValue(): string {
  return createSessionSignature()
}
