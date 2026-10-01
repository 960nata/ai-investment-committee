/**
 * Penentuan job jatuh tempo
 *
 * Tier Hobby Vercel hanya mengizinkan sedikit cron, jadi ada satu cron per jam
 * dan seluruh penjadwalan halus pindah ke tabel `job_schedule`. Fungsi di file
 * ini yang memutuskan job mana yang jatuh tempo pada jam berjalan.
 *
 * Semua perbandingan waktu dilakukan pada zona waktu milik job, bukan UTC —
 * IDX tutup sore WIB, bursa US buka malam WIB, dan crypto tidak pernah tidur.
 * Fungsi-fungsi di sini murni: tanpa I/O, tanpa jam global, jadi bisa diuji.
 */

export interface SchedulePlan {
  jobName: string
  hoursOfDay: number[]
  timezone: string
  tradingDaysOnly: boolean
  lastRunAt: Date | null
}

export interface LocalSlot {
  /** Penanda satu jam kalender di zona waktu job, mis. "2026-09-18T16". */
  slot: string
  hour: number
  /** 0 = Minggu, 6 = Sabtu. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Pecah satu instan menjadi jam kalender di zona waktu tertentu.
 * Zona waktu yang tidak dikenal jatuh kembali ke UTC daripada melempar error —
 * satu baris jadwal yang salah ketik tidak boleh mematikan seluruh dispatcher.
 */
export function localSlot(instant: Date, timezone: string): LocalSlot {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(instant)
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(instant)
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  // Sebagian runtime memakai "24" untuk tengah malam pada hour12: false.
  const hour = Number(get('hour')) % 24

  return {
    slot: `${get('year')}-${get('month')}-${get('day')}T${String(hour).padStart(2, '0')}`,
    hour,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

export type DueDecision =
  | { due: true; slot: string }
  | { due: false; slot: string; reason: string }

/**
 * Jatuh tempo bila jam berjalan terdaftar di `hoursOfDay`, harinya sesuai, dan
 * job itu belum jalan pada jam kalender yang sama. Pemeriksaan terakhir adalah
 * pengunci idempotensi: cron yang terpicu dua kali dalam satu jam hanya
 * menghasilkan satu kali pengiriman batch.
 */
export function isDue(plan: SchedulePlan, now: Date): DueDecision {
  const current = localSlot(now, plan.timezone)

  if (!plan.hoursOfDay.includes(current.hour)) {
    return {
      due: false,
      slot: current.slot,
      reason: `jam ${current.hour} tidak ada di jadwal [${plan.hoursOfDay.join(', ')}]`,
    }
  }

  if (plan.tradingDaysOnly && (current.weekday === 0 || current.weekday === 6)) {
    return { due: false, slot: current.slot, reason: 'akhir pekan, job hanya hari bursa' }
  }

  if (plan.lastRunAt) {
    const previous = localSlot(plan.lastRunAt, plan.timezone)
    if (previous.slot === current.slot) {
      return { due: false, slot: current.slot, reason: 'sudah jalan pada jam ini' }
    }
  }

  return { due: true, slot: current.slot }
}

/** Batas 25–50 instrumen per batch menjaga tiap worker jauh di bawah batas waktu. */
export const BATCH_SIZE = 25

/**
 * Rapat komite jauh lebih mahal per simbol daripada ingest: empat panggilan
 * model berurutan, bukan satu panggilan HTTP. Dua simbol per batch menjaga tiap
 * worker tetap di bawah batas waktu function meski satu penyedia lambat
 * menjawab dan registry harus turun ke penyedia cadangan.
 */
export const COMMITTEE_BATCH_SIZE = 2

/**
 * Job yang bekerja atas seluruh sumbernya sekaligus, bukan per simbol: satu
 * berkas KSEI memuat semua saham, satu deret makro tidak punya simbol. Dibagi
 * per batch, job ini akan jalan berulang kali untuk pekerjaan yang sama.
 */
export const WHOLE_SOURCE_JOBS = new Set(['ingest-ksei-monthly', 'ingest-macro', 'ingest-external', 'warta-otomatis', 'warta-terjemah', 'evaluasi-alert', 'ringkasan-mingguan'])

export function batchSizeFor(jobName: string): number {
  return jobName.startsWith('komite-') ? COMMITTEE_BATCH_SIZE : BATCH_SIZE
}

/** Pecah daftar simbol jadi batch kecil agar tiap worker selesai di bawah batas waktu. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('Ukuran batch harus minimal 1')
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

/**
 * Slot terjadwal terakhir dalam 72 jam ke belakang (cukup untuk melompati akhir pekan), dan apakah job belum
 * menjalankannya.
 *
 * Berbeda dari `isDue`, yang hanya benar tepat pada jam terjadwal. Pemicu
 * kunjungan (lib/jobs/auto-pipeline.ts) datang kapan saja ada pengunjung —
 * di situs sepi, bisa saja tidak ada satu pun yang datang tepat pukul 17 WIB.
 * Yang ditanyakan di sini: "adakah jadwal yang terlewat sejak terakhir jalan?"
 * Hanya slot terakhir yang dikejar; jadwal yang terlewat berkali-kali cukup
 * dijalankan sekali, karena tiap job selalu mengambil data sampai hari ini.
 */
export function catchUpSlot(
  plan: SchedulePlan,
  now: Date,
): { due: boolean; slot: string; at: Date } | null {
  const HOUR = 3_600_000
  const top = Math.floor(now.getTime() / HOUR) * HOUR
  for (let back = 0; back < 72; back++) {
    const at = new Date(top - back * HOUR)
    const local = localSlot(at, plan.timezone)
    if (!plan.hoursOfDay.includes(local.hour)) continue
    if (plan.tradingDaysOnly && (local.weekday === 0 || local.weekday === 6)) continue
    const due = !plan.lastRunAt || plan.lastRunAt.getTime() < at.getTime()
    return { due, slot: local.slot, at }
  }
  return null
}
