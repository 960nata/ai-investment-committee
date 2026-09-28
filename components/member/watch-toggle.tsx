'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconStar } from '../icons'

/**
 * Tombol bintang watchlist.
 *
 * Keadaannya berganti seketika lalu dikembalikan bila server menolak, supaya
 * ketukan terasa langsung tanpa berbohong soal hasil akhirnya.
 */
export function WatchToggle({
  instrumentId,
  initialOn,
  refresh = false,
  compact = false,
  onChange,
}: {
  instrumentId: number
  initialOn: boolean
  /** Muat ulang data server setelah berubah — untuk halaman yang daftarnya bergantung pada watchlist. */
  refresh?: boolean
  compact?: boolean
  /** Dipanggil setelah server menerima perubahan. */
  onChange?: (on: boolean) => void
}) {
  const router = useRouter()
  const [on, setOn] = useState(initialOn)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  async function toggle() {
    const next = !on
    setOn(next)
    setBusy(true)
    try {
      const res = await fetch('/api/v1/user/watchlist', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instrumentId }),
      })
      if (!res.ok) {
        setOn(!next)
        const body = await res.json().catch(() => null)
        if (body?.error) alert(body.error)
      } else {
        onChange?.(next)
        if (refresh) startTransition(() => router.refresh())
      }
    } catch {
      setOn(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`watch-btn ${on ? 'on' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={on ? 'Hapus dari watchlist' : 'Tambahkan ke watchlist'}
    >
      <IconStar size={12} filled={on} />
      {!compact && (on ? 'Dipantau' : 'Pantau')}
    </button>
  )
}
