'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconGauge, IconNews, IconPlus, IconTarget, IconUser } from '@/components/icons'

export function AdminNavLinks() {
  const pathname = usePathname()

  const links = [
    { href: '/admin', label: 'Ringkasan Admin', icon: IconGauge, exact: true },
    { href: '/admin/berita', label: 'Warta CMS', icon: IconNews, exact: true },
    { href: '/admin/berita/baru', label: '+ Tulis Berita', icon: IconPlus, exact: true },
    { href: '/admin/ads', label: 'Slot Iklan (AdSense)', icon: IconTarget, exact: true },
    { href: '/admin/users', label: 'Manajemen Pengguna', icon: IconUser, exact: true },
  ]

  return (
    <nav className="admin-sidebar-nav">
      {links.map((link) => {
        const Icon = link.icon
        const isActive = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href)

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`admin-sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={14} />
            <span>{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
