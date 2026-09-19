/**
 * Adapter Type Definitions
 *
 * Interface seragam untuk semua sumber data — persis dari blueprint.
 * Setiap sumber dibungkus adaptor sehingga saat berlangganan API berbayar,
 * yang berubah cuma satu file adaptor baru — tidak ada kode analisis yang perlu disentuh.
 */

export type Market = 'IDX' | 'US' | 'CRYPTO';

export interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  lastError?: string;
  checkedAt: Date;
}

/**
 * PriceAdapter — antarmuka seragam untuk semua sumber harga
 *
 * Registry menyimpan daftar adaptor terurut prioritas.
 * Kalau adaptor utama gagal tiga kali berturut-turut,
 * sistem otomatis turun ke adaptor cadangan.
 */
export interface PriceAdapter {
  /** Unique identifier, e.g. 'binance', 'finnhub', 'idx-json' */
  id: string;

  /** Human-readable name */
  name: string;

  /** Which markets this adapter can serve */
  supports(market: Market): boolean;

  /** Fetch daily OHLCV candles for a symbol within a date range */
  fetchDaily(symbol: string, from: Date, to: Date): Promise<Candle[]>;

  /**
   * Fetch list of available symbols for a market.
   * Used during backfill and instrument discovery.
   */
  fetchSymbols?(market: Market): Promise<{ symbol: string; name: string }[]>;

  /** Health check — ping the source and report latency */
  health(): Promise<HealthStatus>;
}

/**
 * Data quality validation result
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  rawData?: unknown;
}

/**
 * Ambang lompatan harga yang dianggap anomali, per pasar.
 *
 * Angka 35% di blueprint ditulis untuk saham: lompatan sebesar itu dalam sehari
 * hampir selalu berarti aksi korporasi yang belum terekam, bukan pergerakan
 * pasar. Untuk crypto angka itu salah — 35% dalam sehari memang terjadi dan
 * datanya benar. Memakai ambang saham di crypto akan mengarantina data sehat
 * dan mengosongkan riwayat yang justru dibutuhkan backtest.
 */
export const MAX_DAILY_JUMP: Record<Market, number> = {
  IDX: 0.35,
  US: 0.35,
  CRYPTO: 0.6,
}

export interface ValidateOptions {
  previousClose?: number
  /** Lompatan relatif maksimum terhadap penutupan sebelumnya. */
  maxJump?: number
  /** Jam berjalan; disuntik agar pengujian tidak bergantung jam sistem. */
  now?: Date
}

/**
 * Uji kualitas satu candle sebelum masuk database:
 * - harga tidak nol atau negatif
 * - high/low dan open/close konsisten
 * - volume tidak negatif
 * - tanggal tidak di masa depan
 * - tidak ada lompatan di atas ambang pasarnya
 *
 * Baris yang gagal tidak dibuang, melainkan dikarantina oleh pemanggil.
 */
export function validateCandle(
  candle: Candle,
  options: ValidateOptions = {},
): ValidationResult {
  const { previousClose, maxJump = 0.35, now = new Date() } = options
  // Price must be positive
  if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
    return {
      valid: false,
      reason: `Non-positive price detected: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close}`,
      rawData: candle,
    };
  }

  // High must be >= Low
  if (candle.high < candle.low) {
    return {
      valid: false,
      reason: `High (${candle.high}) < Low (${candle.low})`,
      rawData: candle,
    };
  }

  // Open and Close must be within High-Low range
  if (candle.open > candle.high || candle.open < candle.low ||
      candle.close > candle.high || candle.close < candle.low) {
    return {
      valid: false,
      reason: `Open/Close outside High-Low range`,
      rawData: candle,
    };
  }

  // Volume must be non-negative
  if (candle.volume < 0) {
    return {
      valid: false,
      reason: `Negative volume: ${candle.volume}`,
      rawData: candle,
    };
  }

  // No future dates
  if (candle.date > now) {
    return {
      valid: false,
      reason: `Future date: ${candle.date.toISOString()}`,
      rawData: candle,
    };
  }

  // Lompatan di atas ambang pasar — kandidat aksi korporasi yang belum terekam
  if (previousClose && previousClose > 0) {
    const changePct = Math.abs(candle.close - previousClose) / previousClose;
    if (changePct > maxJump) {
      return {
        valid: false,
        reason:
          `Lompatan harga ${(changePct * 100).toFixed(1)}% ` +
          `(ambang ${(maxJump * 100).toFixed(0)}%) dari penutupan ${previousClose} ke ${candle.close}`,
        rawData: candle,
      };
    }
  }

  return { valid: true };
}

/**
 * Format a date to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
