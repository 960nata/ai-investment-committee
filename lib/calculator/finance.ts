/**
 * Rumus kalkulator investasi. Murni, tanpa I/O — dihitung di peramban, jadi
 * kalkulatornya tidak memakai server maupun kuota model sama sekali.
 *
 * Semua suku bunga dalam persen per tahun dan dimajemukkan bulanan, cara yang
 * sama dengan reksa dana dan tabungan berjangka pada umumnya.
 */

export interface DcaInput {
  initial: number
  monthly: number
  /** Imbal hasil tahunan, persen. */
  annualReturn: number
  years: number
  /** Inflasi tahunan, persen — untuk nilai riil. */
  inflation: number
  /** Kenaikan setoran bulanan tiap tahun, persen (mis. ikut naik gaji). */
  stepUp: number
}

export interface DcaYear {
  year: number
  contributed: number
  value: number
}

export interface DcaResult {
  contributed: number
  finalValue: number
  gain: number
  /** Nilai akhir dalam daya beli hari ini. */
  realValue: number
  schedule: DcaYear[]
}

export function simulateDca(input: DcaInput): DcaResult {
  const months = Math.max(1, Math.round(input.years * 12))
  const r = input.annualReturn / 100 / 12
  let value = input.initial
  let contributed = input.initial
  let monthly = input.monthly
  const schedule: DcaYear[] = []
  for (let m = 1; m <= months; m++) {
    value = value * (1 + r) + monthly
    contributed += monthly
    if (m % 12 === 0) {
      schedule.push({ year: m / 12, contributed, value })
      monthly *= 1 + input.stepUp / 100
    }
  }
  if (months % 12 !== 0) schedule.push({ year: months / 12, contributed, value })
  const realValue = value / Math.pow(1 + input.inflation / 100, months / 12)
  return { contributed, finalValue: value, gain: value - contributed, realValue, schedule }
}

export interface TargetInput {
  /** Target dalam uang hari ini. */
  target: number
  years: number
  current: number
  annualReturn: number
  inflation: number
}

export interface TargetResult {
  /** Target setelah disesuaikan inflasi — nominal yang benar-benar perlu dikumpulkan. */
  futureTarget: number
  /** Setoran bulanan yang dibutuhkan; 0 bila tabungan sekarang sudah cukup. */
  monthlyNeeded: number
  /** Nilai tabungan sekarang di akhir periode tanpa setoran tambahan. */
  currentGrows: number
  totalContribution: number
}

export function planTarget(input: TargetInput): TargetResult {
  const months = Math.max(1, Math.round(input.years * 12))
  const r = input.annualReturn / 100 / 12
  const futureTarget = input.target * Math.pow(1 + input.inflation / 100, months / 12)
  const growth = Math.pow(1 + r, months)
  const currentGrows = input.current * growth
  const gap = futureTarget - currentGrows
  const monthlyNeeded = gap <= 0 ? 0 : r === 0 ? gap / months : (gap * r) / (growth - 1)
  return { futureTarget, monthlyNeeded, currentGrows, totalContribution: monthlyNeeded * months }
}

export type HouseholdStatus = 'lajang' | 'menikah' | 'anak' | 'lepas'

/** Rentang bulan pengeluaran yang lazim disarankan perencana keuangan. */
export const EMERGENCY_MONTHS: Record<HouseholdStatus, [number, number]> = {
  lajang: [3, 6],
  menikah: [6, 9],
  anak: [9, 12],
  lepas: [12, 12],
}

export const HOUSEHOLD_LABEL: Record<HouseholdStatus, string> = {
  lajang: 'Lajang, penghasilan tetap',
  menikah: 'Menikah, tanpa anak',
  anak: 'Menikah, punya anak',
  lepas: 'Pekerja lepas / usaha sendiri',
}

export interface EmergencyResult {
  min: number
  max: number
  gap: number
  /** Bulan untuk mencapai batas bawah dengan setoran bulanan; null bila setoran 0. */
  monthsToMin: number | null
}

