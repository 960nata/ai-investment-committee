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
