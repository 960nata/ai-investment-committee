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

const ENDPOINT = '/api/v1/analytics/collect'
/** Klik per halaman yang dikirim paling banyak; sisanya hanya menambah bising. */
const MAX_CLICKS_PER_PAGE = 50
const FLUSH_MS = 8_000

interface PendingClick {
  x: number
  y: number
  label: string | null
  href: string | null
  tag: string | null
}

function post(body: unknown) {
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}

/**
 * Nama elemen yang diklik, untuk tabel "paling banyak diklik".
 *
 * Hanya tautan dan tombol — klik di teks biasa tetap masuk peta panas tetapi
 * tanpa nama. Isian formulir dan apa pun di dalam [data-private] dilewati
 * sepenuhnya, supaya ketikan pengunjung tidak pernah ikut terkirim.
 */
function describe(target: EventTarget | null): { label: string | null; href: string | null; tag: string | null } | 'skip' {
  if (!(target instanceof Element)) return { label: null, href: null, tag: null }
  if (target.closest('input, textarea, select, [contenteditable="true"], [data-private]')) return 'skip'
  const el = target.closest('a, button, [role="button"], summary, [data-track]')
  if (!el) return { label: null, href: null, tag: null }
  const text =
    el.getAttribute('data-track') ||
    el.getAttribute('aria-label') ||
    (el.textContent ?? '').replace(/\s+/g, ' ').trim() ||
    el.getAttribute('title')
  const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null
  return { label: text ? text.slice(0, 80) : href, href, tag: el.tagName.toLowerCase() }
}

export function VisitBeacon() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // React memanggil effect dua kali di mode ketat pengembangan. Tanpa penjaga
  // ini tiap muatan halaman tercatat dua kali, dan angkanya diam-diam dobel.
  const lastSent = useRef<string | null>(null)
  const firstView = useRef(true)

  // Klik untuk peta panas dan tabel "paling banyak diklik". Dikumpulkan per
  // halaman dan dikirim berkelompok — satu ketukan per klik akan menabrak
  // batas laju beacon dalam hitungan detik.
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return
    let pending: PendingClick[] = []
    let sent = 0

    const flush = () => {
      if (pending.length === 0) return
      post({ type: 'click', path: pathname, clicks: pending })
      pending = []
    }

    const onClick = (event: MouseEvent) => {
      if (sent >= MAX_CLICKS_PER_PAGE) return
      const info = describe(event.target)
      if (info === 'skip') return
      const doc = document.documentElement
      const width = Math.max(doc.scrollWidth, 1)
      const height = Math.max(doc.scrollHeight, 1)
      pending.push({
        x: Math.min(1, Math.max(0, event.pageX / width)),
        y: Math.min(1, Math.max(0, event.pageY / height)),
        ...info,
      })
      sent++
      if (pending.length >= 20) flush()
    }

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    document.addEventListener('click', onClick, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onHide)
    const interval = setInterval(flush, FLUSH_MS)

    return () => {
      // Pindah halaman: klik halaman lama dikirim atas nama halaman lama.
      flush()
      clearInterval(interval)
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [pathname])

  useEffect(() => {
    if (!pathname) return

    // Halaman masuk dan daftar sengaja dilewati: alamatnya memuat `next=` yang
    // isinya jalur tujuan, dan tidak ada gunanya menyimpan itu berulang kali.
    if (pathname === '/login' || pathname === '/daftar') return

    const key = pathname
    if (lastSent.current === key) return
    lastSent.current = key

    // Rujukan hanya berarti di muatan pertama. Sesudah itu document.referrer
    // tetap menunjuk situs asal walau pengunjung sudah pindah halaman.
    const referrer = firstView.current ? document.referrer || null : null
    firstView.current = false

    // Dikirim setelah halaman selesai menggambar supaya tidak ikut berebut
    // dengan permintaan yang benar-benar dibutuhkan pengunjung.
    const timer = setTimeout(() => {
      post({ type: 'view', path: pathname, referrer })
    }, 600)

    return () => clearTimeout(timer)
    // `searchParams` ikut jadi ketergantungan supaya perpindahan yang hanya
    // mengubah kueri tidak menahan effect ini pada nilai lama, tetapi kuncinya
    // tetap jalur saja — satu halaman, satu catatan.
  }, [pathname, searchParams])

  return null
}
