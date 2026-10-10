/**
 * Ruang komite admin.
 *
 * GET dipanggil ulang tiap beberapa detik oleh layar ruang komite: sidang yang
 * sedang/baru berjalan dengan gilirannya, umpan panggilan model terakhir, dan
 * keadaan kolam kunci tiap penyedia. Semuanya pembacaan; tidak ada model yang
 * dipanggil di sini.
 *
 * POST membuka sidang baru dari ruang itu. Giliran tercatat ke basis data satu
 * per satu, jadi layar yang sedang menyegarkan diri melihat agen bicara
 * bergantian selagi permintaan ini masih berjalan.
 */

import { NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { runCommittee } from '@/lib/agents/committee'
import { getCommitteeRoomSnapshot } from '@/lib/agents/committee-room'
import { refundLlmBudget, reserveLlmBudget } from '@/lib/http/budget'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import { SYMBOL_PATTERN } from '@/lib/format/market'
import type { MarketCode } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
/** Lima giliran berurutan, lebih bila ada yang harus jatuh ke cadangan. */
export const maxDuration = 60

const MARKETS: readonly MarketCode[] = ['CRYPTO', 'IDX', 'US', 'GLOBAL']

async function isAdmin(request: Request): Promise<boolean> {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
}

export async function GET(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()

  try {
    return NextResponse.json(await getCommitteeRoomSnapshot(), { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/ruang-komite', err)
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()

  let body: { market?: unknown; symbol?: unknown }
  try {
    body = await request.json()
  } catch {
    return badRequest('Badan permintaan bukan JSON yang sah')
  }

  const { market, symbol } = body
  if (typeof market !== 'string' || !MARKETS.includes(market as MarketCode)) return badRequest('Market tidak dikenal')
  if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) return badRequest('Symbol tidak sah')

  // Sidang admin tetap memakai kuota gratisan yang sama, jadi ikut pagu harian
  // jalur terjadwal — bukan pagu pengguna, bukan tanpa batas.
  const budget = await reserveLlmBudget('scheduled')
  if (!budget.allowed) {
    return NextResponse.json(
      { error: `Pagu harian sudah habis (${budget.used}/${budget.ceiling}).` },
      { status: 429, headers: NO_STORE },
    )
  }

  try {
    const upper = symbol.toUpperCase()
    const result = await runCommittee({
      market: market as MarketCode,
      symbol: upper,
      sessionKey: `admin-room-${upper}-${Date.now()}`,
      reuse: false,
    })
    if (result.turns.length === 0) await refundLlmBudget('scheduled')
    return NextResponse.json(
      { sessionId: result.sessionId, verdict: result.verdict, skippedReason: result.skippedReason ?? null },
      { headers: NO_STORE },
    )
  } catch (err) {
    await refundLlmBudget('scheduled')
    return failure('api/v1/admin/ruang-komite POST', err)
  }
}
