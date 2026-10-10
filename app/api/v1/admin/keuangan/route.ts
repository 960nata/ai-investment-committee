/**
 * Buku kas project. POST menambah catatan manual, DELETE menghapusnya.
 * Pemasukan Premium tidak bisa dihapus dari sini: ia mengikuti data pembayaran.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { addLedgerEntry, deleteLedgerEntry, LEDGER_CATEGORIES } from '@/lib/project/store'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const entrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(['masuk', 'keluar']),
    category: z.string().min(1).max(48),
    amount: z.number().int().positive().max(1_000_000_000_000),
    description: z.string().max(255).default(''),
  })
  .refine((e) => LEDGER_CATEGORIES[e.kind].includes(e.category), { message: 'Kategori tidak cocok dengan jenis' })

async function isAdmin(request: Request) {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()
  let parsed
  try {
    parsed = entrySchema.safeParse(await request.json())
  } catch {
    return badRequest('Badan permintaan bukan JSON yang sah')
  }
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Isian tidak sah')
  try {
    const id = await addLedgerEntry(parsed.data)
    return NextResponse.json({ id }, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/keuangan POST', err)
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return badRequest('ID tidak sah')
  try {
    const ok = await deleteLedgerEntry(id)
    return ok
      ? NextResponse.json({ ok: true }, { headers: NO_STORE })
      : NextResponse.json({ error: 'Catatan tidak ditemukan atau bukan catatan manual' }, { status: 404, headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/keuangan DELETE', err)
  }
}
