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
import { SimModeSchema } from '@/lib/simulator/config'
import { runDesk } from '@/lib/simulator/desk'
import { getSimState } from '@/lib/simulator/engine'
import { refundLlmBudget, reserveLlmBudget, type SpendChannel } from '@/lib/http/budget'
import { failure, NO_STORE } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'
import { AllProvidersFailedError } from '@/lib/ai/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({ mode: SimModeSchema })

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
  const { mode } = parsed.data

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
