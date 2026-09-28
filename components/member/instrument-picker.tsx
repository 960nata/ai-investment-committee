'use client'

/**
 * Pemilih instrumen dengan pencarian.
 *
 * Daftar instrumen dikirim dari server sekali, lalu disaring di peramban.
 * Ratusan baris tidak butuh pencarian ke server di tiap ketukan.
 *
 * Daftar pilihan dirender lewat portal ke `body` dengan posisi `fixed`.
 * Sebelumnya ia tinggal di dalam panel: terpotong oleh `overflow: hidden`
 * panel, dan tertimpa panel berikutnya yang punya lapisan (stacking context)
 * sendiri. Di `body` tidak ada yang bisa menimpanya.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Tinggi maksimal daftar; sama dengan `max-height` di CSS. */
const LIST_MAX_HEIGHT = 280

export interface PickerOption {
  id: number
  symbol: string
  name: string
  assetClass: string
}

export function InstrumentPicker({
  options,
  value,
  onChange,
  placeholder = 'Cari simbol atau nama…',
  exclude,
}: {
  options: PickerOption[]
  value: number | null
  onChange: (id: number) => void
  placeholder?: string
  /** Instrumen yang tidak perlu ditawarkan lagi, misalnya yang sudah dipilih. */
  exclude?: number[]
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [place, setPlace] = useState<React.CSSProperties | null>(null)

  /** Hitung posisi daftar dari posisi input; buka ke atas bila ruang di bawah sempit. */
  const measure = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const r = input.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const openUp = below < LIST_MAX_HEIGHT + 12 && r.top > below
    setPlace({
      position: 'fixed',
      left: r.left,
      width: r.width,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
  }, [])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  // Ikuti input saat halaman atau panel digulir dan saat layar berubah ukuran.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  const selected = options.find((o) => o.id === value) ?? null

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const skip = new Set(exclude ?? [])
    return options
      .filter((o) => !skip.has(o.id))
      .filter((o) => !q || o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
      .slice(0, 40)
  }, [options, query, exclude])

  function choose(option: PickerOption) {
    onChange(option.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : selected ? `${selected.symbol} · ${selected.name}` : query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setCursor(0)
        }}
        onBlur={() => {
          // Ditunda sebentar supaya klik pada opsi sempat terbaca sebelum daftar tertutup.
          blurTimer.current = setTimeout(() => setOpen(false), 120)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && open && matches[cursor]) {
            e.preventDefault()
            choose(matches[cursor])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open &&
        place &&
        createPortal(
          <div className="picker-list" id={listId} role="listbox" style={place}>
            {matches.length === 0 ? (
              <div className="picker-option dim">Tidak ada yang cocok</div>
            ) : (
              matches.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className="picker-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current)
                    choose(o)
                  }}
                >
                  <span className="key">{o.symbol}</span>
                  <span>{o.name}</span>
                  <span className="dim">{o.assetClass}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
