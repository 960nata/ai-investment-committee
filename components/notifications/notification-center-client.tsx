'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useReadState } from './use-read-state'
import {
  IconBell,
  IconNews,
  IconMegaphone,
  IconCheck,
  IconRefresh,
  IconSearch,
  IconArrowRight,
} from '@/components/icons'
import type { NotificationItem } from '@/lib/notifications/types'
import {
  isItemRead,
  markItemRead,
  markAllRead,
  formatTimeAgo,
} from '@/lib/notifications/storage'

type FilterTab = 'semua' | 'unread' | 'berita' | 'admin' | 'alert'

interface Props {
  initialItems: NotificationItem[]
}

export function NotificationCenterClient({ initialItems }: Props) {
  const [items, setItems] = useState<NotificationItem[]>(initialItems)
  const [activeTab, setActiveTab] = useState<FilterTab>('semua')
  const [searchQuery, setSearchQuery] = useState('')
  const { readIds, lastAllTime } = useReadState()
  const [isRefreshing, setIsRefreshing] = useState(false)



  const reloadData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/v1/notifications/feed', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { ok: boolean; items: NotificationItem[] }
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items)
      }
    } catch {
      // Abaikan galat jaringan
    } finally {
      setIsRefreshing(false)
    }
  }, [])



  // Hitung metrik
  const counts = useMemo(() => {
    let unread = 0
    let berita = 0
    let admin = 0
    let alert = 0

    items.forEach((item) => {
      const read = isItemRead(item, readIds, lastAllTime)
      if (!read) unread++
      if (item.type === 'berita') berita++
      if (item.type === 'admin') admin++
      if (item.type === 'alert') alert++
    })

    return {
      total: items.length,
      unread,
      berita,
      admin,
      alert,
    }
  }, [items, readIds, lastAllTime])

  // Filter daftar notifikasi
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const read = isItemRead(item, readIds, lastAllTime)

      if (activeTab === 'unread' && read) return false
      if (activeTab === 'berita' && item.type !== 'berita') return false
      if (activeTab === 'admin' && item.type !== 'admin') return false
      if (activeTab === 'alert' && item.type !== 'alert') return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(query)
        const matchBody = item.body.toLowerCase().includes(query)
        const matchTag = item.badgeLabel.toLowerCase().includes(query)
        return matchTitle || matchBody || matchTag
      }

      return true
    })
  }, [items, activeTab, searchQuery, readIds, lastAllTime])

  function handleMarkAll() {
    markAllRead(items)
  }

  function handleToggleRead(id: string) {
    markItemRead(id)
  }

  return (
    <div className="notif-center-container">
      {/* Header Halaman */}
      <div className="notif-center-header">
        <div className="notif-header-left">
          <div className="notif-header-badge">
            <IconBell size={14} />
            <span>Pusat Notifikasi</span>
          </div>
          <h1 className="notif-header-title">Pemberitahuan & Intelijen Warta</h1>
          <p className="notif-header-desc">
            Kompilasi pembaruan penting langsung dari admin komite, terbitan warta pasar AI terbaru, dan sinyal alert pasar Anda.
          </p>
        </div>

        <div className="notif-header-actions">
          <button
            type="button"
            className="notif-action-btn secondary"
            onClick={reloadData}
            disabled={isRefreshing}
            title="Muat ulang notifikasi"
          >
            <IconRefresh size={14} className={isRefreshing ? 'spin' : ''} />
            <span>{isRefreshing ? 'Menyinkronkan...' : 'Segarkan'}</span>
          </button>

          {counts.unread > 0 && (
            <button
              type="button"
              className="notif-action-btn primary"
              onClick={handleMarkAll}
              title="Tandai semua notifikasi telah dibaca"
            >
              <IconCheck size={14} />
              <span>Tandai Semua Dibaca</span>
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan Statistik */}
      <div className="notif-stats-grid">
        <div className="notif-stat-card">
          <span className="notif-stat-label">Total Notifikasi</span>
          <span className="notif-stat-val mono">{counts.total}</span>
        </div>
        <div className={`notif-stat-card ${counts.unread > 0 ? 'highlight' : ''}`}>
          <span className="notif-stat-label">Belum Dibaca</span>
          <span className="notif-stat-val mono text-signal">
            {counts.unread > 9 ? '9+' : counts.unread}
          </span>
        </div>
        <div className="notif-stat-card">
          <span className="notif-stat-label">Berita & Warta</span>
          <span className="notif-stat-val mono text-measured">{counts.berita}</span>
        </div>
        <div className="notif-stat-card">
          <span className="notif-stat-label">Pemberitahuan Admin</span>
          <span className="notif-stat-val mono text-admin">{counts.admin}</span>
        </div>
        <div className="notif-stat-card">
          <span className="notif-stat-label">Alert Sistem</span>
          <span className="notif-stat-val mono">{counts.alert}</span>
        </div>
      </div>

      {/* Toolbar Filter & Pencarian */}
      <div className="notif-filter-bar">
        <div className="notif-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'semua'}
            className={`notif-tab ${activeTab === 'semua' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('semua')}
          >
            Semua ({counts.total})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unread'}
            className={`notif-tab ${activeTab === 'unread' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('unread')}
          >
            Belum Dibaca ({counts.unread})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'berita'}
            className={`notif-tab ${activeTab === 'berita' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('berita')}
          >
            Berita Pasar ({counts.berita})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'admin'}
            className={`notif-tab ${activeTab === 'admin' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            Pemberitahuan Admin ({counts.admin})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'alert'}
            className={`notif-tab ${activeTab === 'alert' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('alert')}
          >
            Alert ({counts.alert})
          </button>
        </div>

        <div className="notif-search-box">
          <IconSearch size={14} className="notif-search-icon" />
          <input
            type="text"
            className="notif-search-input"
            placeholder="Cari notifikasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="notif-search-clear"
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Daftar Notifikasi */}
      <div className="notif-list">
        {filteredItems.length === 0 ? (
          <div className="notif-empty-state">
            <div className="notif-empty-icon">
              <IconBell size={32} />
            </div>
            <h3 className="notif-empty-title">Tidak ada notifikasi</h3>
            <p className="notif-empty-desc">
              {searchQuery
                ? `Tidak ditemukan hasil yang cocok dengan kata kunci "${searchQuery}".`
                : activeTab === 'unread'
                ? 'Semua notifikasi telah Anda baca!'
                : 'Belum ada notifikasi pada kategori ini.'}
            </p>
            {(searchQuery || activeTab !== 'semua') && (
              <button
                type="button"
                className="notif-reset-btn"
                onClick={() => {
                  setActiveTab('semua')
                  setSearchQuery('')
                }}
              >
                Tampilkan Semua Notifikasi
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const read = isItemRead(item, readIds, lastAllTime)
            const isNews = item.type === 'berita'
            const isAdminNotice = item.type === 'admin'

            return (
              <article
                key={item.id}
                className={`notif-card ${item.type} ${read ? 'is-read' : 'is-unread'}`}
              >
                <div className="notif-card-icon-col">
                  <div className={`notif-card-badge-icon ${item.type}`}>
                    {isNews ? (
                      <IconNews size={16} />
                    ) : isAdminNotice ? (
                      <IconMegaphone size={16} />
                    ) : (
                      <IconBell size={16} />
                    )}
                  </div>
                  {!read && <span className="notif-unread-glow" title="Belum dibaca" />}
                </div>

                <div className="notif-card-main">
                  <div className="notif-card-top">
                    <div className="notif-tags-row">
                      <span className={`notif-pill ${item.type} ${item.tone ?? ''}`}>
                        {item.badgeLabel}
                      </span>
                      {item.category && (
                        <span className="notif-pill category">{item.category}</span>
                      )}
                      <span className="notif-time-str">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>

                    {!read && (
                      <button
                        type="button"
                        className="notif-mark-read-chip"
                        onClick={() => handleToggleRead(item.id)}
                        title="Tandai item ini sudah dibaca"
                      >
                        <IconCheck size={11} />
                        <span>Tandai dibaca</span>
                      </button>
                    )}
                  </div>

                  <h2 className="notif-card-title">
                    <Link
                      href={item.linkUrl}
                      onClick={() => handleToggleRead(item.id)}
                      className="notif-title-link"
                    >
                      {item.title}
                    </Link>
                  </h2>

                  <p className="notif-card-body">{item.body}</p>

                  <div className="notif-card-footer">
                    <Link
                      href={item.linkUrl}
                      onClick={() => handleToggleRead(item.id)}
                      className="notif-open-btn"
                    >
                      <span>
                        {isNews
                          ? 'Baca Berita Lengkap'
                          : isAdminNotice
                          ? 'Buka Pengumuman'
                          : 'Periksa Alert'}
                      </span>
                      <IconArrowRight size={13} />
                    </Link>

                    <span className="notif-date-iso mono">
                      {new Date(item.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
