import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { getInstrumentById } from '@/lib/db/queries'
import {
  addToWatchlist,
  listWatchlistIds,
  removeFromWatchlist,
} from '@/lib/db/member-queries'
import { getEntitlement } from '@/lib/db/premium-queries'
import { badRequest, failure, notFound, NO_STORE, unauthorized } from '@/lib/http/errors'
import { InstrumentId, readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ instrumentId: InstrumentId })

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  try {
    return NextResponse.json({ ids: await listWatchlistIds(user.uid) }, { headers: NO_STORE })
  } catch (err) {
    return failure('Watchlist GET', err)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    if (!(await getInstrumentById(body.data.instrumentId))) return notFound('Instrumen tidak ditemukan')
    const { limits, isPremium, forSale } = await getEntitlement(user.uid)
    const result = await addToWatchlist(user.uid, body.data.instrumentId, limits.watchlist)
    if (result === 'full') {
      return badRequest(
        `Watchlist maksimal ${limits.watchlist} instrumen${isPremium || !forSale ? '' : ' untuk akun gratis. Premium membuka batas lebih besar'}.`,
      )
    }
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE })
  } catch (err) {
    return failure('Watchlist POST', err)
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    await removeFromWatchlist(user.uid, body.data.instrumentId)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return failure('Watchlist DELETE', err)
  }
}
