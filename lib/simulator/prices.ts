/**
 * Harga untuk simulator — selalu dibaca di server.
 *
 * Harga masuk dan harga penyelesaian tidak pernah diterima dari peramban.
 * Simulator yang mempercayai harga kiriman klien bisa "dimenangkan" dengan
 * mengedit satu angka di DevTools, dan seluruh papan hasilnya jadi tidak
 * berarti.
 *
 * Kripto dari Binance (dengan cermin `data-api.binance.vision` karena
 * `api.binance.com` diblokir sebagian ISP Indonesia dan region AS di Vercel);
 * sisanya dari Yahoo Finance.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'
import { getForexState } from '@/lib/forex/rates'

const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'] as const
const YAHOO_USER_AGENT = 'ai-investment-committee/0.1 (analisis data pribadi)'

/** Kutipan Yahoo yang lebih tua dari ini dianggap pasar tutup. */
const YAHOO_FRESH_MS = 30 * 60_000

export interface LiveQuote {
  price: number
  /** Epoch milidetik harga itu terjadi. */
  time: number
  currency: string
  /** Salah bila kutipannya basi — bursa tutup, libur, atau di luar jam dagang. */
  fresh: boolean
}

export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export const isCryptoSymbol = (symbol: string) => symbol.endsWith('USDT')

async function binanceJson<T>(path: string, label: string): Promise<T> {
  let lastError: unknown
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetchWithTimeout(`${host}${path}`, { label, timeoutMs: 6_000 })
      if (!res.ok) {
        lastError = new Error(`${label}: HTTP ${res.status}`)
        continue
      }
      return (await res.json()) as T
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} gagal`)
}

async function yahooChart(symbol: string, range: string, interval: string) {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    { label: `Yahoo (${symbol})`, headers: { 'User-Agent': YAHOO_USER_AGENT }, timeoutMs: 7_000 },
  )
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`)
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo ${symbol}: tidak ada data`)
  return result
}

export async function liveQuote(symbol: string): Promise<LiveQuote> {
  if (isCryptoSymbol(symbol)) {
    const t = await binanceJson<{ price: string }>(
      `/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      'Binance harga',
    )
    const price = Number(t.price)
    if (!(price > 0)) throw new Error(`Harga ${symbol} tidak sah`)
    return { price, time: Date.now(), currency: 'USD', fresh: true }
  }

  const result = await yahooChart(symbol, '1d', '1m')
  const meta = result.meta ?? {}
  const price = Number(meta.regularMarketPrice)
  if (!(price > 0)) throw new Error(`Harga ${symbol} tidak tersedia`)
  const time = Number(meta.regularMarketTime ?? 0) * 1000
  return {
    price,
    time,
    currency: String(meta.currency ?? 'USD').toUpperCase(),
    fresh: Date.now() - time < YAHOO_FRESH_MS,
  }
}

/** Beberapa kutipan sekaligus; yang gagal tidak ikut di hasil. */
export async function liveQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const unique = [...new Set(symbols)]
  const out = new Map<string, LiveQuote>()
  const crypto = unique.filter(isCryptoSymbol)
  const others = unique.filter((s) => !isCryptoSymbol(s))

  if (crypto.length > 0) {
    try {
      const list = await binanceJson<{ symbol: string; price: string }[]>(
        `/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(crypto))}`,
        'Binance harga',
      )
      for (const t of list) {
        const price = Number(t.price)
        if (price > 0) out.set(t.symbol, { price, time: Date.now(), currency: 'USD', fresh: true })
      }
    } catch (err) {
      console.warn('[simulator] harga Binance gagal:', err instanceof Error ? err.message : err)
    }
  }

  const settled = await Promise.allSettled(others.slice(0, 20).map((s) => liveQuote(s)))
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.set(others[i], r.value)
  })
  return out
}

/**
 * Harga kripto tepat pada satu detik — transaksi pertama pada atau setelah
 * waktu itu. Untuk menyelesaikan binary: harga "kira-kira saat kedaluwarsa"
 * bisa menukar menang jadi kalah di pasar yang bergerak cepat.
 */
