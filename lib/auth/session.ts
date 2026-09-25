/**
 * Tiket sesi pengguna.
 *
 * Berkas ini sengaja hanya bergantung pada `node:crypto` dan tidak menyentuh
 * `next/headers` sama sekali. Alasannya: penjaga pertama berjalan di `proxy.ts`,
 * yang dieksekusi sebelum route mana pun dan tidak punya akses ke API server
 * component. Dengan memisahkan "cara membaca tiket" dari "di mana tiket
 * disimpan", satu logika verifikasi yang sama dipakai proxy, server component,
 * dan route handler — jadi tidak ada celah tempat salah satunya lebih longgar.
 *
 * Bentuk tiketnya sengaja tanpa pustaka: `base64url(payload).hmac`. Tidak ada
 * yang dienkripsi, hanya ditandatangani, dan itu memang cukup — isi tiket
 * bukan rahasia (nama, surel, peran), yang harus dijamin cuma bahwa pengguna
 * tidak bisa mengarangnya sendiri.
 */

import crypto from 'crypto'

/** Nama cookie sesi pengguna biasa. Sengaja beda dari cookie admin. */
export const USER_SESSION_COOKIE = 'komite_user_session'

/** Umur sesi: tujuh hari, sama dengan sesi admin. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface UserSession {
  /** id baris `app_user`. */
  uid: number
  email: string
  name: string
  role: 'admin' | 'user'
  /** Detik epoch saat tiket kedaluwarsa. */
  exp: number
}

/**
 * Kunci penanda tangan.
 *
 * Kunci yang belum diset bukan berarti "terserah": sesi yang ditandatangani
 * nilai tebakan bisa dipalsukan siapa pun yang membaca berkas ini. Di
 * pengembangan nilai cadangan dipakai supaya `next dev` langsung jalan, tetapi
 * di produksi ketiadaannya dicatat keras — lebih baik terlihat salah sekarang
 * daripada diam-diam terbuka nanti.
 */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SECRET_KEY

  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[auth] SESSION_SECRET belum diisi. Sesi pengguna ditandatangani kunci cadangan ' +
          'yang tidak rahasia. Isi SESSION_SECRET (openssl rand -base64 32) sebelum dipakai publik.',
      )
    }
    return 'komite-session-dev-secret-please-change'
  }

  return secret
}

function sign(data: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(data).digest('hex')
}

/**
 * Bandingkan dua tanda tangan dalam waktu tetap.
 *
 * Perbandingan `===` berhenti di karakter pertama yang beda, dan lama
 * pemeriksaannya membocorkan berapa banyak karakter awal yang sudah benar.
 * `timingSafeEqual` bawaan Node menolak buffer dengan panjang berbeda, jadi
 * panjangnya diperiksa lebih dulu.
 */
function signatureMatches(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/** Rakit tiket bertanda tangan untuk satu pengguna. */
export function createSessionToken(
  user: Omit<UserSession, 'exp'>,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): string {
  const payload: UserSession = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

/**
 * Baca tiket dan kembalikan isinya, atau `null` kalau ada satu saja yang salah.
 *
 * Semua kegagalan — bentuk rusak, tanda tangan tidak cocok, sudah kedaluwarsa,
 * bidang hilang — bermuara ke `null` yang sama. Pemanggil tidak perlu tahu
 * bedanya, dan pesan galat yang membedakannya hanya menolong penebak.
 */
export function readSessionToken(token: string | undefined | null): UserSession | null {
  if (!token) return null

  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const body = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  if (!signatureMatches(signature, sign(body))) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UserSession

    if (typeof payload.uid !== 'number' || typeof payload.email !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null

    return {
      uid: payload.uid,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : 'Analis Komite',
      role: payload.role === 'admin' ? 'admin' : 'user',
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

/** Atribut cookie yang dipakai bersama oleh jalur masuk dan jalur keluar. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
