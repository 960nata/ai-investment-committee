'use client'

import { useState } from 'react'
import { IconCheck, IconCopy } from '@/components/icons'

/** Tombol salin untuk nomor rekening atau alamat dompet. */
export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Peramban menolak akses papan klip; nilainya tetap bisa dipilih manual.
    }
  }

  return (
    <button type="button" className="donate-copy" onClick={copy} aria-label={`Salin ${value}`}>
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      <span>{copied ? 'Tersalin' : 'Salin'}</span>
    </button>
  )
}
