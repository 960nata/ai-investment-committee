/**
 * Sesi admin dari sudut pandang server component.
 *
 * Logika tanda tangannya sendiri ada di `admin-token.ts` supaya `proxy.ts` bisa
 * memakainya tanpa ikut menarik `next/headers`. Berkas ini menambahkan satu hal
 * yang memang cuma ada di dalam render: membaca cookie lewat API Next.
 */

import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { COOKIE_NAME, isValidAdminSignature } from './admin-token'
import { getCurrentUser } from './user-auth'

export {
  COOKIE_NAME,
  verifyAdminPin,
  isRequestAdminAuthenticated,
  getAdminSessionCookieValue,
} from './admin-token'

/**
 * Periksa session admin dari cookies Next.js (Server Component & Server Actions & Route Handler).
 * Menerima baik cookie sesi admin (PIN) maupun akun pengguna dengan peran 'admin'.
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(COOKIE_NAME)
    if (isValidAdminSignature(sessionCookie?.value)) {
      return true
    }

    return (await getCurrentUser())?.role === 'admin'
  } catch {
    return false
  }
}

/** Authorize before any admin page reads sensitive data, including prefetched RSC. */
export async function requireAdmin(): Promise<void> {
  if (!(await verifyAdminSession())) notFound()
}
