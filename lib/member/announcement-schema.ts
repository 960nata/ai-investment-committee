/**
 * Validasi isian pengumuman admin. Dipakai route buat dan sunting.
 *
 * Tautan hanya boleh relatif ke situs ini atau https. Pengumuman tampil di
 * depan semua pengguna, jadi satu `javascript:` yang lolos di sini sama dengan
 * menyuntikkan skrip ke seluruh dashboard.
 */

import { z } from 'zod'
import { ANNOUNCEMENT_TONES } from '@/lib/db/member-queries'

const SafeLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^\/(?!\/)/.test(v) || /^https:\/\//i.test(v), 'Tautan harus diawali "/" atau "https://".')

const OptionalDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal tidak sah.' })
      return z.NEVER
    }
    return d
  })

const Base = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 huruf.').max(160, 'Judul maksimal 160 huruf.'),
  body: z.string().trim().min(3, 'Isi minimal 3 huruf.').max(1000, 'Isi maksimal 1000 huruf.'),
  tone: z.enum(ANNOUNCEMENT_TONES),
  linkUrl: SafeLink.nullable().optional().transform((v) => (v ? v : null)),
  linkLabel: z
    .string()
    .trim()
    .max(64, 'Label tautan maksimal 64 huruf.')
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean(),
  startsAt: OptionalDate,
  endsAt: OptionalDate,
})

export const AnnouncementFields = Base.extend({
  tone: z.enum(ANNOUNCEMENT_TONES).default('info'),
  isActive: z.boolean().default(true),
})

/**
 * Sunting sebagian. Tanpa nilai bawaan: mematikan pengumuman tidak boleh
 * diam-diam mengembalikan nadanya ke `info`.
 */
export const AnnouncementPatch = Base.partial()
