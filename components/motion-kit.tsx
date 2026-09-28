'use client'

/**
 * Lapisan gerak berbasis Motion (Framer Motion).
 *
 * Tiga aturan yang dijaga di seluruh berkas ini:
 *
 * 1. Konten tidak pernah disembunyikan oleh markup. Tidak ada `opacity: 0` di
 *    HTML server; animasi dimulai dari JavaScript, jadi kalau skrip gagal
 *    dimuat halaman tetap tampil utuh — hanya diam.
 * 2. Muatan pertama tidak dianimasikan. HTML server sudah terlihat sebelum
 *    hidrasi; menyembunyikannya lalu memunculkannya lagi hanya menghasilkan
 *    kedipan. Animasi halaman berlaku untuk perpindahan halaman di dalam
 *    aplikasi.
 * 3. Setelan "kurangi gerakan" di perangkat pengguna selalu dihormati.
 *
 * Animasi scroll di halaman depan tetap dikerjakan CSS (lihat motion.tsx);
 * berkas ini tidak menggandakannya.
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import { MotionConfig, stagger, useAnimate, useReducedMotion } from 'motion/react'

declare global {
  interface Window {
    /** Diisi setelah hidrasi pertama selesai; sebelum itu animasi halaman dilewati. */
    __motionReady?: boolean
  }
}

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Pasang sekali di root layout. `useEffect` di sini berjalan setelah semua
 * `useLayoutEffect` anak-anaknya, jadi pada muatan pertama tiap `PageEnter`
 * melihat bendera ini masih kosong dan tidak menganimasikan apa pun.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    window.__motionReady = true
  }, [])
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/** Elemen yang tidak ikut digeser: header lengket dan lapisan tetap. */
function animatable(el: Node): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const position = getComputedStyle(el).position
  return position !== 'sticky' && position !== 'fixed'
}

/**
 * Pembungkus isi halaman untuk `template.tsx`.
 *
 * Saat halaman baru dipasang, anak-anak langsungnya muncul bertahap dari
 * bawah. Konten yang datang belakangan — isi halaman yang menggantikan
 * skeleton `loading.tsx` — ikut dianimasikan lewat MutationObserver, selama
 * beberapa detik setelah perpindahan saja supaya pembaruan data biasa tidak
 * ikut bergerak.
 */
export function PageEnter({
  children,
  variant = 'rise',
}: {
  children: React.ReactNode
  /**
   * `rise`: anak-anak muncul bertahap dari bawah — untuk isi halaman dashboard.
   * `fade`: seluruh halaman hanya memudar masuk — untuk template root, yang
   * membungkus header lengket dan menu mobile; menggeser pembungkusnya akan
   * mengganggu elemen `fixed` di dalamnya selama animasi berjalan.
   */
  variant?: 'rise' | 'fade'
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduce = useReducedMotion()
  const watching = useRef(true)

  useLayoutEffect(() => {
    const root = scope.current
    if (!root || reduce || !window.__motionReady) return

    /**
     * Gaya sisa animasi dibersihkan setelah selesai. `transform` dan `opacity`
     * yang tertinggal membuat tiap panel jadi lapisan (stacking context)
     * sendiri, sehingga dropdown di satu panel tertimpa panel di bawahnya.
     */
    const settle = (elements: HTMLElement[]) => {
      for (const el of elements) {
        el.style.removeProperty('transform')
        el.style.removeProperty('opacity')
      }
    }

    const enter = (elements: HTMLElement[], delay = 0) => {
      if (elements.length === 0) return
      const controls =
        variant === 'fade'
          ? animate(elements, { opacity: [0, 1] }, { duration: 0.32, ease: EASE, delay })
          : animate(
              elements,
              { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
              { duration: 0.42, ease: EASE, delay: stagger(0.05, { startDelay: delay }) },
            )
      controls.then(() => settle(elements))
    }

    enter(Array.from(root.children).filter(animatable))

    const observer = new MutationObserver((records) => {
      if (!watching.current) return
      const added = records.flatMap((r) => Array.from(r.addedNodes)).filter(animatable)
      enter(added)
    })
    observer.observe(root, { childList: true })
    const stop = setTimeout(() => {
      watching.current = false
      observer.disconnect()
    }, 8000)

    return () => {
      clearTimeout(stop)
      observer.disconnect()
    }
    // Hanya saat dipasang: template memberi kunci baru di setiap perpindahan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={scope} className="page-enter">
      {children}
    </div>
  )
}
