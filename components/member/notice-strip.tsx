'use client'

/**
 * Pita pengumuman dan notifikasi di atas isi tiap halaman dashboard.
 *
 * Sengaja tidak ditaruh di bar atas: bar atas hanya menjawab "di mana, seberapa
 * segar, satu tindakan" (lihat topbar.tsx). Pengumuman admin dan alert yang
 * terpicu justru perlu terbaca utuh, bukan diringkas jadi titik merah di ikon.
 *
 * Isinya diambil dari `/api/v1/user/notifications` saat halaman dibuka lalu
 * tiap dua menit selama tab terlihat. Pengumuman yang ditutup tidak muncul lagi
 * di perangkat mana pun, karena penutupan disimpan di server.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { IconBell, IconClose, IconMegaphone } from '../icons'
import { Tag } from '../ui'

interface Announcement {
  id: number
  title: string
  body: string
  tone: 'info' | 'beta' | 'penting' | string
  linkUrl: string | null
  linkLabel: string | null
}

interface Notification {
  id: number
  title: string
  body: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
}

const POLL_MS = 120_000

const TONE_LABEL: Record<string, string> = { info: 'Info', beta: 'Beta', penting: 'Penting' }

/** Masuk dari atas, keluar dengan menyusut — pengumuman di bawahnya naik halus, tidak melompat. */
const ITEM_MOTION = {
  initial: { opacity: 0, y: -8, height: 0 },
  animate: { opacity: 1, y: 0, height: 'auto' },
  exit: { opacity: 0, y: -6, height: 0, marginBottom: 0 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
} as const

export function NoticeStrip() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [unread, setUnread] = useState<Notification[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/user/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { announcements: Announcement[]; notifications: Notification[] }
      setAnnouncements(body.announcements ?? [])
      setUnread((body.notifications ?? []).filter((n) => !n.readAt))
    } catch {
      // Pita ini pelengkap. Gagal memuat tidak boleh mengganggu halaman.
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  async function dismiss(id: number) {
    setAnnouncements((list) => list.filter((a) => a.id !== id))
    await fetch('/api/v1/user/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-announcement', id }),
    }).catch(() => {})
  }

  async function markRead() {
    const ids = unread.map((n) => n.id)
    setUnread([])
    await fetch('/api/v1/user/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', ids }),
    }).catch(() => {})
  }

  // Pembungkus tetap dirender (kosong disembunyikan CSS) supaya animasi keluar
  // pengumuman terakhir sempat berjalan sebelum pitanya hilang.
  return (
    <div className="notice-strip" role="region" aria-label="Pengumuman dan notifikasi">
      <AnimatePresence initial={false}>
      {announcements.map((a) => {
        const external = a.linkUrl?.startsWith('https://')
        return (
          <motion.div key={a.id} className={`announce ${a.tone}`} style={{ overflow: 'hidden' }} {...ITEM_MOTION}>
            <IconMegaphone size={16} />
            <div className="announce-body">
              <div className="announce-title">
                {a.title}
                <Tag tone={a.tone === 'penting' ? 'down' : a.tone === 'beta' ? 'signal' : 'ok'}>
                  {TONE_LABEL[a.tone] ?? a.tone}
                </Tag>
              </div>
              <p className="announce-text">{a.body}</p>
              {a.linkUrl &&
                (external ? (
                  <a className="announce-link" href={a.linkUrl} target="_blank" rel="noopener noreferrer">
                    {a.linkLabel || 'Selengkapnya'} &rarr;
                  </a>
                ) : (
                  <Link className="announce-link" href={a.linkUrl}>
                    {a.linkLabel || 'Selengkapnya'} &rarr;
                  </Link>
                ))}
            </div>
            <button
              type="button"
              className="announce-close"
              onClick={() => dismiss(a.id)}
              aria-label={`Tutup pengumuman ${a.title}`}
            >
              <IconClose size={14} />
            </button>
          </motion.div>
        )
      })}

      {unread.length > 0 && (
        <motion.div key="inbox" className="announce inbox" style={{ overflow: 'hidden' }} {...ITEM_MOTION}>
          <IconBell size={16} />
          <div className="announce-body">
            <div className="announce-title">
              {unread.length} alert terpicu
              <Tag tone="signal">Beta</Tag>
            </div>
            <ul className="announce-text" style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
              {unread.slice(0, 3).map((n) => (
                <li key={n.id}>
                  {n.linkUrl ? <Link href={n.linkUrl}>{n.title}</Link> : n.title}
                </li>
              ))}
            </ul>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <Link className="announce-link" style={{ marginTop: 0 }} href="/alert">
                Buka halaman Alert &rarr;
              </Link>
            </div>
          </div>
          <button type="button" className="announce-close" onClick={markRead} aria-label="Tandai semua dibaca">
            <IconClose size={14} />
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
