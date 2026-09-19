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

/** Pecah daftar simbol jadi batch kecil agar tiap worker selesai di bawah batas waktu. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('Ukuran batch harus minimal 1')
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}
