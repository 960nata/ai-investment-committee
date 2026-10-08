/**
 * Jalankan satu rapat desk AI di dompet simulator, lalu eksekusi putusannya.
 *
 * Satu rapat = empat panggilan model, dihitung satu satuan pagu harian —
 * sama dengan satu rapat komite. Pengguna Premium memakai jatah per akun
 * yang sama dengan Tanya Komite, supaya autopilot simulator tidak bisa
 * menghabiskan kunci model milik seluruh situs.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import { MODE_INFO, SimModeSchema } from '@/lib/simulator/config'
import { claimDeskSlot, getOrCreateAccount } from '@/lib/db/simulator-queries'
import { runDesk } from '@/lib/simulator/desk'
import { getSimState } from '@/lib/simulator/engine'
import { refundLlmBudget, reserveLlmBudget, type SpendChannel } from '@/lib/http/budget'
import { failure, NO_STORE } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'
import { AllProvidersFailedError } from '@/lib/ai/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({
  mode: SimModeSchema,
  /** Dipicu autopilot di peramban: tunduk pada kunci jeda yang sama dengan cron. */
  auto: z.boolean().optional(),
})

export async function POST(req: Request) {
  const access = await resolveSimAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: ACCESS_MESSAGE[access.reason], reason: access.reason },
      { status: access.reason === 'login' ? 401 : 403, headers: NO_STORE },
    )
  }

  const parsed = await readBody(req, Body)
  if (!parsed.ok) return parsed.response
  const { mode, auto } = parsed.data

  // Autopilot dari peramban dan dari cron berbagi satu kunci per dompet, jadi
  // keduanya tidak pernah bersidang ganda di dompet yang sama.
  if (auto) {
    const account = await getOrCreateAccount(access.ownerKey, mode)
    const gap = mode === 'binary' ? 60 : (MODE_INFO[mode].autopilotSeconds ?? 3600)
    if (!account.autopilot || !(await claimDeskSlot(account.id, gap))) {
      return NextResponse.json(
        { data: { result: { decision: null, executed: [], skipped: true }, state: await getSimState(access.ownerKey, mode) } },
        { headers: NO_STORE },
      )
    }
  }

  // Admin memakai jatah terjadwal: ia pemilik kunci, dan pengujiannya tidak
  // boleh terkunci oleh ramainya lalu lintas publik hari itu.
  const channel: SpendChannel = access.isAdmin ? 'scheduled' : 'public'
  const budgetOptions = { userId: access.userId ?? undefined, perUserLimit: access.askPerDay ?? undefined }
  const budget = await reserveLlmBudget(channel, budgetOptions)
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error:
          budget.scope === 'user'
            ? `Jatah AI hari ini habis (${budget.ceiling} rapat/pertanyaan). Coba lagi besok.`
            : 'Kuota AI seluruh situs untuk hari ini sudah habis. Coba lagi besok.',
      },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(budget.resetSeconds) } },
    )
  }

  try {
    const result = await runDesk(access.ownerKey, mode)
    if (result.turns.length === 0) await refundLlmBudget(channel, budgetOptions)
    const state = await getSimState(access.ownerKey, mode)
    return NextResponse.json({ data: { result, state } }, { headers: NO_STORE })
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      await refundLlmBudget(channel, budgetOptions)
      return NextResponse.json(
        { error: 'Semua penyedia AI sedang sibuk atau habis kuota. Coba beberapa menit lagi.' },
        { status: 503, headers: NO_STORE },
      )
    }
    return failure('simulator desk', err)
  }
}
