import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'komite_admin_session'
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PIN || 'komite-admin-2026'

/**
 * Buat tanda tangan session token yang aman berbasis HMAC.
 */
function createSessionSignature(): string {
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
 * Periksa session admin dari cookies Next.js (Server Component & Server Actions & Route Handler).
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(COOKIE_NAME)
    if (!sessionCookie || !sessionCookie.value) return false

    const expectedSignature = createSessionSignature()
    return sessionCookie.value === expectedSignature
  } catch {
    return false
  }
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
      return match[1] === createSessionSignature()
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

export { COOKIE_NAME }
