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
