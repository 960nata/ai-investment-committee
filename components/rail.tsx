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
import {
  IconFlow,
  IconGauge,
  IconPulse,
  IconRows,
  IconNews,
  IconClose,
  IconUser,
  IconStar,
  IconWallet,
  IconBell,
  IconFilter,
  IconScales,
  IconHistory,
  IconGlobe,
  IconUsers,
  IconChat,
} from './icons'
import { useSidebar } from './sidebar-context'
import { MadeBy } from './credit'

interface RailLink {
  href: string
  label: string
  icon: (props: { size?: number }) => React.ReactNode
  /** Fitur yang masih diuji; diberi penanda kecil di rel. */
  beta?: boolean
}

export const SECTIONS: { label: string; links: RailLink[] }[] = [
  {
    label: 'Pasar',
    links: [
      { href: '/ringkasan', label: 'Ringkasan', icon: IconGauge },
      { href: '/instruments', label: 'Instrumen', icon: IconRows },
      { href: '/berita', label: 'Warta & Intelijen AI', icon: IconNews },
    ],
  },
  {
    label: 'Alat Investor',
    links: [
      { href: '/watchlist', label: 'Watchlist', icon: IconStar, beta: true },
      { href: '/portofolio', label: 'Portofolio', icon: IconWallet, beta: true },
      { href: '/alert', label: 'Alert', icon: IconBell, beta: true },
      { href: '/screener', label: 'Screener', icon: IconFilter, beta: true },
      { href: '/bandingkan', label: 'Bandingkan', icon: IconScales, beta: true },
      { href: '/tanya-komite', label: 'Tanya Komite', icon: IconChat, beta: true },
    ],
  },
  {
    label: 'Riset',
    links: [
      { href: '/rekam-jejak', label: 'Rekam Jejak Komite', icon: IconHistory, beta: true },
      { href: '/kepemilikan', label: 'Kepemilikan KSEI', icon: IconUsers, beta: true },
      { href: '/makro', label: 'Makro', icon: IconGlobe, beta: true },
    ],
  },
  {
    label: 'Mesin',
    links: [
      { href: '/backtest', label: 'Backtest', icon: IconPulse },
      { href: '/pipeline', label: 'Pipeline', icon: IconFlow },
    ],
  },
  {
    label: 'Akun',
    links: [
      { href: '/profil', label: 'Profil Saya', icon: IconUser },
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
            <span className="mark-name">AI Investdesk</span>
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
            {section.links.map(({ href, label, icon: Icon, beta }) => (
              <Link
                key={href}
                href={href}
                className="rail-link"
                aria-current={pathname === href ? 'page' : undefined}
                onClick={close}
              >
                <Icon size={16} />
                {label}
                {beta && <span className="rail-beta">beta</span>}
              </Link>
            ))}
          </nav>
        ))}

        <div className="rail-foot">
          <strong>Alat ukur</strong>
          Menampilkan peluang beserta data mentahnya. Tidak pernah menganjurkan satu pun
          keputusan.
          <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--line)' }}>
            <Link href="/admin" className="mono" style={{ color: 'var(--ink-faint)', fontSize: '11px', textDecoration: 'none' }}>
              &rarr; Portal Admin AI Investdesk
            </Link>
            <div style={{ marginTop: 6 }}>
              <MadeBy className="mono" />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
