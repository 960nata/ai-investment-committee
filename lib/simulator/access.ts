/**
 * Siapa yang boleh memakai simulator, dan dompet milik siapa.
 *
 * Admin selalu boleh. Pengguna biasa boleh hanya bila DUA syarat terpenuhi:
 * admin sudah membuka simulator untuk Premium, dan akunnya sedang Premium.
 * Keduanya dibaca dari basis data pada tiap permintaan — mematikan sakelar
 * admin harus langsung menutup akses, bukan menunggu sesi kedaluwarsa.
 */

import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { getEntitlement } from '@/lib/db/premium-queries'
import { getSimSettings } from '@/lib/db/simulator-queries'
import { db } from '@/lib/db/client'
import { appUser } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type SimAccess =
  | { ok: true; ownerKey: string; userId: number | null; isAdmin: boolean; askPerDay: number | null }
  | { ok: false; reason: 'login' | 'disabled' | 'premium' }

export async function resolveSimAccess(): Promise<SimAccess> {
  const [user, isAdmin] = await Promise.all([getCurrentUser(), verifyAdminSession()])

  if (isAdmin) {
    return { ok: true, ownerKey: user ? `u:${user.uid}` : 'admin', userId: user?.uid ?? null, isAdmin: true, askPerDay: null }
  }
  if (!user) return { ok: false, reason: 'login' }

  const settings = await getSimSettings()
  if (!settings.premiumEnabled) return { ok: false, reason: 'disabled' }

  const entitlement = await getEntitlement(user.uid)
  if (!entitlement.isPremium) return { ok: false, reason: 'premium' }

  return { ok: true, ownerKey: `u:${user.uid}`, userId: user.uid, isAdmin: false, askPerDay: entitlement.limits.askPerDay }
}

export const ACCESS_MESSAGE: Record<'login' | 'disabled' | 'premium', string> = {
  login: 'Masuk dulu untuk memakai simulator.',
  disabled: 'Simulator trading belum dibuka untuk pengguna.',
  premium: 'Simulator trading khusus akun Premium.',
}

/**
 * Hak akses sebuah dompet tanpa sesi peramban — untuk autopilot di cron.
 *
 * Dibaca ulang tiap putaran: Premium yang habis atau sakelar admin yang
 * dimatikan harus menghentikan autopilot pada putaran berikutnya, bukan
 * membiarkannya terus membelanjakan kuota AI atas nama akun yang sudah tidak
 * berhak.
 */
export async function resolveOwnerAccess(ownerKey: string): Promise<SimAccess> {
  if (ownerKey === 'admin') return { ok: true, ownerKey, userId: null, isAdmin: true, askPerDay: null }
  const match = /^u:(\d+)$/.exec(ownerKey)
  if (!match) return { ok: false, reason: 'login' }
  const userId = Number(match[1])

  const [user] = await db
    .select({ role: appUser.role, isActive: appUser.isActive })
    .from(appUser)
    .where(eq(appUser.id, userId))
  if (!user || !user.isActive) return { ok: false, reason: 'login' }
  if (user.role === 'admin') return { ok: true, ownerKey, userId, isAdmin: true, askPerDay: null }

  const settings = await getSimSettings()
  if (!settings.premiumEnabled) return { ok: false, reason: 'disabled' }
  const entitlement = await getEntitlement(userId)
  if (!entitlement.isPremium) return { ok: false, reason: 'premium' }
  return { ok: true, ownerKey, userId, isAdmin: false, askPerDay: entitlement.limits.askPerDay }
}
