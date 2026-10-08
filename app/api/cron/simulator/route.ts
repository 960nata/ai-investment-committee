/**
 * Pemicu autopilot simulator. Dipanggil QStash Schedules tiap beberapa menit
 * (lihat `scripts/setup-schedule.ts --path /api/cron/simulator`), dengan
 * `Authorization: Bearer <CRON_SECRET>` — penjaga yang sama dengan dispatcher.
 */

import { NextResponse } from 'next/server'
import { requireCron } from '@/lib/http/auth'
import { failure, unauthorized, NO_STORE } from '@/lib/http/errors'
import { runAutopilotTick } from '@/lib/simulator/autopilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const check = requireCron(request)
  if (!check.ok) {
    if (check.reason === 'not-configured') {
      return NextResponse.json({ error: 'Endpoint belum dikonfigurasi' }, { status: 503, headers: NO_STORE })
    }
    return unauthorized()
  }

  const startedAt = Date.now()
  try {
    // Sisakan ruang dari batas fungsi supaya putaran selalu sempat membalas.
    const report = await runAutopilotTick(startedAt + 240_000)
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, report }, { headers: NO_STORE })
  } catch (err) {
    return failure('cron/simulator', err)
  }
}

export const POST = GET
