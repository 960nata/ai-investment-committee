/**
 * Instrumen yang bisa diperdagangkan di simulator investasi.
 *
 * Indeks dibuang: tidak ada yang bisa membeli ^JKSE langsung, dan posisi di
 * atasnya hanya akan mengajari kebiasaan yang tidak ada padanannya di pasar.
 */

import { loadMarketView } from '@/lib/member/market-view'
import type { SimInstrumentOption } from './simulator-client'

const TRADABLE = new Set(['crypto', 'memecoin', 'saham', 'emas', 'komoditi'])

export async function loadSimInstrumentOptions(): Promise<SimInstrumentOption[]> {
  const view = await loadMarketView()
  return view
    .filter((r) => TRADABLE.has(r.assetClass) && r.candleCount > 0)
    .map((r) => ({ symbol: r.symbol, name: r.name, market: r.market.toUpperCase(), assetClass: r.assetClass }))
}
