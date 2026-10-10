/**
 * Isi tiap job — dipakai bersama oleh worker HTTP (`app/api/jobs/[job]`),
 * pemicu kunjungan (`lib/jobs/auto-pipeline.ts`), dan skrip baris perintah.
 *
 * Dulu hidup di dalam berkas route, dan itu membuatnya hanya bisa dipanggil
 * lewat HTTP bertanda tangan QStash. Tanpa QStash di produksi, seluruh pipeline
 * harga berhenti tanpa suara — warta tetap terbit, harga dan skor membeku.
 */

import { upsertJobRun } from '@/lib/db/queries'
import type { JobPayload } from '@/lib/queue/qstash'
import { runIngestJob } from '@/lib/jobs/ingest'
import { runFeatureJob } from '@/lib/features/job'
import { runScoreJob } from '@/lib/scoring/job'
import { runFundamentalJob } from '@/lib/fundamentals/job'
import { runCommittee } from '@/lib/agents/committee'
import { runKseiJob } from '@/lib/ownership/job'
import { runMacroJob } from '@/lib/macro/job'
import { runExternalJob } from '@/lib/external/job'
import { runAutoNewsJob } from '@/lib/agents/auto-news'
import { translateMissingNews } from '@/lib/agents/news-translator'
import { publishJob } from '@/lib/queue/qstash'
import { evaluateAlerts } from '@/lib/member/alerts'
import { sendWeeklyDigests } from '@/lib/member/digest'
import { runScheduledMeetings } from '@/lib/project/meeting'
import { runUrgentMonitor } from '@/lib/project/monitor'

/** Nama job = segmen URL worker. Job tak dikenal ditolak, bukan didiamkan. */
export const HANDLERS: Record<string, (payload: JobPayload) => Promise<BatchResult>> = {
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
  'fundamental-idx': fundamentalBatch,
  'fundamental-global': fundamentalBatch,
  'ingest-ksei-monthly': kseiBatch,
  'ingest-macro': macroBatch,
  'ingest-external': externalBatch,
  'komite-review': reviewCommittee,
  'warta-otomatis': autoNewsBatch,
  'warta-terjemah': translateNewsBatch,
  'evaluasi-alert': alertBatch,
  'ringkasan-mingguan': digestBatch,
  'laporan-project': projectReportBatch,
  'pantau-project': projectMonitorBatch,
}

export interface BatchResult {
  itemsProcessed: number
  itemsFailed: number
  candlesWritten: number
  quarantined: number
  errors: string[]
  /** Statistik khusus satu jenis job, ikut disimpan apa adanya ke `job_run.stats`. */
  extra?: Record<string, unknown>
}

export type JobStatus = 'success' | 'partial' | 'failed'

/**
 * Jalankan satu batch dan catat hasilnya di `job_run`.
 *
 * Melempar bila handler melempar — pemanggil HTTP mengubahnya jadi 5xx supaya
 * QStash mencoba lagi; pemicu kunjungan cukup mencatat dan lanjut.
 */
