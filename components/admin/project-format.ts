import type { ProjectReportRow } from '@/lib/project/store'

export const WIB: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
export const DATE: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }

export function reportTitle(r: ProjectReportRow): string {
  const from = new Date(r.periodStart).toLocaleDateString('id-ID', DATE)
  const to = new Date(new Date(r.periodEnd).getTime() - 1).toLocaleDateString('id-ID', DATE)
  const label = r.period === 'harian' ? 'Laporan harian' : r.period === 'mingguan' ? 'Laporan mingguan' : 'Laporan bulanan'
  return `${label} · ${from === to ? from : `${from} – ${to}`}`
}

export function reportLead(r: ProjectReportRow): string {
  const pelapor = r.minutes.find((m) => m.role === 'pelapor')?.content ?? ''
  return pelapor.match(/^RINGKASAN:\s*(.+)$/m)?.[1] ?? r.note ?? 'Rapat tidak digelar; hanya angka dan temuan otomatis.'
}


/** Rupiah tanpa desimal, mis. "Rp 1.250.000". */
export function rupiah(n: number): string {
  return `${n < 0 ? '-' : ''}Rp ${Math.abs(n).toLocaleString('id-ID')}`
}
