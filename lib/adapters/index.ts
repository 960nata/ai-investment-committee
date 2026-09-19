/**
 * Adapter Initialization
 *
 * Registers all available adapters in priority order.
 * Import this module to get a fully configured registry.
 */

import { registry } from './registry';
import { binanceAdapter } from './binance';

// Register adapters in priority order
// More adapters will be added in later phases:
// - Finnhub (US stocks, Fase 4)
// - IDX JSON endpoint (IDX, Fase 2)
// - Twelve Data (backup, Fase 2)
registry.register(binanceAdapter);

export { registry };
