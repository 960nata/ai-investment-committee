/**
 * Pemindai setup binary teruji, dipakai bersama endpoint scan dan cron
 * autopilot. Tanpa model AI dan tanpa Redis: sepuluh permintaan candle ke
 * Binance, di-cache singkat karena semua dompet melihat pasar yang sama.
 */

import { BINARY_SYMBOLS } from './config'
import { binarySetup, type PlaybookSetup } from './playbook'
import { cryptoBars } from './prices'
import { computeSignal } from './signals'

const TTL_MS = 15_000
let cached: { at: number; setups: PlaybookSetup[]; rsi: Record<string, number | null> } | null = null

export async function scanBinarySetups(): Promise<{ at: number; setups: PlaybookSetup[]; rsi: Record<string, number | null> }> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  const results = await Promise.allSettled(
    BINARY_SYMBOLS.map(async (symbol) => {
      // Candle yang sudah tutup saja, sama dengan data uji playbook.
      const bars = (await cryptoBars(symbol, '1m', 121)).filter((b) => b.time + 60_000 <= Date.now())
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
  return cached
}
