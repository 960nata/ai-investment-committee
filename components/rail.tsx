'use client'

/**
 * Rel navigasi kiri.
 *
 * Halaman yang sedang dibuka ditandai pita tipis di tepi, bukan blok warna
 * penuh: pita membaca seperti penunjuk pada panel, blok membaca seperti tombol
 * yang masih bisa ditekan lagi.
 *
 * Satu-satunya alasan berkas ini berjalan di klien adalah `usePathname`. Sisa
 * kerangka aplikasi tetap dirender di server.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconFlow, IconGauge, IconPulse, IconRows, IconNews, IconClose } from './icons'
import { useSidebar } from './sidebar-context'

export const SECTIONS = [
  {
    label: 'Pasar',
    links: [
      { href: '/', label: 'Ringkasan', icon: IconGauge },
      { href: '/instruments', label: 'Instrumen', icon: IconRows },
      { href: '/berita', label: 'Warta & Intelijen AI', icon: IconNews },
    ],
  },
  {
    label: 'Mesin',
    links: [
      { href: '/backtest', label: 'Backtest', icon: IconPulse },
      { href: '/pipeline', label: 'Pipeline', icon: IconFlow },
    ],
  },
]

export function Rail() {
  const pathname = usePathname()
  const { open, close } = useSidebar()

  return (
    <>
      {/* Lapisan redup saat sidebar terbuka di layar mobile */}
      <div
        className={`rail-backdrop ${open ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside className={`rail ${open ? 'open' : ''}`} aria-label="Navigasi Utama">
        {/* Kepala sidebar khusus mobile dengan tombol tutup */}
        <div className="rail-mobile-head">
          <div className="topbar-brand" style={{ width: 'auto', border: 'none', padding: 0, height: 'auto' }}>
            <span className="mark-glyph">
              <IconPulse size={14} />
            </span>
            <span className="mark-name">Komite</span>
            <span className="mark-phase">f1</span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={close}
            aria-label="Tutup navigasi rel"
            style={{ padding: '4px 8px' }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {SECTIONS.map((section) => (
          <nav key={section.label} className="rail-group">
            <span className="rail-label">{section.label}</span>
            {section.links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="rail-link"
                aria-current={pathname === href ? 'page' : undefined}
                onClick={close}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
        ))}

        <div className="rail-foot">
          <strong>Alat ukur</strong>
          Menampilkan peluang beserta data mentahnya. Tidak pernah menganjurkan satu pun
          keputusan.
        </div>
      </aside>
    </>
  )
}
