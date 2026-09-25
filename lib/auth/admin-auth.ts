/**
 * Sesi admin dari sudut pandang server component.
 *
 * Logika tanda tangannya sendiri ada di `admin-token.ts` supaya `proxy.ts` bisa
 * memakainya tanpa ikut menarik `next/headers`. Berkas ini menambahkan satu hal
 * yang memang cuma ada di dalam render: membaca cookie lewat API Next.
 */

import { cookies } from 'next/headers'
import { COOKIE_NAME, createSessionSignature } from './admin-token'
import { USER_SESSION_COOKIE, readSessionToken } from './session'

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
    if (sessionCookie?.value && sessionCookie.value === createSessionSignature()) {
      return true
    }

    const userCookie = cookieStore.get(USER_SESSION_COOKIE)
    if (userCookie?.value) {
      const user = readSessionToken(userCookie.value)
      if (user?.role === 'admin') return true
    }

    return false
  } catch {
    return false
  }
}
