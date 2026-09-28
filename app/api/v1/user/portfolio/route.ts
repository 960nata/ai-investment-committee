import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { getInstrumentById } from '@/lib/db/queries'
import { createPosition, listPositions, PORTFOLIO_LIMIT } from '@/lib/db/member-queries'
import { badRequest, failure, notFound, NO_STORE, unauthorized } from '@/lib/http/errors'
import { InstrumentId, PositionFields, readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

const Body = PositionFields.extend({ instrumentId: InstrumentId })

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  try {
    return NextResponse.json({ positions: await listPositions(user.uid) }, { headers: NO_STORE })
  } catch (err) {
    return failure('Portfolio GET', err)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    if (!(await getInstrumentById(body.data.instrumentId))) return notFound('Instrumen tidak ditemukan')
    const result = await createPosition(user.uid, body.data)
    if (result === 'full') return badRequest(`Portofolio maksimal ${PORTFOLIO_LIMIT} posisi.`)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return failure('Portfolio POST', err)
  }
}
