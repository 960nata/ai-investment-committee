'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconPulse,
  IconGauge,
  IconNews,
  IconPlus,
  IconTarget,
  IconUser,
  IconExternalLink,
  IconLock,
  IconMenu,
  IconClose,
  IconDatabase,
  IconRadar,
  IconShield,
} from '@/components/icons'
import { AdminLogoutButton } from './admin-logout-btn'

interface AdminLayoutClientProps {
  children: React.ReactNode
}

export function AdminLayoutClient({ children }: AdminLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Cari judul modul aktif untuk breadcrumb topbar
  let moduleTitle = 'Ringkasan Sistem'
  if (pathname.startsWith('/admin/analytics')) {
    moduleTitle = 'Analitik & Cyber Radar'
  } else if (pathname.startsWith('/admin/berita/baru')) {
    moduleTitle = 'Tulis Warta Baru'
  } else if (pathname.includes('/edit')) {
    moduleTitle = 'Edit Warta Berita'
  } else if (pathname.startsWith('/admin/berita')) {
    moduleTitle = 'Manajemen Warta CMS'
  } else if (pathname.startsWith('/admin/ads')) {
    moduleTitle = 'Pengaturan Slot Iklan'
  } else if (pathname.startsWith('/admin/users')) {
    moduleTitle = 'Manajemen Pengguna'
  }

  return (
    <div className="admin-shell" suppressHydrationWarning>
      {/* 1. TOPBAR ADMIN */}
      <header className="admin-topbar" suppressHydrationWarning>
        <div className="admin-topbar-left" suppressHydrationWarning>
          {/* Mobile hamburger toggle */}
          <button
            type="button"
            className="admin-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
          >
            {mobileOpen ? <IconClose size={16} /> : <IconMenu size={16} />}
          </button>

          {/* Brand Logo Admin */}
          <Link href="/admin" className="admin-brand" onClick={() => setMobileOpen(false)}>
            <span className="mark-glyph">
              <IconPulse size={15} />
            </span>
            <span className="mark-name">Komite</span>
            <span className="admin-badge mono">ADMIN</span>
          </Link>

          <span className="admin-topbar-divider mono">/</span>
          <span className="admin-topbar-module mono">{moduleTitle}</span>
        </div>

        <div className="admin-topbar-right" suppressHydrationWarning>
          {/* Status Sesi */}
          <div className="admin-session-pill mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span className="admin-session-text">Super Admin</span>
          </div>

          {/* Switcher Cepat ke Dashboard User */}
          <Link
            href="/ringkasan"
            className="admin-switch-btn mono"
            title="Beralih ke Terminal Analisis Pengguna"
          >
            <IconGauge size={13} />
            <span>Terminal User</span>
          </Link>

          {/* Tombol Logout Admin */}
          <AdminLogoutButton />
        </div>
      </header>

      {/* 2. BODY DENGAN SIDEBAR RESPONSIVE & AREA KONTEN */}
      <div className="admin-body" suppressHydrationWarning>
        {/* Mobile Backdrop Overlay */}
        {mobileOpen && (
          <div
            className="admin-sidebar-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigasi */}
        <aside className={`admin-sidebar ${mobileOpen ? 'open' : ''}`} suppressHydrationWarning>
          {/* Group 1: Ikhtisar */}
          <div className="admin-nav-group">
            <span className="admin-nav-group-title mono">IKHTISAR UTAMA</span>
            <Link
              href="/admin"
              className={`admin-nav-link ${pathname === '/admin' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconGauge size={15} />
              <span>Ringkasan Admin</span>
            </Link>

            <Link
              href="/admin/analytics"
              className={`admin-nav-link ${pathname.startsWith('/admin/analytics') ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconRadar size={15} />
              <span>Analitik Pengunjung</span>
            </Link>

            <Link
              href="/admin/keamanan"
              className={`admin-nav-link ${pathname.startsWith('/admin/keamanan') ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconShield size={15} />
              <span>Pemantau Serangan</span>
            </Link>
          </div>

          {/* Group 2: Konten Warta CMS */}
          <div className="admin-nav-group">
            <span className="admin-nav-group-title mono">KONTEN REDAKSI</span>
            <Link
              href="/admin/berita"
              className={`admin-nav-link ${
                pathname === '/admin/berita' || (pathname.startsWith('/admin/berita') && !pathname.startsWith('/admin/berita/baru'))
                  ? 'active'
                  : ''
              }`}
              onClick={() => setMobileOpen(false)}
            >
              <IconNews size={15} />
              <span>Daftar Warta CMS</span>
            </Link>

            <Link
              href="/admin/berita/baru"
              className={`admin-nav-link ${pathname === '/admin/berita/baru' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconPlus size={15} />
              <span>Tulis Warta Baru</span>
            </Link>
          </div>

          {/* Group 3: Monetisasi & Tim */}
          <div className="admin-nav-group">
            <span className="admin-nav-group-title mono">MONETISASI &amp; SISTEM</span>
            <Link
              href="/admin/ads"
              className={`admin-nav-link ${pathname.startsWith('/admin/ads') ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconTarget size={15} />
              <span>Slot Iklan (AdSense)</span>
            </Link>

            <Link
              href="/admin/users"
              className={`admin-nav-link ${pathname.startsWith('/admin/users') ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <IconUser size={15} />
              <span>Manajemen Pengguna</span>
            </Link>
          </div>

          {/* Group 4: Pintasan Luar */}
          <div className="admin-nav-group">
            <span className="admin-nav-group-title mono">PINTASAN PUBLIK</span>
            <Link
              href="/ringkasan"
              className="admin-nav-link"
              onClick={() => setMobileOpen(false)}
            >
              <IconExternalLink size={14} />
              <span>Buka Terminal Pasar</span>
            </Link>

            <Link
              href="/berita"
              className="admin-nav-link"
              onClick={() => setMobileOpen(false)}
            >
              <IconExternalLink size={14} />
              <span>Portal Berita Publik</span>
            </Link>
          </div>

          {/* Sidebar Footer */}
          <div className="admin-sidebar-footer" suppressHydrationWarning>
            <div className="admin-footer-status mono">
              <IconLock size={12} style={{ color: 'var(--signal)' }} />
              <span>Otorisasi Aktif</span>
            </div>
            <div className="admin-footer-sub mono">
              PostgreSQL · Supabase Storage
            </div>
          </div>
        </aside>

        {/* 3. AREA KONTEN UTAMA */}
        <main className="admin-main" suppressHydrationWarning>
          <div className="admin-container" suppressHydrationWarning>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
