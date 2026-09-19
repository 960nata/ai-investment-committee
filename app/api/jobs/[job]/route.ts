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
 */

import { NextResponse } from 'next/server'
import { BINANCE_DEFAULT_SYMBOLS } from '@/lib/adapters/binance'
import type { Market } from '@/lib/adapters/types'
import { upsertJobRun } from '@/lib/db/queries'
import { verifyQStashRequest, type JobPayload } from '@/lib/queue/qstash'
import { badRequest, failure, notFound, unauthorized, NO_STORE } from '@/lib/http/errors'
import { runIngestJob } from '@/lib/jobs/ingest'
import { runFeatureJob } from '@/lib/features/job'
import { runScoreJob } from '@/lib/scoring/job'
import { runFundamentalJob } from '@/lib/fundamentals/job'
import { runCommittee } from '@/lib/agents/committee'

export const dynamic = 'force-dynamic'

/** Nama job = segmen URL worker. Job tak dikenal ditolak, bukan didiamkan. */
const HANDLERS: Record<string, (payload: JobPayload) => Promise<BatchResult>> = {
  'ingest-crypto-daily': ingestPrice,
  'ingest-idx-daily': ingestPrice,
  'ingest-us-daily': ingestPrice,
  'ingest-global-daily': ingestPrice,
  'compute-features-crypto': computeFeaturesBatch,
  'compute-features-idx': computeFeaturesBatch,
  'compute-features-us': computeFeaturesBatch,
  'compute-features-global': computeFeaturesBatch,
  'score-crypto': scoreBatch,
  'score-idx': scoreBatch,
  'score-us': scoreBatch,
  'score-global': scoreBatch,
  'fundamental-us': fundamentalBatch,
  'komite-review': reviewCommittee,
}

interface BatchResult {
  itemsProcessed: number
  itemsFailed: number
  candlesWritten: number
  quarantined: number
  errors: string[]
  /** Statistik khusus satu jenis job, ikut disimpan apa adanya ke `job_run.stats`. */
  extra?: Record<string, unknown>
}

