/**
 * Kepala halaman alat investor. Label Beta dan catatannya ditulis sekali di
 * sini supaya semua halaman beta berkata hal yang sama dengan cara yang sama.
 */

import { IconAlert } from '../icons'
import { Tag } from '../ui'

export function BetaHead({
  eyebrow,
  title,
  lead,
  note,
}: {
  eyebrow: string
  title: string
  lead: string
  /** Catatan khusus halaman. Kosong berarti catatan beta umum. */
  note?: string
}) {
  return (
    <header className="masthead">
      <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {eyebrow}
        <Tag tone="signal">Beta</Tag>
      </p>
      <h1 className="headline">{title}</h1>
      <p className="standfirst">{lead}</p>
      <p className="beta-note">
        <IconAlert size={13} style={{ flex: 'none', marginTop: 3, color: 'var(--signal)' }} />
        <span>
          {note ??
            'Fitur ini masih tahap uji coba. Tampilan dan perhitungannya bisa berubah; laporkan bila ada angka yang janggal.'}{' '}
          Bukan anjuran membeli atau menjual.
        </span>
      </p>
    </header>
  )
}
