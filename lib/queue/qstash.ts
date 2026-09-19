/**
 * Antrian job — QStash
 *
 * Batas durasi function Vercel adalah kendala terbesar arsitektur ini, dan
 * QStash-lah yang mengakalinya: dispatcher memecah pekerjaan jadi batch kecil,
 * QStash memanggil balik worker satu per satu, masing-masing selesai jauh di
 * bawah batas waktu. Retry dengan jeda menaik ditangani QStash, bukan kode ini.
 */

import { Client, Receiver } from '@upstash/qstash'
import { fetchWithTimeout } from '@/lib/http/fetch'

export interface JobPayload {
  jobName: string
  batchKey: string
  symbols: string[]
  market: 'IDX' | 'US' | 'CRYPTO'
  /** ISO date, batas awal rentang data yang diminta. */
  from?: string
  /** ISO date, batas akhir rentang data yang diminta. */
  to?: string
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
}

let client: Client | null | undefined
function getClient(): Client | null {
  if (client === undefined) {
    const token = process.env.QSTASH_TOKEN
    client = token ? new Client({ token }) : null
    if (!client) {
      console.warn('[QStash] QSTASH_TOKEN belum diset — worker dipanggil langsung.')
    }
  }
  return client
}

let receiver: Receiver | null | undefined
function getReceiver(): Receiver | null {
  if (receiver === undefined) {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
    receiver =
      currentSigningKey && nextSigningKey
        ? new Receiver({ currentSigningKey, nextSigningKey })
        : null
  }
  return receiver
}

export type PublishResult =
  | { delivery: 'qstash'; messageId: string }
  | { delivery: 'direct'; status: number }

/**
 * Kirim satu batch ke worker `/api/jobs/{jobName}`.
 *
 * Tanpa QSTASH_TOKEN — situasi normal di mesin lokal — worker dipanggil langsung
 * lewat HTTP supaya seluruh rantai tetap bisa diuji. Di produksi jalur itu tidak
 * dipakai: tanpa QStash tidak ada retry, dan job yang gagal hilang begitu saja.
 */
export async function publishJob(payload: JobPayload): Promise<PublishResult> {
  const destination = `${appUrl()}/api/jobs/${payload.jobName}`
  const qstash = getClient()

  if (!qstash) {
    // Worker menarik data dari sumber luar, jadi batas waktunya jauh lebih
    // longgar daripada panggilan biasa — tetapi tetap ada, supaya dispatcher
    // tidak ikut menggantung bersama satu batch yang macet.
    const response = await fetchWithTimeout(destination, {
      label: `worker ${payload.jobName}`,
      timeoutMs: 120_000,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { delivery: 'direct', status: response.status }
  }

  const result = await qstash.publishJSON({
    url: destination,
    body: payload,
    retries: 3,
  })

  return { delivery: 'qstash', messageId: result.messageId }
}

export interface VerifiedRequest {
  ok: boolean
  /** Body mentah. Verifikasi tanda tangan memakai byte persis yang dikirim. */
  body: string
  reason?: string
}

/**
 * Verifikasi bahwa permintaan benar-benar datang dari QStash.
 *
 * Endpoint worker terbuka di internet, jadi tanpa pemeriksaan ini siapa pun bisa
 * menyuruh sistem menarik data. Kalau kunci penandatanganan tidak diset di
 * produksi, permintaan ditolak — gagal tertutup, bukan gagal terbuka.
 */
export async function verifyQStashRequest(request: Request): Promise<VerifiedRequest> {
  const body = await request.text()
  const signature = request.headers.get('upstash-signature')
  const verifier = getReceiver()

  if (!verifier) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        body,
        reason: 'QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY belum diset',
      }
    }
    // Di luar produksi, dispatcher memanggil worker langsung tanpa tanda tangan.
    return { ok: true, body }
  }

  if (!signature) {
    return { ok: false, body, reason: 'Header upstash-signature tidak ada' }
  }

  try {
    const valid = await verifier.verify({ signature, body })
    return valid ? { ok: true, body } : { ok: false, body, reason: 'Tanda tangan tidak cocok' }
  } catch (err) {
    return {
      ok: false,
      body,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Dipakai halaman Pipeline untuk menampilkan apakah antrian benar-benar aktif. */
export function isQStashConfigured(): boolean {
  return getClient() !== null
}
