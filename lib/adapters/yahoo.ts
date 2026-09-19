/**
 * Adaptor Yahoo Finance.
 *
 * Menutup semua yang tidak bisa diambil dari bursa crypto: saham IDX, saham AS,
 * indeks, emas, dan komoditi. Satu bentuk API untuk semuanya, tanpa kunci.
 *
 * Risikonya harus dinyatakan terbuka. Ini bukan API resmi dan tidak punya
 * kontrak apa pun: bentuk jawabannya bisa berubah, dan pembatasan laju bisa
 * muncul tanpa peringatan. Karena itu ia dibungkus antarmuka adaptor yang sama
 * dengan yang lain, punya health check, dan bisa digantikan sumber berbayar
 * tanpa menyentuh satu baris pun kode analisis. Selama Fase 1 ini pertukaran
 * yang sepadan; menunggu sumber resmi berarti tidak ada data sama sekali.
 *
 * Yang membedakannya dari adaptor Binance: Yahoo mengirim harga tersesuaikan
 * aksi korporasi. Tanpa itu, stock split 1:2 terbaca sebagai kejatuhan lima
 * puluh persen dan model mempelajarinya sebagai sinyal negatif yang sangat kuat.
 */

import type { PriceAdapter, Market, Candle, HealthStatus } from './types'
import { fetchWithTimeout } from '@/lib/http/fetch'

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

/**
 * Yahoo menolak sebagian klien tanpa User-Agent yang wajar. Nilai ini bukan
 * penyamaran: ia menyebut proyeknya apa adanya.
 */
const USER_AGENT = 'ai-investment-committee/0.1 (analisis data pribadi)'

interface YahooChart {
  chart: {
    result:
      | [
          {
            meta: { currency?: string; symbol?: string }
            timestamp?: number[]
            indicators: {
              quote: [
                {
                  open?: (number | null)[]
                  high?: (number | null)[]
                  low?: (number | null)[]
                  close?: (number | null)[]
                  volume?: (number | null)[]
                },
              ]
              adjclose?: [{ adjclose?: (number | null)[] }]
            }
          },
        ]
      | null
    error: { code: string; description: string } | null
  }
}

/** Pasar yang dilayani adaptor ini. Crypto sengaja tidak termasuk. */
const SUPPORTED: Market[] = ['IDX', 'US', 'GLOBAL']

export class YahooAdapter implements PriceAdapter {
  id = 'yahoo'
  name = 'Yahoo Finance'

  supports(market: Market): boolean {
    return SUPPORTED.includes(market)
  }

  async fetchDaily(symbol: string, from: Date, to: Date): Promise<Candle[]> {
    const query = new URLSearchParams({
      period1: Math.floor(from.getTime() / 1000).toString(),
      period2: Math.floor(to.getTime() / 1000).toString(),
      interval: '1d',
      events: 'div,split',
    })

    const response = await fetchWithTimeout(
      `${BASE_URL}/${encodeURIComponent(symbol)}?${query}`,
      { label: 'Yahoo Finance', headers: { 'user-agent': USER_AGENT } },
    )

    if (!response.ok) {
      throw new Error(`Yahoo Finance HTTP ${response.status} untuk ${symbol}`)
    }

    const body: YahooChart = await response.json()

    if (body.chart.error) {
      throw new Error(`Yahoo Finance menolak ${symbol}: ${body.chart.error.description}`)
    }

    const result = body.chart.result?.[0]
    if (!result?.timestamp) return []

    const quote = result.indicators.quote[0]
    const adjusted = result.indicators.adjclose?.[0]?.adjclose

    const candles: Candle[] = []

    for (let i = 0; i < result.timestamp.length; i++) {
      const open = quote.open?.[i]
      const high = quote.high?.[i]
      const low = quote.low?.[i]
      const close = quote.close?.[i]

      // Hari libur dan perdagangan yang dihentikan muncul sebagai null di
      // tengah deret. Dilewati, bukan diisi: interpolasi harga menciptakan
      // pergerakan yang tidak pernah terjadi, dan model belajar dari gerakan
      // hantu itu.
      if (open == null || high == null || low == null || close == null) continue

      candles.push({
        // Stempel waktu Yahoo menunjuk pembukaan sesi pada zona waktu bursanya.
        // Dinormalkan ke tengah malam UTC supaya satu hari perdagangan selalu
        // jatuh ke satu tanggal, berapa pun selisih zona waktunya.
        date: new Date(new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10)),
        open,
        high,
        low,
        close,
        volume: quote.volume?.[i] ?? 0,
        adjClose: adjusted?.[i] ?? undefined,
      })
    }

    return candles
  }

  async health(): Promise<HealthStatus> {
    const start = Date.now()
    try {
      const response = await fetchWithTimeout(`${BASE_URL}/AAPL?range=1d&interval=1d`, {
        label: 'Yahoo Finance',
        timeoutMs: 8_000,
        headers: { 'user-agent': USER_AGENT },
      })

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
        lastError: response.ok ? undefined : `HTTP ${response.status}`,
        checkedAt: new Date(),
      }
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastError: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      }
    }
  }
}

export const yahooAdapter = new YahooAdapter()
