/**
 * Awalan halaman terminal yang hanya boleh dibuka setelah masuk.
 *
 * Dibaca dua tempat: gerbang sesi di `proxy.ts`, dan `app/robots.ts` supaya
 * perayap tidak menghabiskan waktunya dipantulkan ke halaman masuk.
 */
export const PROTECTED_PAGE_PREFIXES = [
  '/ringkasan',
  '/instruments',
  '/berita',
  '/pipeline',
  '/backtest',
  '/watchlist',
  '/portofolio',
  '/alert',
  '/screener',
  '/bandingkan',
  '/tanya-komite',
  '/rekam-jejak',
  '/kepemilikan',
  '/makro',
  '/notifikasi',
] as const
