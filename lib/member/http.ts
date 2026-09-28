/**
 * Potongan bersama untuk route alat investor (Beta).
 *
 * Tiap route tetap memanggil `getCurrentUser()` sendiri; yang dipusatkan di
 * sini hanya pembacaan badan JSON dan validasinya, supaya pesan galatnya
 * seragam di semua endpoint.
 */

import { z } from 'zod'
import { badRequest } from '@/lib/http/errors'
import type { NextResponse } from 'next/server'

export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: badRequest('Badan permintaan bukan JSON yang sah') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, response: badRequest(parsed.error.issues[0]?.message ?? 'Data tidak sah') }
  }
  return { ok: true, data: parsed.data }
}

/** Id bilangan bulat positif dari segmen URL; selainnya ditolak sebelum menyentuh basis data. */
export function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null
}

export const InstrumentId = z.number().int().positive().max(2 ** 31 - 1)

/** Isian posisi portofolio; dipakai saat membuat dan menyunting. */
export const PositionFields = z.object({
  quantity: z.number().positive('Jumlah harus lebih dari nol.').max(1e15),
  avgPrice: z.number().positive('Harga rata-rata harus lebih dari nol.').max(1e15),
  openedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD.')
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  note: z
    .string()
    .trim()
    .max(280, 'Catatan maksimal 280 huruf.')
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
})
