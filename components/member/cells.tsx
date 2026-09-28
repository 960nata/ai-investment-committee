/**
 * Sel tabel bersama untuk halaman alat investor. Tanpa 'use client' supaya
 * bisa dipakai halaman server maupun komponen klien.
 */

import { Tag } from '../ui'
import { formatPct } from '@/lib/format/market'
import { verdictLabel, verdictTone } from '@/lib/format/verdict'

export function ChangeText({ value }: { value: number | null }) {
  const cls = value === null ? 'flat' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return <span className={`change ${cls}`}>{formatPct(value)}</span>
}

/** Skor −10..+10 dengan warna arah; kosong ditulis garis, bukan nol. */
export function ScoreText({ value }: { value: number | undefined | null }) {
  if (value === undefined || value === null) return <span className="dim">—</span>
  const color = value >= 1 ? 'var(--measured)' : value <= -1 ? 'var(--halted)' : 'var(--ink-soft)'
  return (
    <span style={{ fontFamily: 'var(--mono)', color }}>
      {value > 0 ? '+' : ''}
      {value.toFixed(2).replace('.', ',')}
    </span>
  )
}

export function VerdictTag({ verdict }: { verdict: string | null | undefined }) {
  // Garis, bukan kalimat: kolom putusan di ponsel tidak muat "belum ada rapat".
  if (!verdict)
    return (
      <span className="dim" title="Belum ada rapat komite untuk instrumen ini">
        —
      </span>
    )
  const tone = verdictTone(verdict)
  return <Tag tone={tone === 'neutral' ? 'neutral' : tone}>{verdictLabel(verdict)}</Tag>
}
