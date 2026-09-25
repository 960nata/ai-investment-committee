/**
 * Job KSEI: unduh komposisi kepemilikan per bulan, simpan untuk saham yang
 * dipantau.
 *
 * Hanya saham yang ada di tabel `instrument` yang disimpan. Berkas KSEI memuat
 * seribu lebih saham; menyimpan semuanya berarti menyimpan data yang tidak
 * pernah dibaca siapa pun, di basis data yang ruangnya terbatas.
 */

import { fetchKseiMonth, kseiAvailableAt } from './ksei'
import { idxCodeMap, ownershipMonthsStored, upsertOwnership, type OwnershipInput } from '@/lib/db/ownership-queries'

export interface KseiJobInput {
  /** YYYY-MM. Bawaan: tiga bulan terakhir. */
  from?: string
  to?: string
  /** Unduh ulang bulan yang sudah tersimpan. Bawaan: dilewati, kecuali bulan terakhir. */
  refresh?: boolean
}

export interface KseiJobResult {
  monthsProcessed: number
  monthsMissing: string[]
  monthsSkipped: number
  rowsWritten: number
  unmatchedCodes: number
  /** Bulan yang dipakai untuk menghitung `unmatchedCodes`. */
  unmatchedMonth: string | null
  errors: string[]
}

function monthRange(from: string, to: string): { y: number; m: number; key: string }[] {
  const out: { y: number; m: number; key: string }[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ y, m, key: `${y}-${String(m).padStart(2, '0')}` })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7)
}

export async function runKseiJob(input: KseiJobInput = {}): Promise<KseiJobResult> {
  const now = new Date()
  const to = input.to ?? isoMonth(now)
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
  const from = input.from ?? isoMonth(fromDate)

  const result: KseiJobResult = {
    monthsProcessed: 0, monthsMissing: [], monthsSkipped: 0, rowsWritten: 0, unmatchedCodes: 0, unmatchedMonth: null, errors: [],
  }

  const codes = await idxCodeMap()
  const stored = input.refresh ? new Set<string>() : await ownershipMonthsStored()
  const months = monthRange(from, to)
  const latest = months[months.length - 1]?.key

  for (const { y, m, key } of months) {
    // Bulan terakhir selalu diambil ulang: berkasnya bisa belum terbit saat job
    // sebelumnya berjalan.
    if (stored.has(key) && key !== latest) {
      result.monthsSkipped++
      continue
    }
    try {
      const file = await fetchKseiMonth(y, m)
      if (!file) {
        result.monthsMissing.push(key)
        continue
      }
      const rows: OwnershipInput[] = []
      for (const r of file.rows) {
        const id = codes.get(r.code)
        if (id === undefined) continue
        rows.push({
          instrumentId: id,
          asOf: r.asOf,
          availableAt: kseiAvailableAt(r.asOf),
          sharesListed: r.sharesListed,
          price: r.price,
          local: r.local,
          foreign: r.foreign,
          localTotal: r.localTotal,
          foreignTotal: r.foreignTotal,
        })
      }
      // Ditimpa tiap bulan yang diproses, dan bulan diproses urut naik, jadi
      // nilai akhirnya milik bulan terbaru yang benar-benar punya berkas. Di
      // bulan-bulan lama wajar ada saham yang belum IPO; yang bermakna adalah saham
      // dipantau yang tidak ada di berkas terbaru — tanda kode salah atau delisting.
      const matched = new Set(rows.map((r) => r.instrumentId))
      result.unmatchedCodes = codes.size - matched.size
      result.unmatchedMonth = key
      result.rowsWritten += await upsertOwnership(rows)
      result.monthsProcessed++
    } catch (err) {
      result.errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}
