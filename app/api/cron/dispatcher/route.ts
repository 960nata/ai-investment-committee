/**
 * Dispatcher cron
 *
 * Dipicu tiap jam oleh QStash Schedules, dan sekali sehari oleh Vercel Cron
 * sebagai jaring pengaman. Plan Hobby Vercel hanya mengizinkan cron harian,
 * sementara `job_schedule` butuh pemeriksaan per jam supaya IDX, AS, dan crypto
 * bisa punya jam jatuh tempo masing-masing.
 *
 * Tugasnya bukan memproses data, melainkan membaca `job_schedule`, menentukan
 * job mana yang jatuh tempo, memecah pekerjaan jadi batch kecil, lalu
 * menyerahkannya ke QStash. Dipanggil dua kali dalam satu jam tidak menggandakan
 * pekerjaan: `markScheduleRan` mencatat jam terakhir tiap job jalan.
 *
 * Tidak ada instrumen yang diproses di sini. Endpoint ini harus selalu selesai
 * dalam hitungan detik, berapa pun jumlah instrumen yang dilacak.
 */

import { NextResponse } from 'next/server'
import { chunk, isDue } from '@/lib/jobs/due'
import {
  listEnabledSchedules,
  listInstruments,
  markScheduleRan,
  type JobScheduleRow,
} from '@/lib/db/queries'
import { publishJob, type JobPayload } from '@/lib/queue/qstash'
import { requireCron } from '@/lib/http/auth'
import { failure, unauthorized, NO_STORE } from '@/lib/http/errors'
import { fromDbMarket } from '@/lib/db/schema'

/** Batas 25–50 instrumen per batch menjaga tiap worker jauh di bawah batas waktu. */
const BATCH_SIZE = 25

/**
 * Rapat komite jauh lebih mahal per simbol daripada ingest: empat panggilan
 * model berurutan, bukan satu panggilan HTTP. Dua simbol per batch menjaga tiap
 * worker tetap di bawah batas waktu function meski satu penyedia lambat
 * menjawab dan registry harus turun ke penyedia cadangan.
 */
const COMMITTEE_BATCH_SIZE = 2

function batchSizeFor(jobName: string): number {
  return jobName.startsWith('komite-') ? COMMITTEE_BATCH_SIZE : BATCH_SIZE
}

export const dynamic = 'force-dynamic'

interface JobOutcome {
  job: string
  dispatched: boolean
  batches?: number
  symbols?: number
  delivery?: string
  reason?: string
  error?: string
}

export async function GET(request: Request) {
  const unauthorized = checkAuth(request)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const now = new Date()

  try {
    const schedules = await listEnabledSchedules()

    if (schedules.length === 0) {
      return NextResponse.json({
        message:
          'Tabel job_schedule kosong. Jalankan `npm run db:seed` untuk mengisi jadwal awal.',
        durationMs: Date.now() - startedAt,
      })
    }

    const results: JobOutcome[] = []
    for (const schedule of schedules) {
      results.push(await dispatchOne(schedule, now))
    }

    const dispatched = results.filter((r) => r.dispatched).length
    return NextResponse.json(
      {
        message: `${dispatched} dari ${schedules.length} job dikirim.`,
        checkedAt: now.toISOString(),
        results,
        durationMs: Date.now() - startedAt,
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('api/cron/dispatcher', err)
  }
}

/**
 * Vercel Cron mengirim `Authorization: Bearer <CRON_SECRET>`. Tanpa rahasia yang
 * diset di produksi, endpoint ditolak — lebih baik dispatcher berhenti jalan
 * daripada terbuka untuk siapa saja.
 */
function checkAuth(request: Request): NextResponse | null {
  const check = requireCron(request)
  if (check.ok) return null

  if (check.reason === 'not-configured') {
    // Gagal tertutup. Dispatcher yang berhenti bekerja akan segera terlihat;
    // dispatcher yang diam-diam terbuka untuk seluruh internet tidak.
    console.error('[Dispatcher] CRON_SECRET belum diset atau terlalu pendek')
    return NextResponse.json(
      { error: 'Endpoint belum dikonfigurasi' },
      { status: 503, headers: NO_STORE },
    )
  }

  return unauthorized()
}

async function dispatchOne(schedule: JobScheduleRow, now: Date): Promise<JobOutcome> {
  const decision = isDue(
    {
      jobName: schedule.jobName,
      hoursOfDay: schedule.hoursOfDay,
      timezone: schedule.timezone,
      tradingDaysOnly: schedule.tradingDaysOnly,
      lastRunAt: schedule.lastRunAt,
    },
    now,
  )

  if (!decision.due) {
    return { job: schedule.jobName, dispatched: false, reason: decision.reason }
  }

  try {
    const market = schedule.market ? fromDbMarket(schedule.market) : 'CRYPTO'
    const instruments = await listInstruments(market)

    // Basis data yang masih kosong tetap bisa memulai dirinya sendiri dari daftar
    // simbol bawaan adaptor; setelah itu daftar instrumen di database yang dipakai.
    // Daftar instrumen datang dari basis data. Kalau kosong, seed belum pernah
    // dijalankan, dan menebak isinya di sini hanya menunda ketahuannya.
    const symbols = instruments.map((i) => i.symbol)

    if (symbols.length === 0) {
      return {
        job: schedule.jobName,
        dispatched: false,
        reason: `tidak ada instrumen untuk pasar ${market}`,
      }
    }

    const batches = chunk(symbols, batchSizeFor(schedule.jobName))
    const deliveries = new Set<string>()

    for (const [index, batch] of batches.entries()) {
      const payload: JobPayload = {
        jobName: schedule.jobName,
        batchKey: `${decision.slot}-b${index}`,
        symbols: batch,
        market,
      }
      const result = await publishJob(payload)
      deliveries.add(result.delivery)
    }

    // Ditandai setelah semua batch terkirim, sehingga cron berikutnya mengulang
    // job ini bila pengiriman gagal di tengah jalan.
    await markScheduleRan(schedule.jobName, now)

    return {
      job: schedule.jobName,
      dispatched: true,
      batches: batches.length,
      symbols: symbols.length,
      delivery: [...deliveries].join(', '),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Dispatcher] ${schedule.jobName} gagal:`, message)
    return { job: schedule.jobName, dispatched: false, error: message }
  }
}
