/**
 * Simulator trading — admin dan pengguna Premium.
 *
 * GET   keadaan satu dompet (?mode=binary|harian|bulanan|tahunan); posisi
 *       yang jatuh tempo diselesaikan dulu sebelum dikembalikan
 * POST  { action: 'open', trade }            buka posisi manual
 *       { action: 'close', mode, positionId } tutup posisi investasi sekarang
 *       { action: 'reset', mode }             kembalikan dompet ke $1.000
 *
 * Harga masuk dan keluar selalu dibaca server; badan permintaan hanya
 * membawa niat (simbol, arah, stake), tidak pernah angka harga.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import { OpenTradeSchema, SimModeSchema } from '@/lib/simulator/config'
import { SimRejectError, closeTradeNow, getSimState, openTrade } from '@/lib/simulator/engine'
import { resetAccount } from '@/lib/db/simulator-queries'
import { badRequest, failure, NO_STORE } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), trade: OpenTradeSchema }),
  z.object({ action: z.literal('close'), mode: SimModeSchema, positionId: z.number().int().positive() }),
  z.object({ action: z.literal('reset'), mode: SimModeSchema }),
])

function denied(reason: 'login' | 'disabled' | 'premium') {
  return NextResponse.json({ error: ACCESS_MESSAGE[reason], reason }, { status: reason === 'login' ? 401 : 403, headers: NO_STORE })
}

export async function GET(req: Request) {
  const access = await resolveSimAccess()
  if (!access.ok) return denied(access.reason)

  const mode = SimModeSchema.safeParse(new URL(req.url).searchParams.get('mode') ?? 'binary')
  if (!mode.success) return badRequest('Mode simulator tidak sah.')

  try {
    return NextResponse.json({ data: await getSimState(access.ownerKey, mode.data) }, { headers: NO_STORE })
  } catch (err) {
    return failure('simulator GET', err)
  }
}

export async function POST(req: Request) {
  const access = await resolveSimAccess()
  if (!access.ok) return denied(access.reason)

  const parsed = await readBody(req, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    if (body.action === 'open') {
      await openTrade(access.ownerKey, body.trade, { openedBy: 'manual' })
      const mode = body.trade.kind === 'binary' ? 'binary' : body.trade.mode
      return NextResponse.json({ data: await getSimState(access.ownerKey, mode) }, { headers: NO_STORE })
    }
    if (body.action === 'close') {
      await closeTradeNow(access.ownerKey, body.mode, body.positionId)
      return NextResponse.json({ data: await getSimState(access.ownerKey, body.mode) }, { headers: NO_STORE })
    }
    await resetAccount(access.ownerKey, body.mode)
    return NextResponse.json({ data: await getSimState(access.ownerKey, body.mode) }, { headers: NO_STORE })
  } catch (err) {
    if (err instanceof SimRejectError) return badRequest(err.message)
    return failure('simulator POST', err)
  }
}
