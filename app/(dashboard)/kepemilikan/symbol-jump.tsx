'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/** Pindah saham lewat alamat (?symbol=), supaya tampilan bisa ditandai dan dibagikan. */
export function SymbolJump({ options, current }: { options: { symbol: string; name: string }[]; current: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const sorted = [...options].sort((a, b) => a.symbol.localeCompare(b.symbol))
  return (
    <label className="field" style={{ maxWidth: 360, opacity: pending ? 0.6 : 1 }}>
      <span className="field-label">Saham</span>
      <select
        className="select"
        value={current}
        onChange={(e) => startTransition(() => router.push(`/kepemilikan?symbol=${encodeURIComponent(e.target.value)}`))}
      >
        {sorted.map((o) => (
          <option key={o.symbol} value={o.symbol}>
            {o.symbol} · {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}
