import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { deletePosition, updatePosition } from '@/lib/db/member-queries'
import { badRequest, failure, notFound, NO_STORE, unauthorized } from '@/lib/http/errors'
import { parseId, PositionFields, readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, ctx: RouteContext<'/api/v1/user/portfolio/[id]'>) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')
  const body = await readBody(request, PositionFields)
  if (!body.ok) return body.response

  try {
    const ok = await updatePosition(user.uid, id, body.data)
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound('Posisi tidak ditemukan')
  } catch (err) {
    return failure('Portfolio PATCH', err)
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/v1/user/portfolio/[id]'>) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')

  try {
    const ok = await deletePosition(user.uid, id)
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound('Posisi tidak ditemukan')
  } catch (err) {
    return failure('Portfolio DELETE', err)
  }
}
