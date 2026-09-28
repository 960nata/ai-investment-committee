'use client'

/**
 * Cadangan isi pita harga di header.
 *
 * Pita biasanya diisi dari basis data (penutupan tersimpan). Kalau basis data
 * tidak terbaca — env produksi kosong, koneksi putus, instrumen belum
 * di-seed — pita dulu diam-diam hilang. Hook ini mengisinya dengan harga
 * langsung dari bursa lewat `/api/quotes/live`, endpoint yang tidak menyentuh
 * basis data sama sekali (Binance untuk kripto, Yahoo untuk sisanya).
 *
 * Hanya berjalan saat dibutuhkan (`enabled`), dan diperbarui tiap menit
 * selama tab terlihat.
 */

import { useEffect, useState } from 'react'
import type { MarqueeTicker } from './market-marquee'

interface FallbackAsset {
  symbol: string
  name: string
  category: string
  assetClass: string
}

/** Aset sorotan per kelas, diselang-seling seperti pita dari basis data. */
const FALLBACK_ASSETS: FallbackAsset[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'KRIPTO', assetClass: 'crypto' },
  { symbol: 'BBCA.JK', name: 'Bank Central Asia', category: 'SAHAM', assetClass: 'saham' },
  { symbol: 'GC=F', name: 'Emas', category: 'EMAS', assetClass: 'emas' },
  { symbol: 'BZ=F', name: 'Minyak Brent', category: 'KOMODITI', assetClass: 'komoditi' },
  { symbol: '^JKSE', name: 'IHSG', category: 'INDEKS', assetClass: 'indeks' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'KRIPTO', assetClass: 'crypto' },
  { symbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia', category: 'SAHAM', assetClass: 'saham' },
  { symbol: 'CL=F', name: 'Minyak WTI', category: 'KOMODITI', assetClass: 'komoditi' },
  { symbol: '^GSPC', name: 'S&P 500', category: 'INDEKS', assetClass: 'indeks' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'KRIPTO', assetClass: 'crypto' },
  { symbol: 'BMRI.JK', name: 'Bank Mandiri', category: 'SAHAM', assetClass: 'saham' },
  { symbol: '^IXIC', name: 'Nasdaq', category: 'INDEKS', assetClass: 'indeks' },
  { symbol: 'BNBUSDT', name: 'BNB', category: 'KRIPTO', assetClass: 'crypto' },
  { symbol: 'TLKM.JK', name: 'Telkom Indonesia', category: 'SAHAM', assetClass: 'saham' },
  { symbol: 'XRPUSDT', name: 'XRP', category: 'KRIPTO', assetClass: 'crypto' },
  { symbol: 'ASII.JK', name: 'Astra International', category: 'SAHAM', assetClass: 'saham' },
]

const REFRESH_MS = 60_000

interface LiveQuote {
  price: number
  changePct: number
}

export function useLiveTickerFallback(enabled: boolean): MarqueeTicker[] {
  const [items, setItems] = useState<MarqueeTicker[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true

    async function load() {
      try {
        const symbols = FALLBACK_ASSETS.map((a) => a.symbol).join(',')
        const res = await fetch(`/api/quotes/live?symbols=${encodeURIComponent(symbols)}`, { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { quotes?: Record<string, LiveQuote> }
        const quotes = body.quotes ?? {}
        const next = FALLBACK_ASSETS.flatMap((a) => {
          const q = quotes[a.symbol]
          if (!q || !Number.isFinite(q.price)) return []
          return [
            {
              key: `live-${a.symbol}`,
              category: a.category,
              symbol: a.symbol,
              name: a.name,
              assetClass: a.assetClass,
              lastClose: q.price,
              changePct: Number.isFinite(q.changePct) ? q.changePct : null,
            },
          ]
        })
        if (active && next.length > 0) setItems(next)
      } catch {
        // Pita pelengkap: gagal diam-diam, coba lagi di putaran berikutnya.
      }
    }

    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [enabled])

  return enabled ? items : []
}
