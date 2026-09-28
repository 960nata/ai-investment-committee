'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { IconClose } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'

/** Pilihan disimpan di alamat (?ids=), supaya perbandingan bisa dibagikan dan ditandai. */
export function ComparePicker({ options, selected, max }: { options: PickerOption[]; selected: number[]; max: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const byId = new Map(options.map((o) => [o.id, o]))

  function go(ids: number[]) {
    startTransition(() => router.push(ids.length ? `/bandingkan?ids=${ids.join(',')}` : '/bandingkan'))
  }

  return (
    <div className="form-row" style={{ opacity: pending ? 0.6 : 1 }}>
      {selected.map((id) => (
        <span key={id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{byId.get(id)?.symbol ?? id}</strong>
          <button type="button" onClick={() => go(selected.filter((x) => x !== id))} aria-label="Keluarkan dari perbandingan">
            <IconClose size={11} />
          </button>
        </span>
      ))}
      {selected.length < max && (
        <div className="field" style={{ flex: '1 1 260px' }}>
          <InstrumentPicker
            options={options}
            value={null}
            exclude={selected}
            placeholder="Tambah instrumen untuk dibandingkan…"
            onChange={(id) => go([...selected, id])}
          />
        </div>
      )}
    </div>
  )
}
