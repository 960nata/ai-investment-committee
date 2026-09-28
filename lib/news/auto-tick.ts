/**
 * Warta otomatis yang memicu dirinya sendiri dari lalu lintas pengunjung.
 *
 * Jalur resminya dispatcher → QStash → worker, dan jalur itu butuh dispatcher
 * dipanggil tiap jam. Di Vercel Hobby cron hanya boleh sekali sehari, dan tanpa
 * QStash worker di produksi menolak semua panggilan. Akibatnya warta berhenti
 * terbit tanpa ada yang menyadari.
 *
 * Jalur ini tidak bergantung pada keduanya. Beacon kunjungan memanggil
 * `maybeRunAutoNews()` lewat `after()` — setelah jawabannya terkirim, jadi
 * pengunjung tidak menunggu. Fungsi ini sangat murah di hampir semua panggilan
 * (pemeriksaan memori), dan hanya sesekali benar-benar menulis warta:
 *
 *   - hanya pukul 06.00–22.00 WIB,
 *   - paling banyak sekali per jendela 4 jam,
 *   - dilewati bila warta terakhir terbit kurang dari 3 jam lalu,
 *   - dikunci lewat baris `job_run` yang unik per jendela, sehingga dua
 *     pengunjung yang datang bersamaan tidak melahirkan dua warta.
 *
 * Jalur dispatcher tetap berlaku bila QStash dipasang; kunci jendela di sini
 * memakai `batch_key` sendiri sehingga keduanya tidak saling menimpa, dan
 * pemeriksaan "warta terakhir < 3 jam" mencegah terbit dobel.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { upsertJobRun } from '@/lib/db/queries'
import { localSlot } from '@/lib/jobs/due'
import { isLlmConfigured } from '@/lib/ai/registry'
import { runAutoNewsJob } from '@/lib/agents/auto-news'
import { translateMissingNews } from '@/lib/agents/news-translator'

const JOB_NAME = 'warta-otomatis'
const TIMEZONE = 'Asia/Jakarta'
const FIRST_HOUR = 6
const LAST_HOUR = 22
const WINDOW_HOURS = 4
const MIN_GAP_HOURS = 3
/** Pemeriksaan ke basis data paling sering sekali per ini, per proses. */
const CHECK_EVERY_MS = 10 * 60_000
/** Sisa waktu yang dibutuhkan sebelum mencoba menerjemahkan di putaran yang sama. */
const TRANSLATE_IF_UNDER_MS = 120_000

let lastCheck = 0

export async function maybeRunAutoNews(now: Date = new Date()): Promise<void> {
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()

  if (!isLlmConfigured()) return

  const local = localSlot(now, TIMEZONE)
  if (local.hour < FIRST_HOUR || local.hour > LAST_HOUR) return

  const [latest] = await db.execute<{ age_hours: number | null }>(sql`
    select extract(epoch from (now() - max(published_at))) / 3600 as age_hours from market_news
  `)
  const age = latest?.age_hours === null || latest?.age_hours === undefined ? Infinity : Number(latest.age_hours)
  if (age < MIN_GAP_HOURS) return

  // "2026-09-28T13" → "2026-09-28-w3": satu kunci untuk tiap jendela 4 jam.
  const day = local.slot.slice(0, 10)
  const batchKey = `auto-${day}-w${Math.floor(local.hour / WINDOW_HOURS)}`

  const claimed = await db.execute<{ id: number }>(sql`
    insert into job_run (job_name, batch_key, status, started_at)
    values (${JOB_NAME}, ${batchKey}, 'running', now())
    on conflict (job_name, batch_key) do nothing
    returning id
  `)
  if (claimed.length === 0) return

  const started = Date.now()
  console.log(`[AutoTick] ${batchKey}: warta terakhir ${Number.isFinite(age) ? age.toFixed(1) + ' jam' : 'tidak ada'} lalu, menulis warta`)

  try {
    const outcome = await runAutoNewsJob()
    await upsertJobRun({
      jobName: JOB_NAME,
      batchKey,
      status: 'success',
      itemsProcessed: outcome.published.length,
      stats: {
        trigger: 'kunjungan',
        published: outcome.published,
        skipped: outcome.skipped ?? null,
        headlinesSeen: outcome.headlinesSeen,
        durationMs: Date.now() - started,
      },
    })
    console.log(`[AutoTick] ${batchKey}: ${outcome.published.length} warta terbit${outcome.skipped ? ` (${outcome.skipped})` : ''}`)

    // Versi bahasa lain kalau waktunya masih cukup; sisanya dilengkapi
    // putaran berikutnya atau `npm run job warta-terjemah`.
    if (outcome.published.length > 0 && Date.now() - started < TRANSLATE_IF_UNDER_MS) {
      await translateMissingNews(2).catch((err) =>
        console.warn('[AutoTick] terjemahan gagal:', err instanceof Error ? err.message : err),
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[AutoTick] ${batchKey} gagal:`, message)
    await upsertJobRun({
      jobName: JOB_NAME,
      batchKey,
      status: 'failed',
      error: message.slice(0, 2000),
      stats: { trigger: 'kunjungan', durationMs: Date.now() - started },
    }).catch(() => {})
  }
}
