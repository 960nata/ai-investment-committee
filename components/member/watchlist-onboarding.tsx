'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import './watchlist-onboarding.css'

/**
 * Langkah pertama pengguna baru: pilih aset yang dipegang.
 *
 * Tanpa ini watchlist semua pengguna kosong, dan watchlist kosong berarti
 * ringkasan mingguan dan alert tidak punya bahan — tidak ada alasan untuk
 * kembali. Muncul di Ringkasan hanya selama watchlist masih kosong.
 */
export function WatchlistOnboarding({
  options,
}: {
  options: { id: number; symbol: string; name: string }[]
}) {
  const router = useRouter()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (options.length === 0) return null

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      for (const instrumentId of picked) {
        const res = await fetch('/api/v1/user/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ instrumentId }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? 'Gagal menyimpan watchlist')
        }
      }
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <section className="panel wl-onboard">
      <div className="panel-body">
        <p className="wl-onboard-step mono">LANGKAH PERTAMA · 30 DETIK</p>
        <h2 className="wl-onboard-title">Aset apa yang Anda pegang atau incar?</h2>
        <p className="wl-onboard-lead">
          Pilih beberapa. Kami kirim ringkasan mingguan skornya ke email Anda, dan Anda bisa memasang alert harga atau
          perubahan putusan komite — tanpa harus membuka situs ini tiap hari.
        </p>
        <div className="wl-onboard-grid">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`wl-onboard-chip${picked.has(o.id) ? ' on' : ''}`}
              aria-pressed={picked.has(o.id)}
              onClick={() => toggle(o.id)}
            >
              <strong>{o.symbol.replace(/\.JK$/, '')}</strong>
              <span>{o.name}</span>
            </button>
          ))}
        </div>
        {error && <p className="wl-onboard-error">{error}</p>}
        <div className="wl-onboard-actions">
          <button type="button" className="btn btn-primary mono" disabled={picked.size === 0 || busy} onClick={save}>
            {busy ? 'Menyimpan…' : `Simpan ${picked.size || ''} ke watchlist`}
          </button>
          <span className="wl-onboard-hint">Aset lain bisa ditambah lewat bintang di daftar instrumen di bawah.</span>
        </div>
      </div>
    </section>
  )
}
