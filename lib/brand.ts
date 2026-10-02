/**
 * Nama produk. Satu sumber untuk metadata, data terstruktur, dan logo, supaya
 * penggantian nama berikutnya tidak perlu memburu string di puluhan berkas.
 *
 * "Komite" yang tersisa di kode adalah nama fitur (Sidang Komite, Ketua
 * Komite), bukan nama produk, dan memang tidak ikut diganti.
 */
export const SITE_NAME = 'AI Investdesk'
export const DEFAULT_SITE_URL = 'https://aiinvestdesk.com'
export const SITE_TAGLINE = 'Alat Analisis Data Probabilistik Saham IDX, Saham AS, dan Kripto'
export const SITE_DESCRIPTION =
  'Terminal analitik pasar modal dan kripto berbasis model probabilistik kuantitatif. ' +
  'Menampilkan kalkulasi peluang, histori sinyal, dan analisis multi-agen independen. ' +
  'Data objektif, bukan anjuran investasi.'

/**
 * Menghasilkan URL dasar situs yang aman.
 * Jika di produksi dan NEXT_PUBLIC_APP_URL belum diset, otomatis jatuh ke domain
 * resmi https://aiinvestdesk.com — BUKAN http://localhost:3000 — agar perayap
 * Google & bot AI tidak mengira situs ini berjalan di localhost atau tidak aktif.
 */
export function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envUrl) {
    return envUrl.replace(/\/$/, '')
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '')}`
  }
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_SITE_URL
  }
  return 'http://localhost:3000'
}
