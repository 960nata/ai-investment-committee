/**
 * Pemindai setup binary teruji — tanpa model, tanpa kuota AI. Dipakai kotak
 * "Sinyal teruji" di tiket binary; autopilot server memakai pemindai yang sama.
 */

import { NextResponse } from 'next/server'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import { PLAYBOOK } from '@/lib/simulator/playbook'
import { scanBinarySetups } from '@/lib/simulator/scan'
import { failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolveSimAccess()
  if (!access.ok) return NextResponse.json({ error: ACCESS_MESSAGE[access.reason] }, { status: 403, headers: NO_STORE })

  try {
    const scan = await scanBinarySetups()
    return NextResponse.json(
      { data: { setups: scan.setups, rsi: scan.rsi, scannedAt: scan.at, playbook: PLAYBOOK } },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('simulator scan', err, 502)
  }
}
