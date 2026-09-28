'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'

export function WatchlistAdd({ options, exclude }: { options: PickerOption[]; exclude: number[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function add() {
    if (picked === null) return
    setError(null)
    const res = await fetch('/api/v1/user/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: picked }),
    })
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? 'Gagal menambahkan.')
      return
    }
    setPicked(null)
    startTransition(() => router.refresh())
  }

  return (
    <div>
      <div className="form-row">
        <div className="field" style={{ flex: '1 1 280px' }}>
          <span className="field-label">Tambah instrumen</span>
          <InstrumentPicker options={options} value={picked} onChange={setPicked} exclude={exclude} />
        </div>
        <button type="button" className="btn btn-signal" onClick={add} disabled={picked === null || pending}>
          <IconPlus size={13} />
          Pantau
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
