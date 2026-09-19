'use client'

/**
 * Kerangka aplikasi.
 *
 * Rel kiri diberi label mono huruf kecil rapat seperti penanda pada panel alat,
 * bukan menu aplikasi. Halaman yang sedang dibuka ditandai pita tipis di tepi,
 * bukan blok warna penuh: pita membaca seperti penunjuk, blok membaca seperti
 * tombol yang bisa ditekan lagi.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconFlow, IconGauge, IconPulse, IconRows } from '@/components/icons'

const SECTIONS = [
  {
    label: 'Pasar',
    links: [
      { href: '/', label: 'Ringkasan', icon: IconGauge },
      { href: '/instruments', label: 'Instrumen', icon: IconRows },
    ],
  },
  {
    label: 'Mesin',
    links: [{ href: '/pipeline', label: 'Pipeline', icon: IconFlow }],
  },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="shell">
      <aside className="rail">
        <Link href="/" className="mark">
          <span className="mark-glyph">
            <IconPulse size={15} />
          </span>
          <span className="mark-name">Komite</span>
          <span className="mark-phase">f1</span>
        </Link>

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
          Menampilkan peluang dan data mentahnya. Tidak pernah menganjurkan satu pun
          keputusan.
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  )
}
