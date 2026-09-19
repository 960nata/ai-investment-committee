/**
 * Adapter Initialization
 *
 * Registers all available adapters in priority order.
 * Import this module to get a fully configured registry.
 */

import { registry } from './registry';
import { binanceAdapter } from './binance';
import { yahooAdapter } from './yahoo';

// Didaftarkan berurutan prioritas. Keduanya melayani pasar yang berbeda, jadi
// belum ada yang saling mencadangkan; cadangan menyusul saat sumber berbayar
// masuk, dan registry sudah siap menerimanya tanpa mengubah kode analisis.
registry.register(binanceAdapter);
registry.register(yahooAdapter);

export { registry };
