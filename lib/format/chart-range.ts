/**
 * Rentang tampilan grafik.
 *
 * Seluruh riwayat dimuat sekali, lalu tab hanya menggeser jendela yang
 * terlihat. Berpindah tab jadi seketika dan tidak mengetuk server lagi —
 * sepuluh tahun candle harian cuma sekitar 2.500 baris.
 *
 * Labelnya memakai konvensi pasar internasional (1W, 1M, 1Y) yang terbaca di
 * bahasa apa pun. Singkatan Indonesia seperti "1 Mg" terlalu pendek untuk
 * diterjemahkan dengan benar — penerjemah halaman membacanya sebagai "1 bulan".
 */
export const CHART_RANGES = [
  { id: '1D', label: '1D', days: 1, intraday: true },
  { id: '1W', label: '1W', days: 7 },
  { id: '1M', label: '1M', months: 1 },
  { id: '3M', label: '3M', months: 3 },
  { id: '6M', label: '6M', months: 6 },
  { id: '9M', label: '9M', months: 9 },
  { id: '1Y', label: '1Y', months: 12 },
  { id: '5Y', label: '5Y', months: 60 },
  { id: '10Y', label: '10Y', months: 120 },
] as const


export type ChartRangeId = (typeof CHART_RANGES)[number]['id']

/** Tahun terjauh yang dimuat untuk grafik; sama dengan rentang terpanjang. */
export const CHART_HISTORY_YEARS = 10
