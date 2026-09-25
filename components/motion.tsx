'use client'

import { useEffect, useRef } from 'react'

/**
 * Lapisan gerak halaman depan.
 *
 * Sebagian besar animasi di situs ini dijalankan CSS lewat `animation-timeline:
 * view()` — peramban yang menggerakkan, bukan JavaScript, jadi tidak ada satu
 * pun listener scroll yang berjalan di utas utama. Berkas ini hanya memuat dua
 * hal yang memang tidak bisa dilakukan CSS sendirian:
 *
 * 1. `ScrollMotion` — penyingkap cadangan untuk peramban lama yang belum punya
 *    linimasa scroll. Di peramban modern komponen ini berhenti di baris pertama
 *    dan tidak memasang apa pun.
 * 2. `Scramble` — angka yang mengunci digit satu per satu saat pertama muncul.
 *
 * Aturan yang tidak boleh dilanggar keduanya: konten tidak pernah disembunyikan
 * oleh animasi. Kalau JavaScript gagal dimuat atau linimasa tidak didukung,
 * halaman tetap tampil utuh — hanya diam.
 */

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOTION_QUERY).matches
}

export function ScrollMotion() {
  useEffect(() => {
    // Peramban yang paham linimasa scroll sudah menganimasikan sendiri lewat
    // CSS. Memasang observer di sini cuma menggandakan pekerjaan.
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'view()')) return
    if (prefersReducedMotion()) return

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-stagger]')
    )
    if (targets.length === 0) return

    // Hanya elemen yang memang masih di bawah layar yang disembunyikan. Yang
    // sudah terlihat saat skrip jalan dibiarkan apa adanya, supaya tidak ada
    // kedipan "muncul lalu hilang lalu muncul lagi" di paruh atas halaman.
    const viewport = window.innerHeight
    const pending = targets.filter((el) => el.getBoundingClientRect().top > viewport * 0.92)
    for (const el of pending) el.dataset.pending = ''

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.dataset.inview = ''
          io.unobserve(el)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    )

    for (const el of pending) io.observe(el)
    return () => io.disconnect()
  }, [])

  return null
}

const DIGITS = '0123456789'

/**
 * Angka yang "mendarat": digit diacak lalu dikunci dari kiri ke kanan.
 *
 * Nilainya sudah jadi teks terformat dari peladen (termasuk pemisah ribuan
 * lokal), jadi yang diacak hanya karakter angka — titik, koma, spasi, dan kata
 * seperti "menit" lewat begitu saja. Teks final ditulis langsung ke simpul DOM
 * supaya tidak ada rerender React tiap bingkai.
 */
export function Scramble({
  value,
  className,
  delay = 620,
}: {
  value: string
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.textContent = value
      return
    }

    const chars = Array.from(value)
    const slots = chars.reduce<number[]>((acc, char, index) => {
      if (char >= '0' && char <= '9') acc.push(index)
      return acc
    }, [])
    if (slots.length === 0) return

    const DURATION = 560
    let raf = 0
    let start = 0

    const tick = (now: number) => {
      if (start === 0) start = now
      const t = Math.min(1, (now - start) / DURATION)
      // Pelambatan di ujung: digit terakhir terasa "mendarat", bukan terpotong.
      const eased = 1 - Math.pow(1 - t, 3)
      const locked = Math.floor(eased * slots.length)

      const frame = chars.slice()
      for (let i = locked; i < slots.length; i++) {
        frame[slots[i]] = DIGITS[(Math.random() * 10) | 0]
      }
      el.textContent = frame.join('')

      if (t < 1) raf = requestAnimationFrame(tick)
      else el.textContent = value
    }

    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, delay)

    return () => {
      window.clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      el.textContent = value
    }
  }, [value, delay])

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  )
}
