'use client'

/**
 * Lonceng peringatan portal admin.
 *
 * Datanya dibaca `useAdminAlerts` di layout, supaya lonceng dan lencana menu
 * Rapat Project memakai satu permintaan yang sama. Angka di lonceng adalah
 * peringatan terbuka yang belum ditandai dilihat; lencana sidebar adalah
 * masalah mendesak yang masih terbuka, dilihat atau belum.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { AlertSummary } from '@/lib/project/store'
import { IconBell, IconCheck } from '@/components/icons'
import styles from './admin-alerts.module.css'

const REFRESH_MS = 60_000

function loadSummary(): Promise<AlertSummary | null> {
  return fetch('/api/v1/admin/peringatan', { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<AlertSummary>) : null))
    // Lonceng yang gagal disegarkan tetap menampilkan angka terakhir.
    .catch(() => null)
}

export function useAdminAlerts(pathname: string) {
  const [summary, setSummary] = useState<AlertSummary | null>(null)

  useEffect(() => {
    let alive = true
    const apply = (next: AlertSummary | null) => {
      if (alive && next) setSummary(next)
    }
    loadSummary().then(apply)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadSummary().then(apply)
    }, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [pathname])

  const acknowledge = useCallback(async (ids?: number[]) => {
    await fetch('/api/v1/admin/peringatan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => null)
    const next = await loadSummary()
    if (next) setSummary(next)
  }, [])

  return { summary, acknowledge }
}

const WIB: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }

export function AdminAlertBell({
  summary,
  acknowledge,
}: {
  summary: AlertSummary | null
  acknowledge: (ids?: number[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const unseen = summary?.unseen ?? 0
  const urgentUnseen = summary?.alerts.some((a) => a.severity === 'mendesak' && !a.acknowledgedAt) ?? false

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.bell} ${urgentUnseen ? styles.bellUrgent : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unseen ? `${unseen} peringatan belum dilihat` : 'Peringatan project'}
      >
        <IconBell size={15} />
        {unseen > 0 && <span className={`${styles.count} ${urgentUnseen ? styles.countUrgent : ''}`}>{unseen > 9 ? '9+' : unseen}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Peringatan project">
          <div className={styles.panelHead}>
            <span>Peringatan project</span>
            {unseen > 0 && (
              <button type="button" className={styles.ackAll} onClick={() => void acknowledge()}>
                <IconCheck size={11} /> tandai semua dilihat
              </button>
            )}
          </div>

          <div className={styles.list}>
            {!summary && <p className={styles.empty}>Memuat…</p>}
            {summary && summary.alerts.length === 0 && <p className={styles.empty}>Tidak ada masalah terbuka. Semua aman.</p>}
            {summary?.alerts.slice(0, 10).map((a) => (
              <div key={a.id} className={`${styles.item} ${a.acknowledgedAt ? styles.itemSeen : ''}`}>
                <span className={`${styles.sev} ${a.severity === 'mendesak' ? styles.sevUrgent : styles.sevWarn}`} />
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>{a.title}</div>
                  <div className={styles.itemDetail}>{a.detail}</div>
                  <div className={styles.itemTime}>
                    {a.severity} · sejak {new Date(a.firstSeen).toLocaleString('id-ID', WIB)}
                  </div>
                </div>
                {!a.acknowledgedAt && (
                  <button type="button" className={styles.ackOne} onClick={() => void acknowledge([a.id])} aria-label="Tandai dilihat">
                    <IconCheck size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Link href="/admin/rapat-project" className={styles.footer} onClick={() => setOpen(false)}>
            Buka rapat project →
          </Link>
        </div>
      )}
    </div>
  )
}

/** Lencana angka di menu sidebar: masalah mendesak yang masih terbuka. */
export function UrgentBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className={styles.navBadge} aria-label={`${count} masalah mendesak`}>
      {count}
    </span>
  )
}
