/**
 * Worker job — pembungkus HTTP.
 *
 * Berkas ini hanya mengurus tanda tangan, pemilihan job, dan pencatatan status.
 * Logika tiap job hidup di pustakanya sendiri supaya bisa dipanggil tanpa HTTP:
 * dari QStash, dari skrip baris perintah, dan dari pengujian.
 *
 * Empat aturan keandalan dari blueprint dipegang di sini:
 *
 * 1. Idempoten — semua tulisan lewat INSERT ... ON CONFLICT DO UPDATE, jadi
 *    batch yang sama boleh masuk berkali-kali tanpa menggandakan baris.
 * 2. Retry — ditangani QStash; worker cukup mengembalikan status 5xx saat gagal.
 * 3. Bertahap — tiap batch berdiri sendiri, jadi tidak ada job panjang.
 * 4. Kualitas data — baris mencurigakan masuk karantina, bukan ke tabel harga.
 *
 * Isi tiap job ada di `lib/jobs/handlers.ts`, supaya pemicu kunjungan dan
 * skrip baris perintah memakai jalur yang persis sama.
 */

import { NextResponse } from 'next/server'
import { BINANCE_DEFAULT_SYMBOLS } from '@/lib/adapters/binance'
import type { Market } from '@/lib/adapters/types'
import { verifyQStashRequest, type JobPayload } from '@/lib/queue/qstash'
import { badRequest, failure, notFound, unauthorized, NO_STORE } from '@/lib/http/errors'
import { HANDLERS, runJobBatch } from '@/lib/jobs/handlers'

export const dynamic = 'force-dynamic'

/**
 * Warta otomatis memanggil model dua kali, mengunduh foto, dan membaca halaman
 * berita sumber; jauh lebih lama daripada batch ingest biasa. 300 detik adalah
 * batas plan Hobby dengan Fluid Compute.
 */
export const maxDuration = 300

export async function POST(request: Request, ctx: RouteContext<'/api/jobs/[job]'>) {
  const { job: jobName } = await ctx.params

  const verified = await verifyQStashRequest(request)
  if (!verified.ok) {
    // Alasan penolakan hanya masuk log. Memberitahukannya kepada pemanggil
    // menjelaskan persis apa yang kurang dari percobaannya.
    console.warn(`[Worker/${jobName}] Permintaan ditolak: ${verified.reason}`)
    return unauthorized()
  }

  if (!HANDLERS[jobName]) {
    // Daftar job yang dikenal hanya ditampilkan di luar produksi; di produksi ia
    // sekadar memberi peta pekerjaan internal kepada siapa pun yang menebak.
    return process.env.NODE_ENV === 'production'
      ? notFound()
      : badRequest(`Job tidak dikenal: ${jobName}`, { known: Object.keys(HANDLERS) })
  }

  let payload: JobPayload
  try {
    payload = JSON.parse(verified.body) as JobPayload
  } catch {
    return badRequest('Body bukan JSON yang sah')
  }

  try {
    const result = await runJobBatch({ ...payload, jobName })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (err) {
    // Status 5xx supaya QStash mencoba lagi dengan jeda menaik.
    return failure(`worker/${jobName}`, err)
  }
}


/**
 * Pemicu manual untuk pengembangan. Ditutup di produksi: endpoint ini menarik
 * data dari sumber luar, jadi tidak boleh bisa dipanggil tanpa tanda tangan.
 */
export async function GET(request: Request, ctx: RouteContext<'/api/jobs/[job]'>) {
  if (process.env.NODE_ENV === 'production') {
    // Bukan 405. Di produksi endpoint ini sebaiknya tidak terlihat ada sama
    // sekali; jawaban "metode tidak diizinkan" mengonfirmasi keberadaannya.
    return notFound()
  }

  const { job: jobName } = await ctx.params
  const url = new URL(request.url)
  const market = (url.searchParams.get('market') ?? 'CRYPTO') as Market
  const symbol = url.searchParams.get('symbol')

  const payload: JobPayload = {
    jobName,
    batchKey: `manual-${new Date().toISOString().slice(0, 13)}`,
    symbols: symbol ? [symbol] : BINANCE_DEFAULT_SYMBOLS.map((s) => s.symbol),
    market,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  }

  return POST(
    new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    ctx,
  )
}
