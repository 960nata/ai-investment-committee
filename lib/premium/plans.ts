/**
 * Bentuk pengaturan Premium: paket, harga, dan batas per tingkat akun.
 *
 * Dipakai bersama oleh panel admin, endpoint penyimpan, halaman publik, dan
 * checkout, supaya keempatnya tidak pernah berbeda pendapat soal harga paket.
 * Harga yang dikirim ke Tripay SELALU dibaca dari sini di server — tidak pernah
 * dari badan permintaan peramban.
 */

import { z } from 'zod'

/** Tripay menolak nominal di bawah ini untuk sebagian besar kanal. */
export const MIN_PRICE = 10_000
export const MAX_PRICE = 50_000_000

export const PlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/),
  label: z.string().trim().min(1, 'Nama paket wajib diisi.').max(60),
  days: z.number().int().min(1, 'Durasi minimal 1 hari.').max(3650),
  price: z
    .number()
    .int('Harga harus bilangan bulat rupiah.')
    .min(MIN_PRICE, `Harga minimal Rp${MIN_PRICE.toLocaleString('id-ID')}.`)
    .max(MAX_PRICE),
  /** Harga coret opsional, untuk menampilkan hemat. 0 = tidak ada. */
  compareAt: z.number().int().min(0).max(MAX_PRICE).default(0),
  highlight: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export type PremiumPlan = z.infer<typeof PlanSchema>

const Limits = z.object({
  askPerDay: z.number().int().min(1).max(1000),
  watchlist: z.number().int().min(1).max(1000),
  alerts: z.number().int().min(1).max(1000),
})

export type TierLimits = z.infer<typeof Limits>

export const PremiumSettingsSchema = z
  .object({
    isEnabled: z.boolean(),
    title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
    message: z.string().trim().max(1000),
    benefits: z.array(z.string().trim().min(1).max(160)).max(12, 'Maksimal 12 poin keuntungan.'),
    plans: z.array(PlanSchema).max(6, 'Maksimal 6 paket.'),
    limits: z.object({ free: Limits, premium: Limits }),
  })
  .refine((s) => !s.isEnabled || s.plans.some((p) => p.isActive), {
    message: 'Nyalakan minimal satu paket sebelum menampilkan halaman Premium.',
  })

export type PremiumSettingsInput = z.infer<typeof PremiumSettingsSchema>

/**
 * Batas bawaan. Batas gratis sengaja sama dengan angka yang berlaku sebelum
 * Premium ada, supaya memasang fitur ini tidak diam-diam mengurangi apa pun
 * dari pengguna yang sudah ada.
 */
export const DEFAULT_LIMITS: { free: TierLimits; premium: TierLimits } = {
  free: { askPerDay: 15, watchlist: 50, alerts: 30 },
  premium: { askPerDay: 100, watchlist: 300, alerts: 150 },
}

export const DEFAULT_PLANS: PremiumPlan[] = [
  { id: 'bulanan', label: '1 Bulan', days: 30, price: 39_000, compareAt: 0, highlight: false, isActive: true },
  { id: 'kuartal', label: '3 Bulan', days: 90, price: 99_000, compareAt: 117_000, highlight: true, isActive: true },
  { id: 'tahunan', label: '1 Tahun', days: 365, price: 349_000, compareAt: 468_000, highlight: false, isActive: true },
]

export const DEFAULT_BENEFITS = [
  'Model AI paling cerdas untuk Tanya Komite',
  'Kuota Tanya Komite jauh lebih besar per hari',
  'Watchlist dan alert lebih banyak',
  'Lencana Premium di profil',
]

/** Baca larik paket dari JSONB; butir yang rusak dibuang, bukan menjatuhkan halaman. */
export function parseStoredPlans(raw: unknown): PremiumPlan[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = PlanSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export function parseStoredBenefits(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 12)
}

export function parseStoredLimits(raw: unknown): { free: TierLimits; premium: TierLimits } {
  const parsed = z.object({ free: Limits, premium: Limits }).safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_LIMITS
}

export function formatRupiah(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`
}
