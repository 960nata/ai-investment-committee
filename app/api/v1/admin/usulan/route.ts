/**
 * Keputusan owner atas usulan perbaikan dari rapat project.
 *
 * POST { ids: number[], status, note? } — setujui, tolak, tandai selesai, atau
 * kembalikan ke "menunggu". Catatan owner dibaca rapat berikutnya, jadi alasan
 * penolakan ikut mencegah usulan yang sama muncul lagi.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { decideProposals, PROPOSAL_STATUSES } from '@/lib/project/proposals'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(PROPOSAL_STATUSES as unknown as [string, ...string[]]),
  note: z.string().max(1000).optional(),
})

export async function POST(request: Request) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(request))) return unauthorized()
  let parsed
  try {
    parsed = schema.safeParse(await request.json())
  } catch {
    return badRequest('Badan permintaan bukan JSON yang sah')
  }
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Isian tidak sah')
  try {
    const { ids, status, note } = parsed.data
    const updated = await decideProposals(ids, status as (typeof PROPOSAL_STATUSES)[number], note)
    return NextResponse.json({ updated }, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/usulan', err)
  }
}
