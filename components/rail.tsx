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
import { IconFlow, IconGauge, IconPulse, IconRows } from './icons'

export const SECTIONS = [
  {
    label: 'Pasar',
    links: [
      { href: '/', label: 'Ringkasan', icon: IconGauge },
      { href: '/instruments', label: 'Instrumen', icon: IconRows },
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

  return (
    <aside className="rail">
      {SECTIONS.map((section) => (
        <nav key={section.label} className="rail-group">
          <span className="rail-label">{section.label}</span>
          {section.links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="rail-link"
              aria-current={pathname === href ? 'page' : undefined}
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
  )
}
