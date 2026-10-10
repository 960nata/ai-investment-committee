'use client'

/** Tombol rapat dadakan dan pemeriksaan mendesak di halaman rapat project. */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlay, IconRadar } from '@/components/icons'
import styles from './project.module.css'

const PERIODS = [
  { id: 'harian', label: '24 jam' },
  { id: 'mingguan', label: '7 hari' },
  { id: 'bulanan', label: '30 hari' },
] as const

export function ProjectActions() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null)

  async function run(payload: Record<string, string>, label: string) {
    setBusy(label)
    setMessage({ text: payload.action === 'rapat' ? 'Rapat berjalan — pelapor, pengkritik, lalu ketua rapat…' : 'Memeriksa…' })
    try {
      const res = await fetch('/api/v1/admin/rapat-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (payload.action === 'rapat') {
        setMessage({ text: body.status === 'tanpa-rapat' ? 'Laporan tersimpan tanpa rapat — semua model sedang tidak bisa dijangkau.' : 'Rapat selesai.' })
        if (body.reportId) router.push(`/admin/rapat-project/${body.reportId}`)
      } else {
        setMessage({ text: `${body.open} masalah terbuka, ${body.fresh} baru${body.notified ? `, ${body.notified} admin diberi notifikasi` : ''}.` })
        router.refresh()
      }
    } catch (err) {
      setMessage({ text: `Gagal: ${err instanceof Error ? err.message : String(err)}`, bad: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.actions}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy !== null}
            onClick={() => run({ action: 'rapat', period: p.id }, p.id)}
          >
            <IconPlay size={12} /> {busy === p.id ? 'Bersidang…' : `Rapat ${p.label} terakhir`}
          </button>
        ))}
        <button className={styles.btn} disabled={busy !== null} onClick={() => run({ action: 'pantau' }, 'pantau')}>
          <IconRadar size={12} /> {busy === 'pantau' ? 'Memeriksa…' : 'Periksa masalah sekarang'}
        </button>
      </div>
      {message && <p className={`${styles.notice} ${message.bad ? styles.noticeBad : ''}`}>{message.text}</p>}
    </div>
  )
}
