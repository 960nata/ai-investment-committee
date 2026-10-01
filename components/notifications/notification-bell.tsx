'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useReadState } from './use-read-state'
import { useRouter } from 'next/navigation'
import { IconBell, IconNews, IconMegaphone, IconCheck } from '@/components/icons'
import type { NotificationItem } from '@/lib/notifications/types'
import {
  isItemRead,
  markItemRead,
  markAllRead,
  formatTimeAgo,
} from '@/lib/notifications/storage'

export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const { readIds, lastAllTime } = useReadState()
  const [isLoading, setIsLoading] = useState(true)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Baca status terbaca dari localStorage


  // Muat data notifikasi dari API
  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/feed', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { ok: boolean; items: NotificationItem[] }
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items)
      }
    } catch {
      // Diamkan galat jaringan agar antarmuka bar atas tetap bersih
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void loadNotifications() })

    // Polling setiap 60 detik saat tab aktif
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadNotifications()
      }
    }, 60_000)


    return () => {
      active = false
      clearInterval(timer)
    }
  }, [loadNotifications])

  // Tutup dropdown saat klik di luar atau tombol Escape ditekan
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

  // Hitung jumlah belum dibaca
  const unreadCount = items.filter((item) => !isItemRead(item, readIds, lastAllTime)).length

  // Sesuai aturan pengguna: jika lebih dari 9, tampilkan "9+"
  const badgeLabel = unreadCount > 9 ? '9+' : unreadCount > 0 ? unreadCount.toString() : null

  // Dropdown hanya menampilkan 3 notifikasi teratas ("dropdon 3")
  const dropdownItems = items.slice(0, 3)

  function handleMarkAllRead() {
    markAllRead(items)
  }

  function handleItemClick(item: NotificationItem) {
    markItemRead(item.id)
    setIsOpen(false)
    router.push(item.linkUrl)
  }

  return (
    <div className="notification-bell-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`notification-bell-btn ${isOpen ? 'is-active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Notifikasi: ${unreadCount > 0 ? `${unreadCount} belum dibaca` : 'tidak ada yang baru'}`}
        title={`Notifikasi (${unreadCount > 0 ? `${badgeLabel} baru` : '0 baru'})`}
      >
        <span className="notification-bell-icon">
          <IconBell size={16} />
        </span>

        {badgeLabel && (
          <span className="notification-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown" role="dialog" aria-label="Menu Notifikasi Cepat">
          {/* Header Dropdown */}
          <div className="notification-dropdown-header">
            <div className="notification-header-title">
              <span>Notifikasi</span>
              {unreadCount > 0 ? (
                <span className="notification-unread-pill">{badgeLabel} Baru</span>
              ) : (
                <span className="notification-read-pill">Semua Terbaca</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all-btn"
                onClick={handleMarkAllRead}
                title="Tandai semua notifikasi sudah dibaca"
              >
                <IconCheck size={12} />
                <span>Tandai dibaca</span>
              </button>
            )}
          </div>

          {/* List 3 Notifikasi Teratas */}
          <div className="notification-dropdown-list">
            {dropdownItems.length === 0 ? (
              <div className="notification-empty-dropdown">
                {isLoading ? 'Memuat notifikasi...' : 'Belum ada notifikasi baru'}
              </div>
            ) : (
              dropdownItems.map((item) => {
                const read = isItemRead(item, readIds, lastAllTime)
                const isNews = item.type === 'berita'
                const isAdminNotice = item.type === 'admin'

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`notification-dropdown-item ${read ? 'is-read' : 'is-unread'}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={`notification-item-icon ${item.type}`}>
                      {isNews ? (
                        <IconNews size={14} />
                      ) : isAdminNotice ? (
                        <IconMegaphone size={14} />
                      ) : (
                        <IconBell size={14} />
                      )}
                    </div>

                    <div className="notification-item-content">
                      <div className="notification-item-meta">
                        <span className={`notification-item-tag ${item.type} ${item.tone ?? ''}`}>
                          {item.badgeLabel}
                        </span>
                        <span className="notification-item-time">{formatTimeAgo(item.createdAt)}</span>
                      </div>

                      <div className="notification-item-title">{item.title}</div>
                      <p className="notification-item-snippet">{item.body}</p>
                    </div>

                    {!read && <span className="notification-item-dot" title="Belum dibaca" />}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer Dropdown: Halaman All Notifikasi */}
          <div className="notification-dropdown-footer">
            <Link
              href="/notifikasi"
              className="notification-view-all-link"
              onClick={() => setIsOpen(false)}
            >
              Lihat Semua Notifikasi &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
