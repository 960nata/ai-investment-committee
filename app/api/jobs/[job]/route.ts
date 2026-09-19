/**
 * Worker job
 *
 * Dipanggil QStash, satu panggilan per batch. Empat aturan keandalan dari
 * blueprint dipegang di sini:
 *
 * 1. Idempoten — semua tulisan lewat INSERT ... ON CONFLICT DO UPDATE, jadi
 *    batch yang sama boleh masuk berkali-kali tanpa menggandakan baris.
 * 2. Retry — ditangani QStash; worker cukup mengembalikan status 5xx saat gagal.
 * 3. Bertahap — tiap batch berdiri sendiri, jadi tidak ada job panjang.
 * 4. Kualitas data — baris mencurigakan masuk karantina, bukan ke tabel harga.
 */

import { NextResponse } from 'next/server'
import { registry } from '@/lib/adapters'
import { BINANCE_DEFAULT_SYMBOLS } from '@/lib/adapters/binance'
import {
  MAX_DAILY_JUMP,
  formatDate,
  validateCandle,
  type Candle,
  type Market,
} from '@/lib/adapters/types'
import {
  getLatestCandle,
  quarantineRow,
  upsertCandles,
  upsertInstrument,
  upsertJobRun,
  upsertSymbolAlias,
  type CandleInput,
} from '@/lib/db/queries'
import { verifyQStashRequest, type JobPayload } from '@/lib/queue/qstash'
import { badRequest, failure, notFound, unauthorized, NO_STORE } from '@/lib/http/errors'
import { runFeatureJob } from '@/lib/features/job'
import { runCommittee } from '@/lib/agents/committee'

export const dynamic = 'force-dynamic'

/** Nama job = segmen URL worker. Job tak dikenal ditolak, bukan didiamkan. */
const HANDLERS: Record<string, (payload: JobPayload) => Promise<BatchResult>> = {
  'ingest-crypto-daily': ingestPrice,
  'ingest-us-daily': ingestPrice,
  'ingest-idx-daily': ingestPrice,
  'compute-features-crypto': computeFeaturesBatch,
  'compute-features-idx': computeFeaturesBatch,
  'compute-features-us': computeFeaturesBatch,
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
// Ingest harga
// ---------------------------------------------------------------------------

const CURRENCY_BY_MARKET: Record<Market, string> = {
  CRYPTO: 'USDT',
  IDX: 'IDR',
  US: 'USD',
}

/** Riwayat yang ditarik saat instrumen belum punya satu candle pun. */
const INITIAL_BACKFILL_DAYS = 365

/**
 * Riwayat harga ditabung sendiri sejak hari pertama. Sumber gratis membatasi
 * berapa jauh ke belakang data bisa diminta, jadi yang tidak disimpan sekarang
 * tidak akan pernah bisa dipakai backtest nanti.
 */
async function ingestPrice(payload: JobPayload): Promise<BatchResult> {
  const { symbols, market } = payload
  const result: BatchResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
  }

  const requestedFrom = payload.from ? new Date(payload.from) : null
  const to = payload.to ? new Date(payload.to) : new Date()
  const maxJump = MAX_DAILY_JUMP[market]

  for (const symbol of symbols) {
    try {
      const known = BINANCE_DEFAULT_SYMBOLS.find((s) => s.symbol === symbol)
      const instrument = await upsertInstrument({
        symbol,
        name: known?.name ?? symbol,
        market,
        currency: CURRENCY_BY_MARKET[market],
      })

      const latest = await getLatestCandle(instrument.id)

      // Ingest bersifat inkremental: tarik hanya dari candle terakhir yang
      // tersimpan. Hari terakhir sengaja ditarik ulang karena candle hari
      // berjalan masih berubah sampai pasar tutup.
      const from =
        requestedFrom ??
        (latest ? new Date(`${latest.date}T00:00:00Z`) : daysAgo(INITIAL_BACKFILL_DAYS))

      const { candles, sourceId } = await registry.fetchDailyWithFailover(
        market,
        symbol,
        from,
        to,
      )

      if (candles.length === 0) {
        result.itemsProcessed++
        continue
      }

      await upsertSymbolAlias({ instrumentId: instrument.id, sourceId, alias: symbol })

      let previousClose = latest ? Number(latest.close) : undefined
      const valid: CandleInput[] = []

      for (const candle of candles) {
        const check = validateCandle(candle, { previousClose, maxJump })

        if (!check.valid) {
          await quarantineRow({
            instrumentId: instrument.id,
            sourceId,
            payload: { symbol, ...serialiseCandle(candle) },
            reason: check.reason ?? 'tidak diketahui',
          })
          result.quarantined++
          continue
        }

        valid.push({
          instrumentId: instrument.id,
          date: formatDate(candle.date),
          open: String(candle.open),
          high: String(candle.high),
          low: String(candle.low),
          close: String(candle.close),
          volume: String(candle.volume),
          sourceId,
        })
        previousClose = candle.close
      }

      result.candlesWritten += await upsertCandles(valid)
      result.itemsProcessed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Ingest] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  return result
}

function serialiseCandle(candle: Candle) {
  return {
    date: formatDate(candle.date),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

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
