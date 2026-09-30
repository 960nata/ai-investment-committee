'use client'

/**
 * Muat ulang data server halaman analitik secara berkala.
 *
 * `router.refresh()` menjalankan ulang Server Component tanpa memuat ulang
 * peramban, jadi posisi gulir dan rentang yang dipilih tetap. Berhenti selama
 * tab tersembunyi: tiap penyegaran memakan kuota realtime GA4, dan tab yang
 * tidak dilihat tidak butuh angka baru.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function RealtimeRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  const remaining = useRef(seconds)
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      remaining.current -= 1
      if (remaining.current <= 0) {
        remaining.current = seconds
        router.refresh()
      }
      setLeft(remaining.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [router, seconds])

  return <span className="ga-live-refresh mono">segar dalam {left}d</span>
}
