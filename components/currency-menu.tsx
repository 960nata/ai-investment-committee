'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useCurrency } from './currency-provider'
import { MAJOR_CURRENCY_CODES, type MajorCurrencyCode } from '@/lib/forex/types'
import { RegionFlag } from './flags'

export function CurrencyMenu() {
  const { activeCurrency, setCurrency, currencies, rates } = useCurrency()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const currentMeta = currencies[activeCurrency]

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        title="Ganti mata uang acuan"
        aria-expanded={open}
      >
        <RegionFlag region={currentMeta?.flagRegion} size={13} />
        <span>{activeCurrency}</span>
        <span className="text-[10px] text-[var(--muted)]">({currentMeta?.symbol})</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 py-1 max-h-80 overflow-y-auto backdrop-blur-md">
          <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
            Mata Uang Utama Dunia
          </div>
          {MAJOR_CURRENCY_CODES.map((code) => {
            const meta = currencies[code]
            const isSelected = code === activeCurrency
            const rateVsUSD = rates[code] ?? 1

            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setCurrency(code as MajorCurrencyCode)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors ${
                  isSelected ? 'bg-[var(--surface-active)] font-bold text-[var(--primary)]' : 'text-[var(--foreground)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RegionFlag region={meta.flagRegion} size={14} />
                  <div>
                    <span className="font-mono font-bold mr-1">{code}</span>
                    <span className="text-[11px] text-[var(--muted)] font-normal">
                      {meta.symbol} · {meta.name}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-[var(--muted)] text-right">
                  {code === 'USD' ? '1.00' : rateVsUSD < 1 ? rateVsUSD.toFixed(3) : Math.round(rateVsUSD).toLocaleString('id-ID')}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
