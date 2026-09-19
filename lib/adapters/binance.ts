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

const BINANCE_BASE_URL = 'https://api.binance.com';
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
      const url = new URL('/api/v3/klines', BINANCE_BASE_URL);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', '1d');
      url.searchParams.set('startTime', startTime.toString());
      url.searchParams.set('endTime', endTime.toString());
      url.searchParams.set('limit', MAX_KLINES_PER_REQUEST.toString());

      const response = await fetch(url.toString());

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
    const response = await fetch(`${BINANCE_BASE_URL}/api/v3/exchangeInfo`);

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
      const response = await fetch(`${BINANCE_BASE_URL}/api/v3/ping`);
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
