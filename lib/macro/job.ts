/**
 * Job makro: ambil seluruh deret di MACRO_SERIES, simpan apa adanya.
 *
 * Seluruh riwayat diambil ulang tiap kali. Deretnya kecil (ratusan baris per
 * deret) dan sumbernya merevisi angka lama, jadi mengambil ulang lebih benar
 * daripada hanya menambah ujungnya.
 */

import { MACRO_SERIES, fetchMacroSeries, ERP_INDONESIA, capTerminalGrowth } from './sources'
import { upsertMacro, latestMacro, lastMacro } from '@/lib/db/macro-queries'

export interface MacroJobResult {
  seriesProcessed: number
  rowsWritten: number
  errors: string[]
}

export async function runMacroJob(): Promise<MacroJobResult> {
  const result: MacroJobResult = { seriesProcessed: 0, rowsWritten: 0, errors: [] }
  for (const spec of MACRO_SERIES) {
    try {
      const points = await fetchMacroSeries(spec)
      if (points.length === 0) throw new Error('tidak ada titik data')
      result.rowsWritten += await upsertMacro(points)
      result.seriesProcessed++
    } catch (err) {
      result.errors.push(`${spec.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}

export interface MacroAssumptions {
  rfUs: { value: number; asOf: string } | null
  /** Belum punya sumber otomatis — SBN 10 tahun tidak tersedia di FRED maupun World Bank. */
  rfIndonesia: null
  erpIndonesia: number
  /** CAGR PDB nominal 10 tahun. */
  nominalGdpGrowth: { IDN: number | null; USA: number | null }
  terminalGrowthCap: { IDN: number; USA: number }
}

/**
 * Pertumbuhan PDB nominal jangka panjang: CAGR sepuluh tahun terakhir.
 *
 * Bukan pertumbuhan satu tahun. Satu tahun bisa sangat melenceng — tahun
 * pemulihan setelah resesi, atau tahun inflasi tinggi — dan batas g_terminal
 * yang diambil dari tahun seperti itu terlalu longgar untuk "selamanya".
 */
const GROWTH_YEARS = 10

async function nominalGrowth(country: 'IDN' | 'USA'): Promise<number | null> {
  const rows = await lastMacro(`WB:${country}:NY.GDP.MKTP.CN`, GROWTH_YEARS + 1)
  if (rows.length < GROWTH_YEARS + 1) return null
  const now = rows[0].value
  const then = rows[GROWTH_YEARS].value
  if (!(then > 0) || !(now > 0)) return null
  return Math.pow(now / then, 1 / GROWTH_YEARS) - 1
}

/**
 * Parameter model jangka panjang yang sudah bisa diisi dari data. Tidak ada satu
 * pun model di kode yang membacanya saat ini — ini fondasi untuk DCF, bukan DCF.
 */
export async function macroAssumptions(): Promise<MacroAssumptions> {
  const gs10 = await latestMacro('FRED:GS10')
  const g = { IDN: await nominalGrowth('IDN'), USA: await nominalGrowth('USA') }
  return {
    rfUs: gs10 ? { value: gs10.value / 100, asOf: gs10.date } : null,
    rfIndonesia: null,
    erpIndonesia: ERP_INDONESIA,
    nominalGdpGrowth: g,
    terminalGrowthCap: {
      IDN: capTerminalGrowth(Infinity, g.IDN).value,
      USA: capTerminalGrowth(Infinity, g.USA).value,
    },
  }
}