export async function POST(request: Request, ctx: RouteContext<'/api/jobs/[job]'>) {
  const { job: jobName } = await ctx.params

  const verified = await verifyQStashRequest(request)
  if (!verified.ok) {
    // Alasan penolakan hanya masuk log. Memberitahukannya kepada pemanggil
    // menjelaskan persis apa yang kurang dari percobaannya.
    console.warn(`[Worker/${jobName}] Permintaan ditolak: ${verified.reason}`)
    return unauthorized()
  }

  const handler = HANDLERS[jobName]
  if (!handler) {
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

  const batchKey = payload.batchKey || `manual-${new Date().toISOString()}`
  const startedAt = Date.now()

  await upsertJobRun({ jobName, batchKey, status: 'running' })

  try {
    const result = await handler({ ...payload, jobName, batchKey })

    // "partial" membedakan batch yang sebagian simbolnya gagal dari yang mulus —
    // tanpa itu, kegagalan satu simbol tenggelam di antara sembilan yang berhasil.
    const status =
      result.itemsFailed === 0
        ? 'success'
        : result.itemsProcessed === 0
          ? 'failed'
          : 'partial'

    await upsertJobRun({
      jobName,
      batchKey,
      status,
      itemsProcessed: result.itemsProcessed,
      itemsFailed: result.itemsFailed,
      stats: {
        candlesWritten: result.candlesWritten,
        quarantined: result.quarantined,
        durationMs: Date.now() - startedAt,
        ...result.extra,
      },
      error: result.errors.length > 0 ? result.errors.join('; ').slice(0, 2000) : null,
    })

    return NextResponse.json(
      { status, ...result, durationMs: Date.now() - startedAt },
      { headers: NO_STORE },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Rincian penuh tetap disimpan di `job_run`, yang hanya bisa dibaca dari
    // dalam. Yang keluar ke jaringan hanya kalimat umum.
    await upsertJobRun({ jobName, batchKey, status: 'failed', error: message.slice(0, 2000) })

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

// ---------------------------------------------------------------------------
// Perhitungan fitur
// ---------------------------------------------------------------------------

/**
 * Hitung ulang fitur teknikal untuk satu batch instrumen.
 *
 * Dipisah dari ingest supaya keduanya bisa gagal sendiri-sendiri. Sumber harga
 * mati tidak boleh ikut menghentikan perhitungan atas data yang sudah tersimpan,
 * dan rumus fitur yang salah tidak boleh ikut menghentikan masuknya data baru.
 */
async function computeFeaturesBatch(payload: JobPayload): Promise<BatchResult> {
  const outcome = await runFeatureJob({
    symbols: payload.symbols,
    market: payload.market,
    writeFrom: payload.from,
  })

  return {
    itemsProcessed: outcome.itemsProcessed,
    itemsFailed: outcome.itemsFailed,
    candlesWritten: 0,
    quarantined: 0,
    errors: outcome.errors,
    extra: {
      featureRowsWritten: outcome.rowsWritten,
      skipped: outcome.skipped,
    },
  }
}

/** Pembungkus tipis: pustaka ingest tidak tahu apa-apa soal bentuk BatchResult. */
async function ingestPrice(payload: JobPayload): Promise<BatchResult> {
  const outcome = await runIngestJob({
    symbols: payload.symbols,
    market: payload.market,
    from: payload.from,
    to: payload.to,
  })
  return { ...outcome }
}

// ---------------------------------------------------------------------------
// Komite agen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Komite agen
// ---------------------------------------------------------------------------

/**
 * Jalankan rapat komite untuk tiap simbol di dalam batch.
 *
 * Batch-nya jauh lebih kecil daripada batch ingest. Satu rapat berarti empat
 * panggilan model berurutan, masing-masing bisa memakan belasan detik, jadi
 * dua puluh lima simbol dalam satu invocation pasti melewati batas waktu
 * function. Dispatcher yang membagi; di sini cukup dipastikan satu simbol gagal
 * tidak menjatuhkan simbol lain di batch yang sama.
 */
async function reviewCommittee(payload: JobPayload): Promise<BatchResult> {
  const { symbols, market, jobName, batchKey } = payload
  const result: BatchResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
  }

  const verdicts: Record<string, string> = {}

  for (const symbol of symbols) {
    try {
      const outcome = await runCommittee({
        market,
        symbol,
        // Kunci idempotensi per simbol: satu batch yang dikirim ulang menemukan
        // rapat lamanya, bukan membuka rapat kedua dengan putusan berbeda.
        sessionKey: `${jobName}:${batchKey}:${symbol}`,
      })

      verdicts[symbol] =
        outcome.verdict === null
          ? 'sudah-selesai'
          : `${outcome.verdict}${outcome.confidence === null ? '' : ` (${outcome.confidence})`}`

      result.itemsProcessed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Komite] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  result.extra = { verdicts }
  return result
}

// ---------------------------------------------------------------------------
// Perhitungan skor
// ---------------------------------------------------------------------------

/**
 * Hitung skor tiga horizon untuk satu batch instrumen.
 *
 * Dipisah dari perhitungan fitur supaya bobot bisa diubah dan skornya dihitung
 * ulang tanpa menyentuh fitur sama sekali — dan fitur tidak perlu dihitung
 * ulang hanya karena satu bobot bergeser.
 */
async function scoreBatch(payload: JobPayload): Promise<BatchResult> {
  const outcome = await runScoreJob({ symbols: payload.symbols, market: payload.market })

  return {
    itemsProcessed: outcome.itemsProcessed,
    itemsFailed: outcome.itemsFailed,
    candlesWritten: 0,
    quarantined: 0,
    errors: outcome.errors,
    extra: { scoresWritten: outcome.scoresWritten, skipped: outcome.skipped },
  }
}

/**
 * Tarik laporan keuangan dari EDGAR.
 *
 * Batch-nya kecil dan jadwalnya jarang: laporan terbit empat kali setahun, dan
 * SEC meminta laju permintaan yang sopan.
 */
async function fundamentalBatch(payload: JobPayload): Promise<BatchResult> {
  const outcome = await runFundamentalJob({ symbols: payload.symbols, market: payload.market })

  return {
    itemsProcessed: outcome.itemsProcessed,
    itemsFailed: outcome.itemsFailed,
    candlesWritten: 0,
    quarantined: outcome.quarantined,
    errors: outcome.errors,
    extra: { fundamentalRows: outcome.rowsWritten, skipped: outcome.skipped },
  }
}
