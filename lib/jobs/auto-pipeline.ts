/**
 * Pipeline harga yang memicu dirinya sendiri dari lalu lintas pengunjung.
 *
 * Saudara `lib/news/auto-tick.ts`, untuk alasan yang sama: jalur resmi
 * dispatcher → QStash → worker butuh dispatcher dipanggil tiap jam dan butuh
 * QStash di produksi. Tanpa keduanya, ingest, fitur, skor, dan alert berhenti
 * tanpa suara — warta tetap terbit dari kunjungan, sementara harga dan skor
 * di layar membeku berhari-hari.
 *
 * Cara kerjanya:
 *
 *   - Beacon kunjungan memanggil `maybePumpPipeline()` lewat `after()`.
 *     Hampir semua panggilan berhenti di pemeriksaan memori.
 *   - Job yang punya slot terjadwal terlewat (`catchUpSlot`) dikerjakan dari
 *     slot tertua dulu, jadi ingest selalu mendahului fitur, fitur mendahului
 *     skor.
 *   - Tiap batch diklaim lewat baris `job_run` yang unik per (job, batch_key),
 *     dengan kunci yang sama dengan dispatcher. Dua pengunjung bersamaan —
 *     atau pemicu ini dan QStash — tidak pernah mengerjakan batch yang sama.
 *   - Satu putaran dibatasi waktunya; batch yang belum tersentuh dilanjutkan
 *     kunjungan berikutnya. Jadwal ditandai selesai hanya setelah seluruh
 *     batch-nya diklaim.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { listEnabledSchedules, listInstruments, markScheduleRan, type JobScheduleRow } from '@/lib/db/queries'
import { fromDbMarket } from '@/lib/db/schema'
import { batchSizeFor, catchUpSlot, chunk, WHOLE_SOURCE_JOBS } from './due'
import { HANDLERS, runJobBatch } from './handlers'

/** Pemeriksaan ke basis data paling sering sekali per ini, per proses. */
const CHECK_EVERY_MS = 5 * 60_000
/** Sisa waktu `after()` (maxDuration 300 detik) dibagi dengan warta otomatis. */
const BUDGET_MS = 200_000
/** Batch yang sedang jalan tidak dihentikan; batch baru tidak dimulai kalau sisa waktu sekecil ini. */
const START_MARGIN_MS = 60_000

/**
 * Job yang punya jalurnya sendiri atau terlalu mahal untuk dipicu kunjungan:
 * warta sudah dipicu `auto-tick`, rapat komite membakar kuota model.
 */
function skipped(jobName: string): boolean {
  return jobName.startsWith('warta-') || jobName.startsWith('komite-')
}

/**
 * Jadwal yang lahir setelah seed terakhir dijalankan di produksi. Disisipkan
 * bila belum ada — tidak pernah menimpa baris yang sudah diatur admin.
 */
const REQUIRED_SCHEDULES = [
  { jobName: 'evaluasi-alert', hoursOfDay: Array.from({ length: 24 }, (_, h) => h), timezone: 'UTC' },
  { jobName: 'ringkasan-mingguan', hoursOfDay: [7], timezone: 'Asia/Jakarta' },
]

let schedulesEnsured = false
async function ensureSchedules(): Promise<void> {
  if (schedulesEnsured) return
  for (const s of REQUIRED_SCHEDULES) {
    await db.execute(sql`
      insert into job_schedule (job_name, hours_of_day, timezone, trading_days_only, enabled)
      values (${s.jobName}, ${JSON.stringify(s.hoursOfDay)}::jsonb, ${s.timezone}, false, true)
      on conflict (job_name) do nothing
    `)
  }
  schedulesEnsured = true
}

let lastCheck = 0
let busy = false

export async function maybePumpPipeline(now: Date = new Date()): Promise<void> {
  if (busy || Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()
  busy = true
  const deadline = Date.now() + BUDGET_MS

  try {
    await ensureSchedules()
    const schedules = await listEnabledSchedules()
    const due = schedules
      .filter((s) => !skipped(s.jobName) && HANDLERS[s.jobName])
      .map((s) => ({
        schedule: s,
        slot: catchUpSlot(
          {
            jobName: s.jobName,
            hoursOfDay: s.hoursOfDay,
            timezone: s.timezone,
            tradingDaysOnly: s.tradingDaysOnly,
            lastRunAt: s.lastRunAt,
          },
          now,
        ),
      }))
      .filter((d): d is { schedule: JobScheduleRow; slot: { due: true; slot: string; at: Date } } => !!d.slot?.due)
      .sort((a, b) => a.slot.at.getTime() - b.slot.at.getTime())

    for (const { schedule, slot } of due) {
      if (Date.now() > deadline - START_MARGIN_MS) break
      const finished = await pumpJob(schedule, slot.slot, now, deadline)
      // Job yang belum tuntas menahan job sesudahnya: skor yang dihitung dari
      // separuh ingest lebih buruk daripada skor yang menunggu sejam.
      if (!finished) break
    }
  } catch (err) {
    console.error('[AutoPipeline] gagal:', err instanceof Error ? err.message : err)
  } finally {
    busy = false
  }
}

async function pumpJob(schedule: JobScheduleRow, slot: string, now: Date, deadline: number): Promise<boolean> {
  const jobName = schedule.jobName
  const market = schedule.market ? fromDbMarket(schedule.market) : 'CRYPTO'

  const batches = WHOLE_SOURCE_JOBS.has(jobName)
    ? [[] as string[]]
    : chunk(
        (await listInstruments(market)).map((i) => i.symbol),
        batchSizeFor(jobName),
      )

  if (batches.length === 0) {
    await markScheduleRan(jobName, now)
    return true
  }

  for (const [index, symbols] of batches.entries()) {
    if (Date.now() > deadline - START_MARGIN_MS) return false

    const batchKey = `${slot}-b${index}`
    const claimed = await db.execute<{ id: number }>(sql`
      insert into job_run (job_name, batch_key, status, started_at)
      values (${jobName}, ${batchKey}, 'running', now())
      on conflict (job_name, batch_key) do nothing
      returning id
    `)
    if (claimed.length === 0) continue

    try {
      const r = await runJobBatch({ jobName, batchKey, symbols, market })
      console.log(`[AutoPipeline] ${jobName} ${batchKey}: ${r.status}, ${r.itemsProcessed} item, ${r.durationMs} ms`)
    } catch (err) {
      // Sudah tercatat `failed` di job_run; batch lain tetap jalan.
      console.error(`[AutoPipeline] ${jobName} ${batchKey} gagal:`, err instanceof Error ? err.message : err)
    }
  }

  await markScheduleRan(jobName, now)
  return true
}
