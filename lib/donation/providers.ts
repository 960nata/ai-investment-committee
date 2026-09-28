/**
 * Katalog platform donasi dan bentuk data metode donasi.
 *
 * Dipakai bersama oleh panel admin, endpoint penyimpan, dan halaman publik,
 * supaya ketiganya tidak pernah berbeda pendapat soal alamat mana yang sah.
 *
 * Untuk platform yang dikenal, admin cukup mengisi nama pengguna — alamatnya
 * disusun di sini. Itu bukan sekadar kemudahan: tautan yang disusun dari nama
 * pengguna tidak bisa diarahkan ke situs tiruan, sedangkan tautan bebas bisa.
 * Tautan bebas tetap tersedia lewat `custom`, dengan syarat https.
 */

import { z } from 'zod'

export type ProviderRegion = 'id' | 'intl'

export interface DonationProvider {
  label: string
  region: ProviderRegion
  /** Warna aksen kartu di halaman publik. */
  color: string
  /** Contoh nama pengguna untuk placeholder admin. */
  example: string
  url(handle: string): string
}

export const PROVIDERS = {
  saweria: {
    label: 'Saweria',
    region: 'id',
    color: '#f5a623',
    example: 'namakamu',
    url: (h) => `https://saweria.co/${h}`,
  },
  trakteer: {
    label: 'Trakteer',
    region: 'id',
    color: '#be1e2d',
    example: 'namakamu',
    url: (h) => `https://trakteer.id/${h}`,
  },
  sociabuzz: {
    label: 'SocialBuzz Tribe',
    region: 'id',
    color: '#1fa2ff',
    example: 'namakamu',
    url: (h) => `https://sociabuzz.com/${h}/tribe`,
  },
  kofi: {
    label: 'Ko-fi',
    region: 'intl',
    color: '#29abe0',
    example: 'yourname',
    url: (h) => `https://ko-fi.com/${h}`,
  },
  buymeacoffee: {
    label: 'Buy Me a Coffee',
    region: 'intl',
    color: '#ffdd00',
    example: 'yourname',
    url: (h) => `https://buymeacoffee.com/${h}`,
  },
  paypal: {
    label: 'PayPal',
    region: 'intl',
    color: '#009cde',
    example: 'yourname',
    url: (h) => `https://paypal.me/${h}`,
  },
  github: {
    label: 'GitHub Sponsors',
    region: 'intl',
    color: '#db61a2',
    example: 'yourname',
    url: (h) => `https://github.com/sponsors/${h}`,
  },
  patreon: {
    label: 'Patreon',
    region: 'intl',
    color: '#ff424d',
    example: 'yourname',
    url: (h) => `https://www.patreon.com/${h}`,
  },
  liberapay: {
    label: 'Liberapay',
    region: 'intl',
    color: '#f6c915',
    example: 'yourname',
    url: (h) => `https://liberapay.com/${h}`,
  },
} satisfies Record<string, DonationProvider>

export type ProviderId = keyof typeof PROVIDERS
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

const HANDLE = /^[A-Za-z0-9._-]{1,64}$/

/**
 * Ambil nama pengguna dari isian admin.
 *
 * Admin sering menempelkan tautan utuh alih-alih nama penggunanya. Keduanya
 * diterima: dari tautan diambil segmen jalur yang memang nama pengguna, dan
 * sisanya dibuang.
 */
export function extractHandle(provider: ProviderId, input: string): string {
  const raw = input.trim().replace(/^@/, '')
  if (!/^https?:\/\//i.test(raw) && !raw.includes('/')) return raw

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const parts = url.pathname.split('/').filter(Boolean)
    if (provider === 'github' && parts[0] === 'sponsors') return parts[1] ?? ''
    return parts[0] ?? ''
  } catch {
    return raw
  }
}

/** Gambar QRIS hanya boleh dari berkas situs sendiri atau bucket unggahan. */
export function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!bucket) return false
  try {
    return new URL(value).origin === new URL(bucket).origin
  } catch {
    return false
  }
}

const optionalNote = z.string().trim().max(160).optional().default('')

const base = {
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  isActive: z.boolean().default(true),
  note: optionalNote,
}

export const DonationMethodSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('provider'),
    provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
    handle: z.string().trim().regex(HANDLE, 'Nama pengguna hanya boleh huruf, angka, titik, garis bawah, atau strip.'),
  }),
  z.object({
    ...base,
    kind: z.literal('custom'),
    label: z.string().trim().min(1, 'Nama tautan wajib diisi.').max(60),
    url: z
      .string()
      .trim()
      .max(300)
      .refine((v) => {
        try {
          return new URL(v).protocol === 'https:'
        } catch {
          return false
        }
      }, 'Tautan harus diawali https://'),
  }),
  z.object({
    ...base,
    kind: z.literal('qris'),
    label: z.string().trim().min(1).max(60),
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isAllowedImageUrl, 'Gambar QRIS harus diunggah lewat tombol unggah, atau berkas di /public.'),
  }),
  z.object({
    ...base,
    kind: z.literal('copy'),
    label: z.string().trim().min(1, 'Nama wajib diisi, misalnya "BCA" atau "USDT (TRC20)".').max(60),
    value: z.string().trim().min(1, 'Isi nomor rekening atau alamat dompet.').max(200),
  }),
])

export type DonationMethod = z.infer<typeof DonationMethodSchema>

export const DonationSettingsSchema = z.object({
  isEnabled: z.boolean(),
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  message: z.string().trim().max(1000),
  methods: z.array(DonationMethodSchema).max(20, 'Maksimal 20 metode.'),
})

export type DonationSettingsInput = z.infer<typeof DonationSettingsSchema>

/** Alamat tujuan metode bertautan; null untuk QRIS dan salin-tempel. */
export function methodHref(method: DonationMethod): string | null {
  if (method.kind === 'provider') return PROVIDERS[method.provider].url(method.handle)
  if (method.kind === 'custom') return method.url
  return null
}

/**
 * Baca larik JSONB dari basis data dengan aman.
 *
 * Butir yang bentuknya tidak lagi sah — misalnya platform yang dihapus dari
 * katalog — dibuang diam-diam alih-alih menjatuhkan seluruh halaman.
 */
export function parseStoredMethods(raw: unknown): DonationMethod[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = DonationMethodSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}
