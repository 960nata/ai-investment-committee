'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconUser,
  IconLock,
  IconClose,
  IconGauge,
  IconPulse,
} from '@/components/icons'

export interface UserMenuProfile {
  name: string
  email?: string
  role?: 'admin' | 'user'
  avatarUrl?: string | null
}

interface UserMenuProps {
  user: UserMenuProfile | null
  isAdmin?: boolean
  variant?: 'dashboard' | 'landing'
}

/**
 * Menu dropdown avatar profil pengguna.
 *
 * Menampilkan lingkaran foto profil terkompresi WebP atau inisial nama.
 * Saat diklik, membuka dropdown berisi informasi akun, tautan ke Terminal
 * (jika di luar dashboard), Profil Saya, Dashboard Admin, dan tombol Keluar.
 */
export function UserMenu({
  user,
  isAdmin = false,
  variant = 'dashboard',
}: UserMenuProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const imgError = Boolean(user?.avatarUrl && failedAvatar === user.avatarUrl)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Tutup dropdown saat klik di luar atau tekan tombol Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // Abaikan kegagalan jaringan saat keluar
    }
    setIsOpen(false)
    router.push('/')
    router.refresh()
  }

  if (!user && !isAdmin) {
    return null
  }

  const displayName = user?.name || 'Administrator'
  const displayEmail = user?.email || (isAdmin ? 'admin@komite.id' : '')
  const isSuperAdmin = isAdmin || user?.role === 'admin'

  // Ambil inisial nama (1-2 karakter)
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const hasAvatar = Boolean(user?.avatarUrl && !imgError)

  return (
    <div className="user-menu-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`user-menu-trigger ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={`Akun: ${displayName} (${isSuperAdmin ? 'Admin' : 'Analis'})`}
      >
        <div className={`user-avatar-circle ${isSuperAdmin ? 'is-admin' : ''}`}>
          {hasAvatar ? (
            <img
              src={user!.avatarUrl!}
              alt={displayName}
              className="user-avatar-img"
              onError={() => setFailedAvatar(user?.avatarUrl ?? null)}
            />
          ) : (
            <span className="user-avatar-initials mono">{initials}</span>
          )}
          <span className={`user-avatar-badge ${isSuperAdmin ? 'badge-admin' : 'badge-user'}`} />
        </div>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown" role="menu">
          {/* Header Profil */}
          <div className="user-menu-header">
            <div className="user-menu-avatar-large">
              {hasAvatar ? (
                <img
                  src={user!.avatarUrl!}
                  alt={displayName}
                  className="user-avatar-img"
                />
              ) : (
                <span className="user-avatar-initials mono">{initials}</span>
              )}
            </div>
            <div className="user-menu-meta">
              <span className="user-menu-name" title={displayName}>
                {displayName}
              </span>
              {displayEmail && (
                <span className="user-menu-email mono" title={displayEmail}>
                  {displayEmail}
                </span>
              )}
              <div className="user-menu-role">
                {isSuperAdmin ? (
                  <span className="badge-pill-role role-admin mono">
                    <IconLock size={10} />
                    ADMINISTRATOR
                  </span>
                ) : (
                  <span className="badge-pill-role role-user mono">
                    <IconUser size={10} />
                    ANALIS KOMITE
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="user-menu-divider" />

          {/* Opsi Menu Berdasarkan Halaman */}
          <div className="user-menu-list">
            {/* Jika di luar dashboard (landing page, warta, panduan), tampilkan opsi Terminal */}
            {variant === 'landing' && (
              <Link
                href="/ringkasan"
                className="user-menu-item"
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <div className="user-menu-icon" style={{ color: 'var(--signal)' }}>
                  <IconGauge size={15} />
                </div>
                <div className="user-menu-text">
                  <span className="user-menu-title">Terminal Analisis</span>
                  <span className="user-menu-sub">Buka sidang 4 agen AI &amp; grafik pasar</span>
                </div>
              </Link>
            )}

            {/* Opsi Profil Saya (Selalu ada baik di dashboard maupun luar dashboard) */}
            <Link
              href="/profil"
              className="user-menu-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <div className="user-menu-icon">
                <IconUser size={15} />
              </div>
              <div className="user-menu-text">
                <span className="user-menu-title">Profil Saya</span>
                <span className="user-menu-sub">Foto profil WebP &amp; info akun</span>
              </div>
            </Link>

            {/* Opsi Dashboard Admin jika admin */}
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="user-menu-item"
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <div className="user-menu-icon" style={{ color: 'var(--amber)' }}>
                  <IconLock size={15} />
                </div>
                <div className="user-menu-text">
                  <span className="user-menu-title">Dashboard Admin</span>
                  <span className="user-menu-sub">Kelola pengguna, warta &amp; sistem</span>
                </div>
              </Link>
            )}

            {/* Jika di dashboard, sediakan tautan kembali ke Landing / Halaman Depan */}
            {variant === 'dashboard' && (
              <Link
                href="/"
                className="user-menu-item"
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <div className="user-menu-icon" style={{ color: 'var(--ink-soft)' }}>
                  <IconPulse size={15} />
                </div>
                <div className="user-menu-text">
                  <span className="user-menu-title">Halaman Utama</span>
                  <span className="user-menu-sub">Beranda publik &amp; warta pasar</span>
                </div>
              </Link>
            )}
          </div>

          <div className="user-menu-divider" />

          {/* Tombol Logout */}
          <div className="user-menu-footer">
            <button
              type="button"
              className="user-menu-logout-btn mono"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <IconClose size={13} />
              <span>{isLoggingOut ? 'Sedang keluar...' : 'Keluar'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
