import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { deleteAlert, setAlertActive } from '@/lib/db/member-queries'
import { badRequest, failure, notFound, NO_STORE, unauthorized } from '@/lib/http/errors'
import { parseId, readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ isActive: z.boolean() })

export async function PATCH(request: Request, ctx: RouteContext<'/api/v1/user/alerts/[id]'>) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')
  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  try {
    const ok = await setAlertActive(user.uid, id, body.data.isActive)
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound('Alert tidak ditemukan')
  } catch (err) {
    return failure('Alerts PATCH', err)
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/v1/user/alerts/[id]'>) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseId((await ctx.params).id)
  if (id === null) return badRequest('Id tidak sah')

  try {
    const ok = await deleteAlert(user.uid, id)
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound('Alert tidak ditemukan')
  } catch (err) {
    return failure('Alerts DELETE', err)
  }
}
