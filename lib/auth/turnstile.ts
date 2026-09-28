/**
 * Verifikasi Cloudflare Turnstile.
 *
 * Pagu per akun di `lib/http/budget.ts` hanya berarti selama membuat akun itu
 * mahal. Tanpa tantangan di pendaftaran, satu skrip bisa membuat seratus akun
 * dan menghabiskan jatah publik rapat komite atas nama mereka semua. Turnstile
 * membuat tiap akun butuh peramban sungguhan, tanpa teka-teki gambar untuk
 * manusia.
 *
 * Bila `TURNSTILE_SECRET_KEY` belum diisi, pemeriksaan dilewati — pengembangan
 * lokal dan pemasangan lama tetap bisa mendaftar. Kalau kuncinya sudah diisi
 * tetapi Cloudflare tidak terjangkau, pendaftaran ditolak: pintu yang dijaga
 * tidak boleh terbuka hanya karena penjaganya sedang tidak menjawab.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let warned = false

export type TurnstileVerdict = { ok: true; skipped: boolean } | { ok: false; reason: string }

export async function verifyTurnstile(
  token: unknown,
  ip: string,
  expectedAction: string,
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (!warned && process.env.NODE_ENV === 'production') {
      console.warn('[Turnstile] TURNSTILE_SECRET_KEY kosong — pendaftaran tidak dijaga tantangan.')
      warned = true
    }
    return { ok: true, skipped: true }
  }

  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'missing-token' }
  }

  const form = new URLSearchParams({ secret, response: token })
  if (ip && ip !== 'unknown') form.set('remoteip', ip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5_000),
    })
    const data = (await res.json()) as {
      success?: boolean
      action?: string
      'error-codes'?: string[]
    }

    if (!data.success) return { ok: false, reason: data['error-codes']?.join(',') || 'rejected' }

    // Token dari widget lain di situs yang sama tidak boleh dipakai di sini.
    if (data.action !== expectedAction) return { ok: false, reason: 'action-mismatch' }

    return { ok: true, skipped: false }
  } catch (err) {
    console.error('[Turnstile] verifikasi gagal:', err)
    return { ok: false, reason: 'unreachable' }
  }
}
