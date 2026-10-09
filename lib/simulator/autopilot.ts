/**
 * Autopilot server — desk AI berjalan dari cron, walau halaman simulator
 * tidak dibuka siapa pun.
 *
 * Tiap putaran (dipicu `/api/cron/simulator` tiap beberapa menit):
 *   1. dompet yang autopilotnya menyala dibaca, yang paling lama tidak
 *      bersidang lebih dulu;
 *   2. hak aksesnya diperiksa ulang — Premium habis atau sakelar admin mati
 *      langsung mematikan autopilot dompet itu;
 *   3. binary: pasar dipindai sekali (tanpa AI); desk hanya bersidang bila ada
 *      setup teruji yang belum dipegang dompet itu. Tanpa setup, posisi yang
 *      jatuh tempo tetap diselesaikan;
 *   4. investasi: desk bersidang sesuai jeda modenya.
 *
 * Satu sidang ±25–45 detik, jadi satu putaran hanya menjalankan sidang
 * selama waktunya cukup; dompet lain mendapat giliran pada putaran berikut.
 */

import { AllProvidersFailedError } from '@/lib/ai/registry'
import { refundLlmBudget, reserveLlmBudget, type SpendChannel } from '@/lib/http/budget'
import { claimDeskSlot, listAutopilotAccounts, listOpenPositions, setAutopilot } from '@/lib/db/simulator-queries'
import { resolveOwnerAccess } from './access'
import { MODE_INFO, SimModeSchema, type SimMode } from './config'
import { runDesk } from './desk'
import { getSimState } from './engine'
import { scanBinarySetups } from './scan'

/** Waktu minimum yang harus tersisa sebelum memulai satu sidang desk. */
const DESK_BUDGET_MS = 50_000

export interface TickEntry {
  owner: string
  mode: SimMode
  action: 'desk' | 'settled' | 'skipped' | 'disabled' | 'error'
  detail: string
}

export async function runAutopilotTick(deadline: number): Promise<TickEntry[]> {
  const report: TickEntry[] = []
  const accounts = await listAutopilotAccounts()
  let scan: Awaited<ReturnType<typeof scanBinarySetups>> | null = null

  for (const account of accounts) {
    const parsed = SimModeSchema.safeParse(account.mode)
    if (!parsed.success) continue
    const mode = parsed.data
    const entry = (action: TickEntry['action'], detail: string) =>
      report.push({ owner: account.ownerKey, mode, action, detail })

    try {
      const access = await resolveOwnerAccess(account.ownerKey)
      if (!access.ok) {
        await setAutopilot(account.ownerKey, mode, false)
        entry('disabled', `autopilot dimatikan: ${access.reason}`)
        continue
      }

      const outOfTime = deadline - Date.now() < DESK_BUDGET_MS
      if (mode === 'binary') {
        scan ??= await scanBinarySetups()
        const held = new Set((await listOpenPositions(account.id)).map((p) => p.symbol))
        const fresh = scan.setups.filter((x) => !held.has(x.symbol))
        if (fresh.length === 0 || outOfTime) {
          // Tetap selesaikan binary yang sudah kedaluwarsa supaya saldo segar.
          await getSimState(account.ownerKey, mode)
          entry(outOfTime ? 'skipped' : 'settled', outOfTime ? 'waktu putaran habis' : 'tidak ada setup teruji')
          continue
        }
      } else if (outOfTime) {
        entry('skipped', 'waktu putaran habis')
        continue
      }

      const gap = mode === 'binary' ? 60 : (MODE_INFO[mode].autopilotSeconds ?? 3600)
      if (!(await claimDeskSlot(account.id, gap))) {
        await getSimState(account.ownerKey, mode)
        entry('settled', 'belum waktunya bersidang lagi')
        continue
      }

      if (mode === 'binary') {
        // Playbook tanpa model: tidak menyentuh jatah AI.
        const result = await runDesk(account.ownerKey, mode)
        const opened = result.executed.filter((e) => e.ok).length
        entry('desk', `${opened} posisi dibuka — ${result.decision?.summary ?? ''}`.slice(0, 300))
        continue
      }

      const channel: SpendChannel = access.isAdmin ? 'scheduled' : 'public'
      const budgetOptions = { userId: access.userId ?? undefined, perUserLimit: access.askPerDay ?? undefined }
      const budget = await reserveLlmBudget(channel, budgetOptions)
      if (!budget.allowed) {
        entry('skipped', 'jatah AI harian habis')
        continue
      }

      try {
        const result = await runDesk(account.ownerKey, mode)
        if (result.turns.length === 0) await refundLlmBudget(channel, budgetOptions)
        const opened = result.executed.filter((e) => e.ok).length
        entry('desk', `${opened} posisi dibuka — ${result.decision?.summary ?? ''}`.slice(0, 300))
      } catch (err) {
        if (err instanceof AllProvidersFailedError) await refundLlmBudget(channel, budgetOptions)
        throw err
      }
    } catch (err) {
      entry('error', err instanceof Error ? err.message.slice(0, 300) : String(err))
    }
  }
  return report
}
