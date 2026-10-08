/**
 * Pemindai setup binary teruji — tanpa model, tanpa kuota AI.
 *
 * Setup RSI ekstrem muncul dan hilang dalam hitungan menit. Autopilot
 * memindai di sini tiap ±30 detik dan baru memanggil desk AI (yang memakai
 * kuota) ketika setup benar-benar ada. Hasilnya di-cache singkat karena
 * semua pengguna melihat pasar yang sama.
 */

import { NextResponse } from 'next/server'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import { BINARY_SYMBOLS } from '@/lib/simulator/config'
import { PLAYBOOK, binarySetup, type PlaybookSetup } from '@/lib/simulator/playbook'
import { cryptoBars } from '@/lib/simulator/prices'
import { computeSignal } from '@/lib/simulator/signals'
import { closedBars } from '@/lib/simulator/desk'
import { failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const TTL_MS = 15_000
let cached: { at: number; setups: PlaybookSetup[]; rsi: Record<string, number | null> } | null = null

export async function GET() {
  const access = await resolveSimAccess()
  if (!access.ok) return NextResponse.json({ error: ACCESS_MESSAGE[access.reason] }, { status: 403, headers: NO_STORE })

  try {
    if (!cached || Date.now() - cached.at > TTL_MS) {
      const results = await Promise.allSettled(
        BINARY_SYMBOLS.map(async (symbol) => {
          // Candle tutup saja, sama dengan data uji playbook.
          const bars = closedBars(await cryptoBars(symbol, '1m', 121), 60_000)
          return computeSignal({ market: 'CRYPTO', symbol, name: symbol, timeframe: '1m' }, bars)
        }),
      )
      const setups: PlaybookSetup[] = []
      const rsi: Record<string, number | null> = {}
      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value) continue
        rsi[r.value.symbol] = r.value.rsi14
        const setup = binarySetup(r.value)
        if (setup) setups.push(setup)
      }
      cached = { at: Date.now(), setups, rsi }
    }
    return NextResponse.json(
      { data: { setups: cached.setups, rsi: cached.rsi, scannedAt: cached.at, playbook: PLAYBOOK } },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('simulator scan', err, 502)
  }
}
