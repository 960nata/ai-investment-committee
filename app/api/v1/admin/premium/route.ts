/**
 * Pengaturan Premium — khusus admin.
 *
 * GET   pengaturan, pesanan terbaru, dan ringkasan pendapatan
 * PUT   simpan pengaturan (tampil/sembunyi, harga paket, batas per tingkat)
 * POST  beri atau cabut Premium satu akun secara manual
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import {
  adminSetPremium,
  getPremiumSettings,
  getPremiumStats,
  listRecentOrders,
  savePremiumSettings,
} from '@/lib/db/premium-queries'
import { PremiumSettingsSchema } from '@/lib/premium/plans'
import { isTripayConfigured } from '@/lib/payment/tripay'
import { NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

async function isAdmin(req: NextRequest): Promise<boolean> {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
}

const denied = () => NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return denied()
  try {
    const [settings, orders, stats] = await Promise.all([
      getPremiumSettings(),
      listRecentOrders(),
      getPremiumStats(),
    ])
    return NextResponse.json(
      { ok: true, data: { settings, orders, stats, tripayReady: isTripayConfigured() } },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[admin/premium GET]', err)
    return NextResponse.json({ ok: false, error: 'Gagal membaca pengaturan Premium.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin(req))) return denied()

  const body = await readJson(req)
  if (body === undefined) {
    return NextResponse.json({ ok: false, error: 'Permintaan bukan JSON yang sah.' }, { status: 400 })
  }

  const parsed = PremiumSettingsSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path[0] === 'plans' && typeof issue.path[1] === 'number' ? `Paket #${issue.path[1] + 1}: ` : ''
    return NextResponse.json({ ok: false, error: `${where}${issue?.message ?? 'Data tidak sah.'}` }, { status: 400 })
  }

  const ids = parsed.data.plans.map((p) => p.id)
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ ok: false, error: 'Kode paket tidak boleh kembar.' }, { status: 400 })
  }

  try {
    return NextResponse.json({ ok: true, data: await savePremiumSettings(parsed.data) }, { headers: NO_STORE })
  } catch (err) {
    console.error('[admin/premium PUT]', err)
    return NextResponse.json({ ok: false, error: 'Gagal menyimpan pengaturan Premium.' }, { status: 500 })
  }
}

const Grant = z.object({
  email: z.email('Alamat surel tidak sah.').trim().max(128),
  /** 0 = cabut Premium. */
  days: z.number().int().min(0).max(3650),
})

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return denied()

  const parsed = Grant.safeParse(await readJson(req))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak sah.' }, { status: 400 })
  }

  try {
    const result = await adminSetPremium(parsed.data.email, parsed.data.days)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 })
    return NextResponse.json(
      { ok: true, data: { premiumUntil: result.premiumUntil?.toISOString() ?? null } },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[admin/premium POST]', err)
    return NextResponse.json({ ok: false, error: 'Gagal mengubah status Premium.' }, { status: 500 })
  }
}
