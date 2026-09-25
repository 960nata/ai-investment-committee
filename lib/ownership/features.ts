/**
 * Fitur kepemilikan dari posisi KSEI bulanan.
 *
 * Aturan yang sama dengan fitur fundamental: tiap hari hanya memakai posisi yang
 * sudah bisa diketahui pada hari itu (`availableAt`), bukan posisi yang tanggalnya
 * sudah lewat. Posisi akhir Agustus baru terbit awal September.
 *
 * Penyebut semua persentase adalah total lembar yang tercatat di KSEI (lokal +
 * asing), bukan saham tercatat di bursa. KSEI hanya mencatat efek di sistem tanpa
 * warkat; untuk BBCA itu 52,5 dari 123,3 miliar lembar. Membagi dengan saham
 * tercatat membuat porsi asing BBCA tampak 29% padahal 69%, dan kesalahan itu
 * tidak memunculkan galat apa pun.
 */

import { KSEI_INVESTOR_TYPES } from '@/lib/db/schema'

export interface OwnershipPointLite {
  asOf: string
  availableAt: string
  local: number[]
  foreign: number[]
  localTotal: number
  foreignTotal: number
}

export const OWNERSHIP_FEATURES = [
  'asing_pct',
  'asing_chg_1b',
  'asing_chg_3b',
  'institusi_pct',
  'institusi_chg_3b',
] as const

/**
 * Posisi lebih tua dari ini dianggap basi. Berkas terbit tiap bulan; kalau yang
 * terakhir sudah lewat 70 hari, ada bulan yang gagal diambil, dan memakai angka
 * lama seolah-olah terkini akan menyamarkan lubang itu.
 */
const STALE_AFTER_DAYS = 70

/** Toleransi saat mencari posisi "N bulan lalu": akhir bulan tidak selalu sama tanggalnya. */
const MATCH_TOLERANCE_DAYS = 12

const INDIVIDU = KSEI_INVESTOR_TYPES.indexOf('ID')
const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)

function shares(p: OwnershipPointLite): { asing: number; institusi: number } | null {
  const total = p.localTotal + p.foreignTotal
  if (!(total > 0)) return null
  const individu = (p.local[INDIVIDU] ?? 0) + (p.foreign[INDIVIDU] ?? 0)
  return {
    asing: (p.foreignTotal / total) * 100,
    institusi: ((total - individu) / total) * 100,
  }
}

function monthsBefore(available: OwnershipPointLite[], ref: OwnershipPointLite, months: number) {
  const d = new Date(ms(ref.asOf))
  d.setUTCMonth(d.getUTCMonth() - months)
  const target = d.getTime()
  let best: OwnershipPointLite | null = null
  let bestGap = Infinity
  for (const p of available) {
    const gap = Math.abs(ms(p.asOf) - target) / DAY
    if (gap <= MATCH_TOLERANCE_DAYS && gap < bestGap) {
      best = p
      bestGap = gap
    }
  }
  return best
}

const empty = (): Record<string, number | null> =>
  Object.fromEntries(OWNERSHIP_FEATURES.map((k) => [k, null]))

/**
 * Fitur pada satu tanggal. `available` sudah disaring ke posisi yang terbit
 * pada atau sebelum tanggal itu, terbaru dulu.
 */
export function computeOwnershipFeatures(
  available: OwnershipPointLite[],
  date: string,
): Record<string, number | null> {
  const v = empty()
  const cur = available[0]
  if (!cur || (ms(date) - ms(cur.asOf)) / DAY > STALE_AFTER_DAYS) return v

  const now = shares(cur)
  if (!now) return v
  v.asing_pct = now.asing
  v.institusi_pct = now.institusi

  const m1 = monthsBefore(available, cur, 1)
  const p1 = m1 ? shares(m1) : null
  if (p1) v.asing_chg_1b = now.asing - p1.asing

  const m3 = monthsBefore(available, cur, 3)
  const p3 = m3 ? shares(m3) : null
  if (p3) {
    v.asing_chg_3b = now.asing - p3.asing
    v.institusi_chg_3b = now.institusi - p3.institusi
  }
  return v
}

/** Deret harian, satu nilai per tanggal di `dates` (urut naik). */
export function ownershipSeries(
  dates: readonly string[],
  points: OwnershipPointLite[],
): Record<string, (number | null)[]> {
  const sorted = [...points].sort((a, b) => b.asOf.localeCompare(a.asOf))
  const out: Record<string, (number | null)[]> = Object.fromEntries(
    OWNERSHIP_FEATURES.map((k) => [k, new Array<number | null>(dates.length).fill(null)]),
  )

  // Dihitung ulang hanya ketika himpunan posisi yang tersedia berubah, atau
  // ketika posisi terakhir melewati ambang basi — bukan tiap hari.
  let lastCount = -1
  let lastStale = false
  let cached = empty()
  for (let i = 0; i < dates.length; i++) {
    const available = sorted.filter((p) => p.availableAt <= dates[i])
    const stale = available.length > 0 && (ms(dates[i]) - ms(available[0].asOf)) / DAY > STALE_AFTER_DAYS
    if (available.length !== lastCount || stale !== lastStale) {
      cached = computeOwnershipFeatures(available, dates[i])
      lastCount = available.length
      lastStale = stale
    }
    for (const k of OWNERSHIP_FEATURES) out[k][i] = cached[k]
  }
  return out
}
