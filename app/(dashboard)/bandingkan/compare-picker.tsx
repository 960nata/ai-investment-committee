'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { IconClose } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'
import { ASSET_CLASS_LABEL, ASSET_TABS } from '@/lib/member/labels'

/**
 * Tab kelas aset hanya menyaring daftar pilihan. Instrumen yang sudah dipilih
 * tetap tinggal saat tab berganti, jadi perbandingan lintas kelas — saham
 * lawan kripto lawan emas — tetap bisa disusun.
 */
const TABS = ASSET_TABS

/** Pilihan disimpan di alamat (?ids=), supaya perbandingan bisa dibagikan dan ditandai. */
export function ComparePicker({ options, selected, max }: { options: PickerOption[]; selected: number[]; max: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState('semua')
  const byId = new Map(options.map((o) => [o.id, o]))

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const tabOptions = useMemo(
    () => (active.classes ? options.filter((o) => active.classes!.includes(o.assetClass)) : options),
    [options, active],
  )

  function go(ids: number[]) {
    startTransition(() => router.push(ids.length ? `/bandingkan?ids=${ids.join(',')}` : '/bandingkan'))
  }

  const classesPicked = new Set(selected.map((id) => byId.get(id)?.assetClass).filter(Boolean))

  return (
    <div style={{ display: 'grid', gap: 12, opacity: pending ? 0.6 : 1 }}>
      <div className="tabs" role="tablist" aria-label="Saring menurut kelas aset">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="tab-count">
              {t.classes ? options.filter((o) => t.classes!.includes(o.assetClass)).length : options.length}
            </span>
          </button>
        ))}
      </div>

      <div className="form-row">
        {selected.map((id) => {
          const o = byId.get(id)
          return (
            <span key={id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{o?.symbol ?? id}</strong>
              {o && <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{ASSET_CLASS_LABEL[o.assetClass] ?? o.assetClass}</span>}
              <button type="button" onClick={() => go(selected.filter((x) => x !== id))} aria-label="Keluarkan dari perbandingan">
                <IconClose size={11} />
              </button>
            </span>
          )
        })}
        {selected.length < max && (
          <div className="field" style={{ flex: '1 1 260px' }}>
            <InstrumentPicker
              options={tabOptions}
              value={null}
              exclude={selected}
              placeholder={
                active.classes ? `Tambah ${active.label.toLowerCase()} untuk dibandingkan…` : 'Tambah instrumen untuk dibandingkan…'
              }
              onChange={(id) => go([...selected, id])}
            />
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <p className="kpi-note" style={{ margin: 0 }}>
          {classesPicked.size > 1
            ? 'Perbandingan lintas kelas aset: bandingkan imbal hasil dan volatilitasnya, bukan harga nominalnya.'
            : 'Pindah tab untuk menambahkan aset dari kelas lain — misalnya saham lawan kripto lawan emas.'}
        </p>
      )}
    </div>
  )
}