export async function cryptoPriceAt(symbol: string, timeMs: number): Promise<number | null> {
  try {
    const trades = await binanceJson<{ p: string; T: number }[]>(
      `/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&startTime=${timeMs}&endTime=${timeMs + 60_000}&limit=1`,
      'Binance aggTrades',
    )
    const p = Number(trades[0]?.p)
    if (p > 0) return p
  } catch {
    // jatuh ke candle 1 menit di bawah
  }
  try {
    const minute = Math.floor(timeMs / 60_000) * 60_000
    const kl = await binanceJson<unknown[][]>(
      `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${minute}&limit=1`,
      'Binance klines',
    )
    const p = Number(kl[0]?.[1])
    return p > 0 ? p : null
  } catch {
    return null
  }
}

/** Candle kripto Binance pada interval apa pun (1m, 5m, 15m, 1h, 1d). */
export async function cryptoBars(symbol: string, interval: string, limit: number): Promise<Bar[]> {
  const rows = await binanceJson<unknown[][]>(
    `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    'Binance klines',
  )
  return rows.map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }))
}

/** Candle 15 menit Yahoo, lima hari terakhir. */
export async function yahooIntradayBars(symbol: string): Promise<Bar[]> {
  const result = await yahooChart(symbol, '5d', '15m')
  const ts: number[] = result.timestamp ?? []
  const q = result.indicators?.quote?.[0]
  if (!q) return []
  const bars: Bar[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i]
    const c = q.close?.[i]
    if (o == null || c == null) continue
    bars.push({
      time: ts[i] * 1000,
      open: o,
      high: q.high?.[i] ?? Math.max(o, c),
      low: q.low?.[i] ?? Math.min(o, c),
      close: c,
      volume: q.volume?.[i] ?? 0,
    })
  }
  return bars
}

export interface OrderBookSnapshot {
  /** (bid − ask) / (bid + ask) dalam pita ±1% dari harga tengah; −1..1. */
  imbalance: number
  bidUsd: number
  askUsd: number
  /** Dinding terbesar di pita itu, dalam kelipatan rata-rata level. */
  biggestWall: { side: 'bid' | 'ask'; price: number; usd: number; multiple: number } | null
}

/** Buku order Binance — satu-satunya jejak "bandar" yang terlihat langsung di kripto. */
export async function cryptoOrderBook(symbol: string): Promise<OrderBookSnapshot | null> {
  try {
    const book = await binanceJson<{ bids: [string, string][]; asks: [string, string][] }>(
      `/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=500`,
      'Binance depth',
    )
    const bestBid = Number(book.bids[0]?.[0])
    const bestAsk = Number(book.asks[0]?.[0])
    if (!(bestBid > 0 && bestAsk > 0)) return null
    const mid = (bestBid + bestAsk) / 2
    const levels = [
      ...book.bids.map(([p, q]) => ({ side: 'bid' as const, price: Number(p), usd: Number(p) * Number(q) })),
      ...book.asks.map(([p, q]) => ({ side: 'ask' as const, price: Number(p), usd: Number(p) * Number(q) })),
    ].filter((l) => Math.abs(l.price - mid) / mid <= 0.01)
    if (levels.length === 0) return null

    const bidUsd = levels.filter((l) => l.side === 'bid').reduce((s, l) => s + l.usd, 0)
    const askUsd = levels.filter((l) => l.side === 'ask').reduce((s, l) => s + l.usd, 0)
    const avg = (bidUsd + askUsd) / levels.length
    const top = levels.reduce((a, b) => (b.usd > a.usd ? b : a))
    return {
      imbalance: bidUsd + askUsd > 0 ? (bidUsd - askUsd) / (bidUsd + askUsd) : 0,
      bidUsd,
      askUsd,
      biggestWall: avg > 0 ? { ...top, multiple: top.usd / avg } : null,
    }
  } catch {
    return null
  }
}

/**
 * Berapa USD satu unit mata uang ini. Dompet simulator berdenominasi USD,
 * jadi saham IDX dikonversi dengan kurs yang sama dengan seluruh situs.
 */
export async function usdPerUnit(currency: string): Promise<number> {
  const code = currency.toUpperCase()
  if (code === 'USD' || code === 'USDT') return 1
  const state = await getForexState()
  const rate = (state.rates as Record<string, number>)[code]
  if (rate && rate > 0) return 1 / rate
  if (code === 'IDR') return 1 / 17_880
  throw new Error(`Kurs ${code} belum tersedia.`)
}
