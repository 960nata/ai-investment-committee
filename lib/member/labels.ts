/**
 * Label layar untuk alat investor. Modul tanpa impor server supaya aman
 * dipakai komponen klien.
 */

export const ASSET_CLASS_LABEL: Record<string, string> = {
  crypto: 'Crypto',
  memecoin: 'Meme coin',
  saham: 'Saham',
  emas: 'Emas',
  komoditi: 'Komoditi',
  indeks: 'Indeks',
  mata_uang: 'Mata uang',
  obligasi: 'Obligasi',
}

/**
 * Tab penyaring kelas aset untuk pemilih instrumen (Bandingkan, Watchlist).
 * `classes: null` berarti semua kelas.
 */
export const ASSET_TABS: { id: string; label: string; classes: string[] | null }[] = [
  { id: 'semua', label: 'Semua', classes: null },
  { id: 'kripto', label: 'Kripto', classes: ['crypto', 'memecoin'] },
  { id: 'saham', label: 'Saham', classes: ['saham'] },
  { id: 'komoditas', label: 'Komoditas', classes: ['komoditi'] },
  { id: 'emas', label: 'Emas', classes: ['emas'] },
  { id: 'indeks', label: 'Indeks', classes: ['indeks'] },
  { id: 'mata_uang', label: 'Mata uang', classes: ['mata_uang'] },
  { id: 'obligasi', label: 'Obligasi', classes: ['obligasi'] },
]
