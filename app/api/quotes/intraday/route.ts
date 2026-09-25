import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/http/fetch'

export const dynamic = 'force-dynamic'

/**
 * Candle intraday 5 menit untuk grafik 1D realtime.
 *
 * Crypto diambil dari Binance (klines), sisanya dari Yahoo Finance (chart).
 * Kedua sumber gratis, tanpa kunci, dan memberikan data 5 menit untuk
 * perdagangan hari ini.
 *
 * Cache in-memory 30 detik — cukup segar untuk grafik yang diperbarui tiap
 * 10–15 detik, tapi tidak membanjiri upstream saat banyak pengguna membuka
 * instrumen yang sama.
 */

interface IntradayCandle {
  time: number     // unix timestamp detik
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const CACHE = new Map<string, { candles: IntradayCandle[]; expiresAt: number }>()
const CACHE_TTL_MS = 30_000

const YAHOO_USER_AGENT = 'ai-investment-committee/0.1 (analisis data pribadi)'

/**
 * Host Binance, dicoba berurutan.
 * Sama seperti adapter utama — `api.binance.com` diblokir di sebagian ISP
 * Indonesia, `data-api.binance.vision` adalah cermin resmi yang lolos.
 */
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://data-api.binance.vision',
] as const

let activeBinanceHost: string | null = null

async function binanceFetch(path: string): Promise<Response> {
  const ordered = activeBinanceHost
    ? [activeBinanceHost, ...BINANCE_HOSTS.filter((h) => h !== activeBinanceHost)]
    : [...BINANCE_HOSTS]

  let lastError: unknown
  for (const host of ordered) {
    try {
      const res = await fetchWithTimeout(`${host}${path}`, {
        label: 'Binance Intraday',
        timeoutMs: 6_000,
      })
      activeBinanceHost = host
      return res
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function fetchBinanceIntraday(symbol: string): Promise<IntradayCandle[]> {
  try {
    const res = await binanceFetch(
      `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&limit=288`,
    )
    if (!res.ok) return []

    const klines = (await res.json()) as Array<
      [number, string, string, string, string, string, ...unknown[]]
    >

    return klines.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
  } catch (err) {
    console.warn('[Intraday] Binance gagal:', err instanceof Error ? err.message : err)
    return []
  }
}

async function fetchYahooIntraday(symbol: string): Promise<IntradayCandle[]> {
  try {
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`,
      {
        label: `Yahoo Intraday (${symbol})`,
        headers: { 'User-Agent': YAHOO_USER_AGENT },
        timeoutMs: 6_000,
      },
    )
    if (!res.ok) return []

    const data = await res.json()
    const result = data.chart?.result?.[0]
    if (!result) return []

    const timestamps: number[] = result.timestamp ?? []
    const q = result.indicators?.quote?.[0]
    if (!q) return []

    const candles: IntradayCandle[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open?.[i]
      const h = q.high?.[i]
      const l = q.low?.[i]
      const c = q.close?.[i]
      const v = q.volume?.[i]
      // Yahoo kadang mengembalikan null di slot yang belum terisi
      if (o == null || c == null) continue
      candles.push({
        time: timestamps[i],
        open: o,
        high: h ?? o,
        low: l ?? o,
        close: c,
        volume: v ?? 0,
      })
    }
    return candles
  } catch (err) {
    console.warn('[Intraday] Yahoo gagal:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.trim()

  if (!symbol) {
    return NextResponse.json({ candles: [] })
  }

  // Cache check
  const now = Date.now()
  const cached = CACHE.get(symbol)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ candles: cached.candles })
  }

  const isBinance = symbol.endsWith('USDT')
  const candles = isBinance
    ? await fetchBinanceIntraday(symbol)
    : await fetchYahooIntraday(symbol)

  CACHE.set(symbol, { candles, expiresAt: now + CACHE_TTL_MS })

  return NextResponse.json({ candles })
}
