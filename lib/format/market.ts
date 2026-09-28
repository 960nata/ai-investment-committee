/**
 * Pemformat angka pasar.
 *
 * Ditaruh di modul tanpa penanda 'use client' supaya satu definisi yang sama
 * bisa dipakai server maupun peramban. Menaruhnya di komponen klien membuat
 * halaman server yang memanggilnya gagal pada saat render, dan menyalinnya ke
 * dua tempat membuat harga yang sama tampil dengan dua bentuk berbeda.
 */

/**
 * Harga dipangkas menurut besarannya, bukan dengan satu jumlah desimal untuk
 * semua. Bitcoin dengan dua desimal memakan lebar yang tidak menambah arti,
 * sementara koin di bawah satu dolar tanpa desimal berubah jadi nol.
 */
export function formatTickerPrice(value: number | null, assetClass: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const prefix = assetClass === 'saham' ? 'Rp' : '$'
  const digits = value >= 1000 ? 0 : value >= 1 ? 2 : 4
  return (
    prefix +
    value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  )
}

/** Perubahan harian, selalu bertanda, dengan koma desimal ala Indonesia. */
export function formatChange(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return '0,00%'
  const sign = changePct >= 0 ? '+' : ''
  return `${sign}${changePct.toFixed(2).replace('.', ',')}%`
}

/**
 * Harga dalam mata uang instrumennya sendiri. Rupiah tidak pernah berkoma, dan
 * koin di bawah satu sen tetap memperlihatkan digit yang bermakna.
 */
export function formatPriceIn(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (currency === 'IDR' || currency === 'JPY' || currency === 'KRW') {
    return `${Math.round(value).toLocaleString('id-ID')} ${currency}`
  }
  const abs = Math.abs(value)
  const [min, max] = abs === 0 ? [2, 2] : abs < 0.0001 ? [6, 8] : abs < 0.01 ? [4, 6] : abs < 10 ? [2, 4] : [2, 2]
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max })} ${currency}`
}

/** Persen bertanda dengan koma desimal; kosong ditulis sebagai garis, bukan nol. */
export function formatPct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits).replace('.', ',')}%`
}
