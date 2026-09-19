/**
 * Balasan galat yang aman.
 *
 * Mengirim `err.message` mentah ke pemanggil adalah kebocoran yang mudah
 * terlewat. Pesan galat Postgres memuat nama host, nama basis data, nama tabel,
 * dan kadang potongan kueri; pesan galat fetch memuat URL lengkap beserta
 * parameternya. Semua itu adalah peta bagian dalam sistem, diberikan cuma-cuma
 * kepada siapa pun yang memancing satu galat.
 *
 * Yang dikerjakan file ini: rincian penuh masuk ke log server, pemanggil hanya
 * menerima kalimat umum beserta satu nomor rujukan. Nomor itu yang menyambungkan
 * keluhan pengguna dengan baris log yang tepat, tanpa membocorkan apa pun.
 */

import { NextResponse } from 'next/server'

export interface ErrorBody {
  error: string
  /** Nomor rujukan untuk mencocokkan laporan pengguna dengan baris log. */
  reference: string
  /** Rincian sebenarnya, hanya di luar produksi. */
  detail?: string
}

function reference(): string {
  // Cukup untuk membedakan satu kejadian dari kejadian lain di dalam log; tidak
  // dipakai sebagai rahasia, jadi tidak perlu tahan tebakan.
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Catat galat lalu balas dengan aman.
 *
 * `context` muncul di log saja, misalnya "api/v1/instruments". Pilih yang
 * membantu penelusuran, bukan yang menggambarkan struktur internal.
 */
export function failure(context: string, err: unknown, status = 500): NextResponse {
  const ref = reference()
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)

  console.error(`[${context}] ref=${ref}`, detail)

  const body: ErrorBody = {
    error: 'Terjadi kesalahan di sisi server. Coba lagi beberapa saat lagi.',
    reference: ref,
  }

  // Di luar produksi rincian ikut dikirim; tanpa itu, menelusuri kesalahan di
  // mesin sendiri jadi jauh lebih lambat tanpa manfaat keamanan apa pun.
  if (process.env.NODE_ENV !== 'production') {
    body.detail = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(body, { status, headers: NO_STORE })
}

/**
 * Balasan penolakan karena masukan pemanggil sendiri.
 *
 * Berbeda dari `failure`: pesannya memang ditujukan untuk dibaca pemanggil, jadi
 * boleh spesifik. Yang tidak boleh spesifik hanya galat internal.
 */
export function badRequest(message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status: 400, headers: NO_STORE })
}

export function notFound(message = 'Tidak ditemukan'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404, headers: NO_STORE })
}

/**
 * Penolakan otorisasi.
 *
 * Alasannya sengaja tidak dirinci. Membedakan "token salah" dari "token tidak
 * ada" memberi tahu penebak bahwa ia sudah menemukan bentuk yang benar.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 401, headers: NO_STORE })
}

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
    {
      status: 429,
      headers: { ...NO_STORE, 'retry-after': String(retryAfterSeconds) },
    },
  )
}

/**
 * Jawaban API tidak boleh disimpan perantara mana pun.
 *
 * Tanpa ini, CDN atau proksi perusahaan bisa menyimpan jawaban milik satu
 * pemanggil lalu menyajikannya kepada pemanggil lain.
 */
export const NO_STORE = {
  'cache-control': 'no-store, max-age=0',
} as const