export async function runJobBatch(payload: JobPayload): Promise<BatchResult & { status: JobStatus; durationMs: number }> {
  const { jobName } = payload
  const handler = HANDLERS[jobName]
  if (!handler) throw new Error(`Job tidak dikenal: ${jobName}`)

  const batchKey = payload.batchKey || `manual-${new Date().toISOString()}`
  const startedAt = Date.now()

  await upsertJobRun({ jobName, batchKey, status: 'running' })

  try {
    const result = await handler({ ...payload, jobName, batchKey })

    // "partial" membedakan batch yang sebagian simbolnya gagal dari yang mulus —
    // tanpa itu, kegagalan satu simbol tenggelam di antara sembilan yang berhasil.
    const status: JobStatus =
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

    return { status, ...result, durationMs: Date.now() - startedAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Rincian penuh tetap disimpan di `job_run`, yang hanya bisa dibaca dari dalam.
    await upsertJobRun({ jobName, batchKey, status: 'failed', error: message.slice(0, 2000) })
    throw err
  }
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

/**
 * KSEI bulanan. Tidak berbatch per simbol seperti job lain: satu berkas memuat
 * seluruh bursa, jadi satu panggilan mengambil tiga bulan terakhir sekaligus
 * dan melewati yang sudah tersimpan.
 */
async function kseiBatch(): Promise<BatchResult> {
  const r = await runKseiJob()
  return {
    itemsProcessed: r.monthsProcessed,
    itemsFailed: r.errors.length,
    candlesWritten: r.rowsWritten,
    quarantined: 0,
    errors: r.errors,
    extra: { monthsMissing: r.monthsMissing, unmatchedCodes: r.unmatchedCodes, ownershipRows: r.rowsWritten },
  }
}

/** Deret makro, seluruh riwayat diambil ulang — sumbernya merevisi angka lama. */
async function macroBatch(): Promise<BatchResult> {
  const r = await runMacroJob()
  return {
    itemsProcessed: r.seriesProcessed,
    itemsFailed: r.errors.length,
    candlesWritten: r.rowsWritten,
    quarantined: 0,
    errors: r.errors,
    extra: { macroRows: r.rowsWritten },
  }
}

// ---------------------------------------------------------------------------
// Alert pengguna
// ---------------------------------------------------------------------------

/** Seluruh alert aktif dinilai terhadap penutupan, skor, dan putusan terbaru. */
async function alertBatch(): Promise<BatchResult> {
  const r = await evaluateAlerts()
  return {
    itemsProcessed: r.checked,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
    extra: { alertsFired: r.fired, alertsPrimed: r.primed },
  }
}

/** Sentimen dan arus dana: Fear & Greed, taker-buy Binance, COT, TFF. */
async function externalBatch(): Promise<BatchResult> {
  const r = await runExternalJob()
  return {
    itemsProcessed: r.seriesProcessed,
    itemsFailed: r.errors.length,
    candlesWritten: r.rowsWritten,
    quarantined: 0,
    errors: r.errors,
    extra: { externalRows: r.rowsWritten },
  }
}

// ---------------------------------------------------------------------------
// Warta otomatis
// ---------------------------------------------------------------------------

/**
 * Satu putaran redaksi otomatis: pilih peristiwa dari RSS, tulis, terbitkan.
 *
 * Terjemahan empat bahasa sengaja dikirim sebagai job terpisah. Digabung di
 * sini, satu invocation berisi enam panggilan model dan mudah melewati batas
 * durasi; dipisah, kegagalan terjemahan juga tidak mengulang penulisan artikel.
 */
async function autoNewsBatch(payload: JobPayload): Promise<BatchResult> {
  const outcome = await runAutoNewsJob()

  if (outcome.published.length > 0) {
    try {
      await publishJob({
        jobName: 'warta-terjemah',
        batchKey: `${payload.batchKey}-terjemah`,
        symbols: [],
        market: payload.market,
      })
    } catch (err) {
      // Tidak fatal: artikel sudah terbit, versi bahasanya bisa dilengkapi
      // kapan saja lewat `npm run job warta-terjemah`.
      console.warn('[Worker/warta-otomatis] Job terjemahan gagal dikirim:', err)
    }
  }

  return {
    itemsProcessed: outcome.published.length,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
    extra: {
      published: outcome.published,
      skipped: outcome.skipped ?? null,
      headlinesSeen: outcome.headlinesSeen,
    },
  }
}

/** Lengkapi versi bahasa lain untuk beberapa warta terbaru yang belum lengkap. */
async function translateNewsBatch(): Promise<BatchResult> {
  const report = await translateMissingNews(2)
  return {
    itemsProcessed: report.done.length,
    itemsFailed: report.failed.length,
    candlesWritten: 0,
    quarantined: 0,
    errors: report.failed.map((f) => `${f.slug}/${f.locale}: ${f.error}`),
  }
}

// ---------------------------------------------------------------------------
// Ringkasan mingguan
// ---------------------------------------------------------------------------

/** Email ringkasan watchlist untuk tiap pengguna yang punya watchlist. */
/** Rapat project terjadwal: harian, plus mingguan tiap Senin dan bulanan tiap tanggal 1. */
async function projectReportBatch(): Promise<BatchResult> {
  const results = await runScheduledMeetings()
  const failed = results.filter((r) => r.result.status === 'tanpa-rapat')
  return {
    itemsProcessed: results.length,
    itemsFailed: failed.length,
    candlesWritten: 0,
    quarantined: 0,
    errors: failed.map((r) => `rapat ${r.period} tanpa model`),
    extra: { reports: results.map((r) => ({ period: r.period, ...r.result })) },
  }
}

/** Pemantau mendesak per jam — tanpa model, jadi tidak memakai kuota AI. */
async function projectMonitorBatch(): Promise<BatchResult> {
  const r = await runUrgentMonitor()
  return {
    itemsProcessed: r.open,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
    extra: { openIssues: r.open, newIssues: r.fresh.map((i) => i.key), adminsNotified: r.notified },
  }
}

async function digestBatch(): Promise<BatchResult> {
  const r = await sendWeeklyDigests()
  return {
    itemsProcessed: r.sent,
    itemsFailed: r.failed,
    candlesWritten: 0,
    quarantined: 0,
    errors: r.errors,
    extra: { digestsSent: r.sent, digestsSkipped: r.skipped, delivery: r.delivery },
  }
}
