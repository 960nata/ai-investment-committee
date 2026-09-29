import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/http/fetch'

export const dynamic = 'force-dynamic'

/**
 * Candle intraday untuk grafik 1D realtime: 5 menit untuk kripto, 15 menit
 * untuk saham, indeks, dan komoditas.
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

/**
 * Lilin Yahoo 15 menit, bukan 5. Saham berfraksi besar (BBCA Rp25) sering tidak
 * bergerak satu tick pun dalam 5 menit, sehingga tiap lilinnya jadi balok
 * setinggi satu tick atau garis datar — grafiknya terbaca seperti kode batang.
 * Kripto tetap 5 menit dari Binance: harganya punya cukup banyak desimal.
 */
export const YAHOO_INTERVAL_MINUTES = 15

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
      // 451/403 (blokir wilayah, mis. region AS di Vercel) harus pindah ke cermin,
      // bukan dikembalikan sebagai jawaban kosong.
      if (!res.ok) {
        lastError = new Error(`${host} HTTP ${res.status}`)
        continue
      }
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
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=15m`,
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
      // Titik terakhir sesi berjalan bercap waktu kutipan (mis. 15:49:59), bukan
      // awal slotnya. Dibiarkan, ia jadi lilin ekstra yang berjarak beberapa
      // menit dari tetangganya — digabung ke slotnya.
      const time = timestamps[i] - (timestamps[i] % (YAHOO_INTERVAL_MINUTES * 60))
      const prev = candles[candles.length - 1]
      if (prev && prev.time === time) {
        prev.high = Math.max(prev.high, h ?? c)
        prev.low = Math.min(prev.low, l ?? c)
        prev.close = c
        prev.volume += v ?? 0
        continue
      }
      candles.push({
        time,
        open: o,
        high: h ?? o,
        low: l ?? o,
        close: c,
        volume: v ?? 0,
      })
    }
    // range=1d kosong saat bursa tutup (akhir pekan, libur), jadi diambil 5 hari
    // dan dikirim utuh: beberapa sesi terakhir, seperti grafik intraday pada
    // umumnya. Satu sesi saja di pagi hari hanya berisi beberapa lilin yang
    // direntangkan selebar layar, dan untuk saham berfraksi besar (BBCA Rp25)
    // tiap lilinnya jadi balok atau garis datar.
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

  // Jangan cache hasil kosong — galat sesaat tak boleh mengunci grafik 30 detik
  if (candles.length > 0) {
    CACHE.set(symbol, { candles, expiresAt: now + CACHE_TTL_MS })
  }

  return NextResponse.json({ candles })
}
