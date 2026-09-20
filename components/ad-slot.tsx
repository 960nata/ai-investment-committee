import Link from 'next/link'
import type { AdSettingsRow } from '@/lib/db/schema'
import { IconExternalLink } from './icons'

interface AdSlotProps {
  slot?: AdSettingsRow | null
  className?: string
  style?: React.CSSProperties
}

/**
 * Komponen penampil slot iklan strategis.
 * Jika slot disetel nonaktif (isEnabled: false) atau tidak ditemukan,
 * komponen ini mengembalikan NULL tanpa menyisakan celah kosong di halaman.
 */
export function AdSlot({ slot, className, style }: AdSlotProps) {
  if (!slot || !slot.isEnabled) {
    return null
  }

  // Jika ada script / HTML mentah kustom (misal Google AdSense)
  if (slot.adCodeHtml && slot.adCodeHtml.trim().length > 0) {
    return (
      <div
        className={`ad-slot-wrapper ad-slot-${slot.slotName} ${className || ''}`}
        style={{
          margin: 'var(--space-4) 0',
          padding: 'var(--space-3)',
          background: 'var(--surface-1)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          ...style,
        }}
      >
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--mono)',
            color: 'var(--ink-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '6px',
            textAlign: 'right',
          }}
        >
          Sponsor / Ad
        </div>
        <div dangerouslySetInnerHTML={{ __html: slot.adCodeHtml }} />
      </div>
    )
  }

  // Jika berupa Banner / Tautan Afiliasi Sponsor
  return (
    <div
      className={`ad-slot-wrapper ad-slot-${slot.slotName} ${className || ''}`}
      style={{
        margin: 'var(--space-4) 0',
        padding: '16px',
        background: 'var(--surface-1)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <span
          className="tag mono"
          style={{ fontSize: '9px', color: 'var(--ink-mute)', borderColor: 'var(--line)' }}
        >
          {slot.sponsorName || 'Sponsor Terverifikasi'}
        </span>
        <span
          className="mono"
          style={{ fontSize: '9px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}
        >
          Informasi Komersial
        </span>
      </div>

      {slot.imageUrl && (
        <div style={{ marginBottom: '10px', overflow: 'hidden', borderRadius: 'var(--radius-sm)' }}>
          {slot.targetUrl ? (
            <a href={slot.targetUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={slot.imageUrl}
                alt={slot.title}
                style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
              />
            </a>
          ) : (
            <img
              src={slot.imageUrl}
              alt={slot.title}
              style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
      )}

      {slot.title && (
        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>
          {slot.targetUrl ? (
            <a
              href={slot.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink)', textDecoration: 'none' }}
            >
              {slot.title}
            </a>
          ) : (
            slot.title
          )}
        </h4>
      )}

      {slot.description && (
        <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.5 }}>
          {slot.description}
        </p>
      )}

      {slot.targetUrl && (
        <a
          href={slot.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-quiet"
          style={{
            fontSize: '11px',
            fontFamily: 'var(--mono)',
            padding: '4px 10px',
            border: '1px solid var(--line)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>Kunjungi Situs Sponsor</span>
          <IconExternalLink size={12} />
        </a>
      )}
    </div>
  )
}
