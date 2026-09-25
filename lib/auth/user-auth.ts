/**
 * Lapisan akses sesi pengguna (DAL).
 *
 * Panduan Next 16 tegas soal satu hal: pemeriksaan di layout saja tidak cukup.
 * Layout tidak dirender ulang saat berpindah halaman, dan segmen di bawahnya
 * tetap dijalankan router meski layout memutuskan menyembunyikannya. Karena itu
 * pemeriksaan dipusatkan di sini, lalu dipanggil dari tiap halaman yang
 * memuat data — sedekat mungkin dengan datanya sendiri.
 *
 * Lihat `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
 * bagian "Layouts and auth checks" dan "Creating a Data Access Layer (DAL)".
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import crypto from 'crypto'
import { promisify } from 'util'
import {
  USER_SESSION_COOKIE,
  readSessionToken,
  type UserSession,
} from './session'

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

// ---------------------------------------------------------------------------
// Kata sandi
// ---------------------------------------------------------------------------

/**
 * Ubah kata sandi jadi simpanan yang aman.
 *
 * scrypt dipilih karena sudah ada di `node:crypto` — tidak perlu menambah
 * ketergantungan hanya untuk satu fungsi. Garamnya acak per pengguna supaya dua
 * orang dengan kata sandi sama tidak menghasilkan baris yang sama, dan tabel
 * pelangi tidak menolong siapa pun.
 *
 * Bentuk simpanan: `scrypt$<garam heksa>$<turunan heksa>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Cocokkan kata sandi dengan simpanannya.
 *
 * Akun yang belum punya kata sandi (misal dibuat manual lewat portal admin)
 * selalu gagal di sini, bukan lolos. Nilai kosong tidak boleh berarti "bebas
 * masuk".
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false

  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  try {
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64)
    const expected = Buffer.from(hashHex, 'hex')
    if (expected.length !== derived.length) return false
    return crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------------

/**
 * Baca sesi pengguna dari cookie permintaan yang sedang berjalan.
 *
 * Tidak menyentuh basis data sama sekali. Tiketnya bertanda tangan, jadi isinya
 * sudah bisa dipercaya sejauh tanda tangannya cocok — dan kueri tambahan di
 * tiap muatan halaman hanya menambah beban tanpa menambah jaminan.
 */
export async function getCurrentUser(): Promise<UserSession | null> {
  try {
    const store = await cookies()
    return readSessionToken(store.get(USER_SESSION_COOKIE)?.value)
  } catch {
    return null
  }
}

/**
 * Penjaga halaman terkunci.
 *
 * Dipanggil di awal tiap halaman dashboard. Pengunjung tanpa sesi dilempar ke
 * halaman masuk, bukan diberi halaman kosong: halaman kosong membuat orang
 * mengira aplikasinya rusak.
 */
export async function requireUser(nextPath?: string): Promise<UserSession> {
  const session = await getCurrentUser()
  if (session) return session

  const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'
  redirect(target)
}

/** Benar kalau pemegang sesi berperan admin. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const session = await getCurrentUser()
  return session?.role === 'admin'
}