export function planEmergency(expense: number, status: HouseholdStatus, saved: number, monthlySave: number): EmergencyResult {
  const [lo, hi] = EMERGENCY_MONTHS[status]
  const min = expense * lo
  const max = expense * hi
  const gap = Math.max(0, min - saved)
  const monthsToMin = gap === 0 ? 0 : monthlySave > 0 ? Math.ceil(gap / monthlySave) : null
  return { min, max, gap, monthsToMin }
}

export type RiskProfile = 'konservatif' | 'moderat' | 'agresif'

/** Pertanyaan profil risiko; tiap jawaban bernilai 1 (hati-hati) sampai 3 (berani). */
export const RISK_QUESTIONS: { id: string; question: string; options: [string, number][] }[] = [
  {
    id: 'horizon',
    question: 'Kapan uang ini kira-kira akan dipakai?',
    options: [['Kurang dari 2 tahun', 1], ['2–5 tahun', 2], ['Lebih dari 5 tahun', 3]],
  },
  {
    id: 'drop',
    question: 'Kalau nilai investasimu turun 20% dalam sebulan, kamu akan…',
    options: [['Jual semua supaya tidak rugi lagi', 1], ['Diam dan menunggu', 2], ['Tambah beli selagi murah', 3]],
  },
  {
    id: 'income',
    question: 'Seberapa stabil penghasilanmu?',
    options: [['Tidak menentu', 1], ['Cukup stabil', 2], ['Sangat stabil, ada cadangan', 3]],
  },
  {
    id: 'experience',
    question: 'Pengalaman investasimu?',
    options: [['Belum pernah', 1], ['Reksa dana / emas', 2], ['Saham atau kripto', 3]],
  },
  {
    id: 'goal',
    question: 'Tujuan utamanya?',
    options: [['Menjaga nilai uang', 1], ['Tumbuh stabil', 2], ['Tumbuh setinggi mungkin', 3]],
  },
]

export function riskProfile(scores: number[]): RiskProfile {
  const total = scores.reduce((s, v) => s + v, 0)
  if (total <= 8) return 'konservatif'
  if (total <= 11) return 'moderat'
  return 'agresif'
}

export interface AllocationSlice {
  label: string
  pct: number
  note: string
}

/**
 * Alokasi acuan per profil. Angka bulat yang lazim dipakai sebagai titik awal,
 * bukan hasil optimasi — ditampilkan apa adanya sebagai gambaran umum.
 */
export const ALLOCATIONS: Record<RiskProfile, AllocationSlice[]> = {
  konservatif: [
    { label: 'Pasar uang / deposito', pct: 40, note: 'Likuid, fluktuasi sangat kecil' },
    { label: 'Obligasi / SBN ritel', pct: 35, note: 'Kupon tetap, dijamin negara untuk SBN' },
    { label: 'Saham / reksa dana saham', pct: 10, note: 'Porsi kecil untuk pertumbuhan' },
    { label: 'Emas', pct: 15, note: 'Lindung nilai saat krisis dan inflasi' },
  ],
  moderat: [
    { label: 'Pasar uang / deposito', pct: 20, note: 'Cadangan dan peluru saat pasar turun' },
    { label: 'Obligasi / SBN ritel', pct: 30, note: 'Penstabil portofolio' },
    { label: 'Saham / reksa dana saham', pct: 35, note: 'Mesin pertumbuhan jangka panjang' },
    { label: 'Emas', pct: 15, note: 'Lindung nilai' },
  ],
  agresif: [
    { label: 'Pasar uang / deposito', pct: 10, note: 'Cadangan minimum' },
    { label: 'Obligasi / SBN ritel', pct: 15, note: 'Peredam guncangan' },
    { label: 'Saham / reksa dana saham', pct: 55, note: 'Pertumbuhan, siap dengan naik-turun tajam' },
    { label: 'Emas', pct: 10, note: 'Lindung nilai' },
    { label: 'Kripto', pct: 10, note: 'Spekulatif — hanya uang yang siap hilang' },
  ],
}

/** Perkiraan imbal hasil tahunan kasar per profil, untuk mengisi kalkulator. */
export const PROFILE_RETURN: Record<RiskProfile, number> = { konservatif: 5, moderat: 8, agresif: 11 }
