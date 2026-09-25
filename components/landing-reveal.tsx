'use client'

import { useEffect } from 'react'

/**
 * Munculkan elemen `.lp-reveal` saat mulai masuk layar.
 *
 * Kelas penyembunyi baru dipasang di <html> setelah skrip ini jalan. Tanpa
 * JavaScript — atau kalau skripnya gagal dimuat — tidak ada satu elemen pun
 * yang tertinggal tak terlihat. Pengguna yang meminta gerak dikurangi langsung
 * mendapat keadaan akhir.
 */
export function LandingReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    const targets = [...document.querySelectorAll<HTMLElement>('.lp-reveal')]
    root.classList.add('reveal-ready')

    // Elemen yang sudah terlewat — di atas layar — ikut dimunculkan. Gulir cepat
    // atau lompatan ke jangkar bisa membawa elemen masuk dan keluar layar di
    // antara dua pemeriksaan, dan tanpa aturan ini ia tertinggal tak terlihat
    // selamanya di bagian halaman yang sudah dibaca.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && entry.boundingClientRect.top > 0) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    for (const el of targets) observer.observe(el)

    return () => {
      observer.disconnect()
      root.classList.remove('reveal-ready')
    }
  }, [])

  return null
}
