'use client'

/**
 * Ketukan satu kali per halaman yang dibuka.
 *
 * Dipasang sekali di kerangka root, bukan di tiap halaman: halaman baru yang
 * lupa memasangnya akan menghilang dari peta tanpa ada yang menyadari, dan
 * lubang seperti itu baru ketahuan berbulan-bulan kemudian ketika angkanya
 * dipakai mengambil keputusan.
 *
 * Tidak menggambar apa pun dan tidak menahan apa pun. Kegagalannya diabaikan
 * sepenuhnya di sini — telemetri yang menampilkan galat kepada pengunjung sudah
 * salah sejak niatnya.
 */

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function VisitBeacon() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // React memanggil effect dua kali di mode ketat pengembangan. Tanpa penjaga
  // ini tiap muatan halaman tercatat dua kali, dan angkanya diam-diam dobel.
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return

    // Halaman masuk dan daftar sengaja dilewati: alamatnya memuat `next=` yang
    // isinya jalur tujuan, dan tidak ada gunanya menyimpan itu berulang kali.
    if (pathname === '/login' || pathname === '/daftar') return

    const key = pathname
    if (lastSent.current === key) return
    lastSent.current = key

    // Dikirim setelah halaman selesai menggambar supaya tidak ikut berebut
    // dengan permintaan yang benar-benar dibutuhkan pengunjung.
    const timer = setTimeout(() => {
      fetch('/api/v1/analytics/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {})
    }, 600)

    return () => clearTimeout(timer)
    // `searchParams` ikut jadi ketergantungan supaya perpindahan yang hanya
    // mengubah kueri tidak menahan effect ini pada nilai lama, tetapi kuncinya
    // tetap jalur saja — satu halaman, satu catatan.
  }, [pathname, searchParams])

  return null
}
