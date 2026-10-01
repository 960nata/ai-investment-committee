'use client'

/**
 * Komponen Notifikasi Header Terminal (Topbar).
 *
 * Menampilkan:
 * 1. Icon SVG Lonceng dengan indikator badge angka (atau "9+" jika lebih dari 9 belum dibaca).
 * 2. Dropdown yang menampilkan 3 notifikasi terbaru (warta pasar & pengumuman admin).
 * 3. Tautan "Lihat Semua Notifikasi" menuju halaman All Notifikasi (/notifikasi).
 * 4. Sinkronisasi status dibaca antara localStorage dan endpoint server.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconBell,
  IconCheck,
  IconMegaphone,
  IconNews,
  IconArrowRight,
  IconClose,
} from './icons'
import {
  buildUnifiedNotifications,
  formatRelativeTime,
  getStoredReadAllTimestamp,
  getStoredReadIds,
  markAllReadInStorage,
  markItemReadInStorage,
  NOTIF_STORAGE_KEYS,
  type RawAnnouncement,
  type RawNewsItem,
  type RawNotification,
  type UnifiedNotificationItem,
} from '@/lib/notifications/types'

const POLL_INTERVAL = 90_000

export function HeaderNotifications() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<UnifiedNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Muat data notifikasi dari API dan gabungkan dengan status baca lokal
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/user/notifications', { cache: 'no-store' })
      if (!res.ok) return

      const data = (await res.json()) as {
        announcements?: RawAnnouncement[]
        news?: RawNewsItem[]
        notifications?: RawNotification[]
        unread?: number
      }

      const readIds = getStoredReadIds()
      const readAllAt = getStoredReadAllTimestamp()

      const unified = buildUnifiedNotifications({
        announcements: data.announcements || [],
        news: data.news || [],
        notifications: data.notifications || [],
        readIds,
        readAllTimestamp: readAllAt,
      })

      const count = unified.filter((item) => !item.read).length
      setItems(unified)
      setUnreadCount(count)
    } catch {
      // Pelengkap header, kegagalan jaringan tidak boleh merusak terminal
    }
  }, [])

  // Inisialisasi data & polling saat jendela aktif
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void fetchNotifications() })

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchNotifications()
      }
    }, POLL_INTERVAL)

    const handleSync = () => {
      fetchNotifications()
    }

    window.addEventListener(NOTIF_STORAGE_KEYS.EVENT_CHANGED, handleSync)
    window.addEventListener('focus', handleSync)

    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener(NOTIF_STORAGE_KEYS.EVENT_CHANGED, handleSync)
      window.removeEventListener('focus', handleSync)
    }
  }, [fetchNotifications])

  // Menutup dropdown saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Tandai 1 item sudah dibaca dan buka link tujuan jika ada
  const handleItemClick = (item: UnifiedNotificationItem) => {
    if (!item.read) {
      markItemReadInStorage(item.id)

      // Update state lokal seketika
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))

      // Kirim feedback ke server jika bertipe alert
      if (item.type === 'alert') {
        fetch('/api/v1/user/notifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'read', ids: [item.rawId] }),
        }).catch(() => {})
      }
    }

    setIsOpen(false)
    if (item.url) {
      router.push(item.url)
    }
  }

  // Tandai semua notifikasi sudah dibaca
  const handleMarkAllRead = async () => {
    markAllReadInStorage()
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
    setUnreadCount(0)

    try {
      await fetch('/api/v1/user/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-read' }),
      })
    } catch {
      // Abaikan jika offline
    }
  }

  // Ambil tepat 3 notifikasi terbaru untuk dropdown
  const top3Items = items.slice(0, 3)

  // Label badge counter: jika lebih dari 9 tampilkan "9+"
  const badgeLabel = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null

  return (
    <div className="topbar-notif-wrapper" ref={dropdownRef}>
      {/* Tombol Lonceng SVG di Header Terminal */}
      <button
        type="button"
        className={`topbar-notif-btn ${isOpen ? 'is-active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Pusat notifikasi dan pengumuman"
        aria-expanded={isOpen}
        title="Notifikasi & Warta"
      >
        <span className="topbar-notif-icon">
          <IconBell size={17} />
          {unreadCount > 0 && <span className="topbar-notif-ping" />}
        </span>

        {/* Counter Badge Angka (1-9 atau 9+) */}
        {badgeLabel && (
          <span className="topbar-notif-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown 3 Notifikasi Terbaru */}
      {isOpen && (
        <div className="topbar-notif-dropdown" role="dialog" aria-label="Daftar notifikasi terbaru">
          {/* Header Dropdown */}
          <div className="notif-dropdown-header">
            <div className="notif-dropdown-title-wrap">
              <span className="notif-dropdown-icon">
                <IconBell size={14} />
              </span>
              <span className="notif-dropdown-title">Notifikasi</span>
              {unreadCount > 0 && (
                <span className="notif-unread-pill">{unreadCount} Baru</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-read-btn"
                onClick={handleMarkAllRead}
                title="Tandai semua dibaca"
              >
                <IconCheck size={13} />
                <span>Tandai dibaca</span>
              </button>
            )}
          </div>

          {/* Isi Dropdown: Maksimal 3 Notifikasi */}
          <div className="notif-dropdown-list">
            {top3Items.length === 0 ? (
              <div className="notif-dropdown-empty">
                <div className="notif-empty-icon">
                  <IconBell size={24} />
                </div>
                <div className="notif-empty-text">Belum ada notifikasi baru</div>
                <div className="notif-empty-sub">
                  Berita pasar dan pengumuman admin akan muncul di sini.
                </div>
              </div>
            ) : (
              top3Items.map((item) => (
                <div
                  key={item.id}
                  className={`notif-dropdown-item ${!item.read ? 'is-unread' : ''} notif-type-${item.type}`}
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleItemClick(item)
                    }
                  }}
                >
                  <div className="notif-item-top">
                    <span className={`notif-item-tag tag-${item.type}`}>
                      {item.type === 'pengumuman' ? (
                        <>
                          <IconMegaphone size={11} />
                          <span>{item.tone === 'penting' ? 'Penting' : 'Admin'}</span>
                        </>
                      ) : item.type === 'berita' ? (
                        <>
                          <IconNews size={11} />
                          <span>{item.category || 'Berita'}</span>
                        </>
                      ) : (
                        <>
                          <IconBell size={11} />
                          <span>Alert</span>
                        </>
                      )}
                    </span>
                    <span className="notif-item-time">{formatRelativeTime(item.createdAt)}</span>
                    {!item.read && <span className="notif-item-unread-dot" title="Belum dibaca" />}
                  </div>

                  <div className="notif-item-title">{item.title}</div>

                  <div className="notif-item-body">
                    {item.body.replace(/[#*`_]/g, '').slice(0, 105)}
                    {item.body.length > 105 ? '...' : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Dropdown: Link ke Halaman All Notifikasi */}
          <div className="notif-dropdown-footer">
            <Link
              href="/notifikasi"
              className="notif-dropdown-all-link"
              onClick={() => setIsOpen(false)}
            >
              <span>Lihat Semua Notifikasi</span>
              <IconArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
