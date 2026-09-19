/**
 * Adapter Registry
 *
 * Menyimpan daftar adaptor terurut prioritas per market.
 * Kalau adaptor utama gagal tiga kali berturut-turut,
 * sistem otomatis turun ke adaptor cadangan dan mencatat kejadiannya
 * di tabel data_source_health.
 *
 * Saat nanti berlangganan API berbayar, yang berubah cuma satu file adaptor baru.
 */

import type { PriceAdapter, Market, Candle, HealthStatus } from './types';
import { recordAdapterHealth } from '@/lib/db/queries';

interface AdapterState {
  adapter: PriceAdapter;
  consecutiveFailures: number;
  lastError?: string;
  cooldownUntil?: Date;
}

const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

class AdapterRegistry {
  private adapters: AdapterState[] = [];

  /**
   * Register an adapter. Order of registration determines priority.
   */
  register(adapter: PriceAdapter): void {
    this.adapters.push({
      adapter,
      consecutiveFailures: 0,
    });
  }

  /**
   * Get all registered adapters for a market, filtered by health.
   * Returns adapters in priority order, skipping those in cooldown.
   */
  getHealthyAdapters(market: Market): PriceAdapter[] {
    const now = new Date();
    return this.adapters
      .filter(state => {
        if (!state.adapter.supports(market)) return false;
        if (state.cooldownUntil && state.cooldownUntil > now) return false;
        return true;
      })
      .map(state => state.adapter);
  }

  /**
   * Fetch daily candles with automatic failover.
   * Tries adapters in priority order; if one fails 3 times,
   * falls through to the next.
   */
  async fetchDailyWithFailover(
    market: Market,
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<{ candles: Candle[]; sourceId: string }> {
    const candidates = this.adapters.filter(s => s.adapter.supports(market));

    if (candidates.length === 0) {
      throw new Error(`No adapters registered for market: ${market}`);
    }

    const now = new Date();
    const errors: { adapterId: string; error: string }[] = [];

    for (const state of candidates) {
      // Skip adapters in cooldown
      if (state.cooldownUntil && state.cooldownUntil > now) {
        continue;
      }

      try {
        const startMs = Date.now();
        const candles = await state.adapter.fetchDaily(symbol, from, to);
        const latencyMs = Date.now() - startMs;

        // Reset failure count on success
        state.consecutiveFailures = 0;
        state.lastError = undefined;

        // Catat sehat. Kegagalan pencatatan tidak boleh menjatuhkan ingest.
        await recordAdapterHealth({
          sourceId: state.adapter.id,
          status: 'healthy',
          consecutiveFailures: 0,
        }).catch(() => {});

        console.log(`[Registry] ${state.adapter.id} ${symbol}: ${candles.length} candle (${latencyMs}ms)`);

        return { candles, sourceId: state.adapter.id };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        state.consecutiveFailures++;
        state.lastError = errorMsg;

        errors.push({ adapterId: state.adapter.id, error: errorMsg });

        // Record failure
        const status = state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? 'down' : 'degraded';
        await recordAdapterHealth({
          sourceId: state.adapter.id,
          status,
          lastError: errorMsg,
          consecutiveFailures: state.consecutiveFailures,
        }).catch(() => {});

        // Put adapter in cooldown after max failures
        if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          state.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
          console.warn(
            `[Registry] Adapter ${state.adapter.id} hit ${MAX_CONSECUTIVE_FAILURES} failures, ` +
            `cooldown until ${state.cooldownUntil.toISOString()}`
          );
        }

        // Continue to next adapter
        continue;
      }
    }

    throw new Error(
      `All adapters failed for ${market}:${symbol}. Errors: ${JSON.stringify(errors)}`
    );
  }

  /**
   * Run health checks on all adapters.
   */
  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    for (const state of this.adapters) {
      try {
        const health = await state.adapter.health();
        results.set(state.adapter.id, health);

        await recordAdapterHealth({
          sourceId: state.adapter.id,
          status: health.healthy ? 'healthy' : 'degraded',
          lastError: health.lastError,
          consecutiveFailures: health.healthy ? 0 : state.consecutiveFailures,
        }).catch(() => {});
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.set(state.adapter.id, {
          healthy: false,
          latencyMs: -1,
          lastError: errorMsg,
          checkedAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * List all registered adapter IDs and their current state.
   */
  getStatus(): { id: string; name: string; failures: number; inCooldown: boolean }[] {
    const now = new Date();
    return this.adapters.map(state => ({
      id: state.adapter.id,
      name: state.adapter.name,
      failures: state.consecutiveFailures,
      inCooldown: !!(state.cooldownUntil && state.cooldownUntil > now),
    }));
  }
}

// Singleton registry
export const registry = new AdapterRegistry();
