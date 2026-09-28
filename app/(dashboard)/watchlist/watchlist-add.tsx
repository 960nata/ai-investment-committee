'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'
import { ASSET_TABS } from '@/lib/member/labels'

export function WatchlistAdd({ options, exclude }: { options: PickerOption[]; exclude: number[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState('semua')
  const active = ASSET_TABS.find((t) => t.id === tab) ?? ASSET_TABS[0]
  const tabOptions = useMemo(
    () => (active.classes ? options.filter((o) => active.classes!.includes(o.assetClass)) : options),
    [options, active],
  )

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
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="tabs" role="tablist" aria-label="Saring menurut kelas aset">
        {ASSET_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={t.id === tab}
            onClick={() => {
              setTab(t.id)
              setPicked(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: '1 1 280px' }}>
          <span className="field-label">Tambah instrumen</span>
          <InstrumentPicker
            options={tabOptions}
            value={picked}
            onChange={setPicked}
            exclude={exclude}
            placeholder={active.classes ? `Cari ${active.label.toLowerCase()}…` : 'Cari simbol atau nama…'}
          />
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
