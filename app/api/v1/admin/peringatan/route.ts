/**
 * Peringatan project untuk lonceng dan lencana portal admin.
 *
 * GET hanya membaca `project_alert` — murah, aman disegarkan tiap menit.
 * POST { ids?: number[] } menandai peringatan sudah dilihat; tanpa `ids`, semua.
 */

import { NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { acknowledgeAlerts, alertSummary } from '@/lib/project/store'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

async function isAdmin(request: Request) {
  return (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
}

export async function GET(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()
  try {
    return NextResponse.json(await alertSummary(), { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/peringatan', err)
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized()
  let ids: number[] | undefined
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
    if (body.ids !== undefined) {
      if (!Array.isArray(body.ids) || !body.ids.every((id) => Number.isInteger(id) && id > 0)) {
        return badRequest('ids harus daftar bilangan bulat positif')
      }
      ids = (body.ids as number[]).slice(0, 100)
    }
    const acknowledged = await acknowledgeAlerts(ids)
    return NextResponse.json({ acknowledged }, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/peringatan POST', err)
  }
}
