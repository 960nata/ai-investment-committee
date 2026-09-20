import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/http/fetch'

export const dynamic = 'force-dynamic'

interface LiveQuote {
  price: number
  changePct: number
  time: number
  source: 'binance' | 'yahoo'
}

// Cache in-memory pendek (5 detik) untuk mencegah spam ke upstream saat banyak tab/user me-refresh
const CACHE = new Map<string, { quote: LiveQuote; expiresAt: number }>()
const CACHE_TTL_MS = 5_000

const YAHOO_USER_AGENT = 'ai-investment-committee/0.1 (analisis data pribadi)'

async function fetchBinanceQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const result: Record<string, LiveQuote> = {}
  if (symbols.length === 0) return result

  try {
    const encoded = encodeURIComponent(JSON.stringify(symbols))
    const res = await fetchWithTimeout(
      `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encoded}`,
      { label: 'Binance Live Ticker', timeoutMs: 6_000 },
    )
    if (!res.ok) return result
    const list = (await res.json()) as Array<{
      symbol: string
      lastPrice: string
      priceChangePercent: string
      closeTime: number
    }>

    for (const item of list) {
      const price = Number(item.lastPrice)
      const changePct = Number(item.priceChangePercent)
      if (!Number.isNaN(price)) {
        result[item.symbol] = {
          price,
          changePct: Number.isNaN(changePct) ? 0 : changePct,
          time: item.closeTime,
          source: 'binance',
        }
      }
    }
  } catch (err) {
    console.warn('[LiveQuotes] Binance live quote gagal:', err instanceof Error ? err.message : err)
  }

  return result
}

async function fetchYahooQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      {
        label: `Yahoo Live Quote (${symbol})`,
        headers: { 'User-Agent': YAHOO_USER_AGENT },
        timeoutMs: 6_000,
      },
    )
    if (!res.ok) return null
    const data = await res.json()
    const meta = data.chart?.result?.[0]?.meta
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null

    const price = meta.regularMarketPrice
    const prev = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : price
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0

    return {
      price,
      changePct,
      time: (meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
      source: 'yahoo',
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbolsParam = searchParams.get('symbols')

  if (!symbolsParam) {
    return NextResponse.json({ quotes: {} })
  }

  const requested = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (requested.length === 0) {
    return NextResponse.json({ quotes: {} })
  }

  const now = Date.now()
  const quotes: Record<string, LiveQuote> = {}
  const needed: string[] = []

  for (const s of requested) {
    const cached = CACHE.get(s)
    if (cached && cached.expiresAt > now) {
      quotes[s] = cached.quote
    } else {
      needed.push(s)
    }
  }

  if (needed.length > 0) {
    const binanceSymbols = needed.filter((s) => s.endsWith('USDT'))
    const yahooSymbols = needed.filter((s) => !s.endsWith('USDT')).slice(0, 15) // batasi concurrency

    const [binanceResults, ...yahooResults] = await Promise.all([
      fetchBinanceQuotes(binanceSymbols),
      ...yahooSymbols.map(async (s) => ({ symbol: s, quote: await fetchYahooQuote(s) })),
    ])

    for (const [s, q] of Object.entries(binanceResults)) {
      quotes[s] = q
      CACHE.set(s, { quote: q, expiresAt: now + CACHE_TTL_MS })
    }

    for (const item of yahooResults) {
      if (item.quote) {
        quotes[item.symbol] = item.quote
        CACHE.set(item.symbol, { quote: item.quote, expiresAt: now + CACHE_TTL_MS })
      }
    }
  }

  return NextResponse.json({ quotes })
}
