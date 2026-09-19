/**
 * Binance Adapter
 *
 * First adapter — Binance public API (no API key required).
 * Supports CRYPTO market only.
 *
 * Endpoint: GET /api/v3/klines
 * Rate limit: Very generous for public endpoints (no key needed).
 * Delay: Real-time.
 * Risk: Low — most stable of all sources.
 *
 * @see https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */

import type { PriceAdapter, Market, Candle, HealthStatus } from './types';
import { fetchWithTimeout } from '@/lib/http/fetch';

/**
 * Host Binance, dicoba berurutan.
 *
 * `api.binance.com` diblokir di sebagian jaringan, termasuk sebagian besar ISP
 * Indonesia. `data-api.binance.vision` adalah endpoint data pasar publik resmi
 * Binance dengan bentuk API yang sama persis, hanya baca, tanpa kunci — dan ia
 * lolos di tempat domain utamanya tidak.
 *
 * Tanpa daftar ini, seluruh Fase 0 mati di mesin pengembang meski kodenya benar,
 * dan penyebabnya tidak terlihat dari pesan galat mana pun.
 */
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://data-api.binance.vision',
] as const;

/**
 * Host yang terbukti bisa dihubungi, diingat selama proses hidup.
 *
 * Tanpa ini tiap panggilan membayar ulang batas waktu host pertama yang
 * diblokir, dan ingest satu batch jadi berkali lipat lebih lama.
 */
let activeHost: string | null = null;

/**
 * Panggil Binance dengan perpindahan host otomatis.
 *
 * Perpindahan hanya terjadi pada kegagalan jaringan. Jawaban HTTP 4xx dan 5xx
 * adalah jawaban sungguhan dari bursa — mencoba host lain untuk "simbol tidak
 * dikenal" hanya menggandakan pekerjaan tanpa mengubah hasilnya.
 */
async function binanceFetch(path: string, timeoutMs?: number): Promise<Response> {
  const ordered = activeHost
    ? [activeHost, ...BINANCE_HOSTS.filter((h) => h !== activeHost)]
    : [...BINANCE_HOSTS];

  const failures: string[] = [];

  for (const host of ordered) {
    try {
      const response = await fetchWithTimeout(`${host}${path}`, {
        label: `Binance (${new URL(host).hostname})`,
        timeoutMs,
      });
      if (activeHost !== host) {
        activeHost = host;
        console.log(`[Binance] memakai ${new URL(host).hostname}`);
      }
      return response;
    } catch (err) {
      failures.push(`${new URL(host).hostname}: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error(`Semua host Binance tidak terjangkau. ${failures.join('; ')}`);
}
const MAX_KLINES_PER_REQUEST = 1000; // Binance limit

interface BinanceKline {
  0: number;   // Open time (ms)
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  6: number;   // Close time (ms)
  7: string;   // Quote asset volume
  8: number;   // Number of trades
  9: string;   // Taker buy base asset volume
  10: string;  // Taker buy quote asset volume
  11: string;  // Ignore
}

/**
 * Pasangan crypto awal untuk Fase 0, semuanya berdenominasi USDT.
 *
 * Daftar ini keinginan, bukan kebenaran. Bursa menghapus dan mengganti nama
 * pasangan tanpa pemberitahuan — MATIC menjadi POL adalah contoh terbarunya —
 * jadi daftar ini selalu disaring dulu lewat `fetchSymbols()` sebelum dipakai.
 */
export const BINANCE_DEFAULT_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'Ethereum' },
  { symbol: 'BNBUSDT', name: 'Binance Coin' },
  { symbol: 'SOLUSDT', name: 'Solana' },
  { symbol: 'XRPUSDT', name: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano' },
  { symbol: 'DOTUSDT', name: 'Polkadot' },
  { symbol: 'AVAXUSDT', name: 'Avalanche' },
  { symbol: 'POLUSDT', name: 'Polygon' },
  { symbol: 'LINKUSDT', name: 'Chainlink' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin' },
  { symbol: 'TRXUSDT', name: 'TRON' },
];

interface BinanceExchangeInfo {
  symbols: { symbol: string; status: string }[];
}

export class BinanceAdapter implements PriceAdapter {
  id = 'binance';
  name = 'Binance Public API';

  supports(market: Market): boolean {
    return market === 'CRYPTO';
  }

  async fetchDaily(symbol: string, from: Date, to: Date): Promise<Candle[]> {
    const allCandles: Candle[] = [];
    let startTime = from.getTime();
    const endTime = to.getTime();

    // Paginate through Binance's 1000-candle limit
    while (startTime < endTime) {
      const query = new URLSearchParams({
        symbol,
        interval: '1d',
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        limit: MAX_KLINES_PER_REQUEST.toString(),
      });

      const response = await binanceFetch(`/api/v3/klines?${query}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Binance API error ${response.status}: ${errorText} (symbol: ${symbol})`
        );
      }

      const klines: BinanceKline[] = await response.json();

      if (klines.length === 0) break;

      for (const kline of klines) {
        const openTime = new Date(kline[0]);

        allCandles.push({
          date: openTime,
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        });
      }

      // Move start time past the last candle's close time
      const lastKline = klines[klines.length - 1];
      startTime = lastKline[6] + 1; // close time + 1ms

      // If we got fewer than the limit, we've reached the end
      if (klines.length < MAX_KLINES_PER_REQUEST) break;
    }

    return allCandles;
  }

  /**
   * Daftar kurasi, disaring terhadap pasangan yang benar-benar masih
   * diperdagangkan. Simbol yang sudah dihapus bursa tidak akan pernah
   * mengembalikan candle; menyaringnya di sini mencegah satu simbol mati
   * menghasilkan kegagalan harian selamanya di log.
   */
  async fetchSymbols(): Promise<{ symbol: string; name: string }[]> {
    // exchangeInfo mengembalikan beberapa megabyte; batas waktunya dilonggarkan
    // dari bawaan, tetapi tetap ada batasnya.
    const response = await binanceFetch('/api/v3/exchangeInfo', 30_000);

    if (!response.ok) {
      throw new Error(`Binance exchangeInfo gagal: HTTP ${response.status}`);
    }

    const info: BinanceExchangeInfo = await response.json();
    const tradable = new Set(
      info.symbols.filter((s) => s.status === 'TRADING').map((s) => s.symbol),
    );

    return BINANCE_DEFAULT_SYMBOLS.filter((s) => tradable.has(s.symbol));
  }

  async health(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await binanceFetch('/api/v3/ping', 8_000);
      const latencyMs = Date.now() - start;

      return {
        healthy: response.ok,
        latencyMs,
        lastError: response.ok ? undefined : `HTTP ${response.status}`,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastError: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      };
    }
  }
}

// Export singleton instance
export const binanceAdapter = new BinanceAdapter();
