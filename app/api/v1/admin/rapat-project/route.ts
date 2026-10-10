/**
 * Rapat project dari portal admin.
 *
 * POST { action: 'rapat', period } menggelar rapat dadakan atas rentang yang
 * berakhir sekarang. POST { action: 'pantau' } menjalankan pemantau mendesak
 * saat itu juga, tanpa model.
 */

import { NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { runProjectMeeting } from '@/lib/project/meeting'
import { runUrgentMonitor } from '@/lib/project/monitor'
import { REPORT_PERIODS, type ReportPeriod } from '@/lib/project/store'
import { reserveLlmBudget, refundLlmBudget } from '@/lib/http/budget'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  if (!((await verifyAdminSession()) || isRequestAdminAuthenticated(request))) return unauthorized()

  let body: { action?: unknown; period?: unknown }
  try {
    body = await request.json()
  } catch {
    return badRequest('Badan permintaan bukan JSON yang sah')
  }

  try {
    if (body.action === 'pantau') {
      const r = await runUrgentMonitor()
      return NextResponse.json({ open: r.open, fresh: r.fresh.length, notified: r.notified }, { headers: NO_STORE })
    }

    if (body.action !== 'rapat' || !REPORT_PERIODS.includes(body.period as ReportPeriod)) {
      return badRequest('Aksi atau periode tidak dikenal')
    }

    const budget = await reserveLlmBudget('scheduled')
    if (!budget.allowed) {
      return NextResponse.json({ error: `Pagu harian sudah habis (${budget.used}/${budget.ceiling}).` }, { status: 429, headers: NO_STORE })
    }
    const result = await runProjectMeeting(body.period as ReportPeriod, 'manual')
    if (result.limited) {
      await refundLlmBudget('scheduled')
      return NextResponse.json({ error: `Ditolak: ${result.skipped}. Coba lagi besok.` }, { status: 429, headers: NO_STORE })
    }
    if (result.status === 'tanpa-rapat') await refundLlmBudget('scheduled')
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/admin/rapat-project', err)
  }
}
