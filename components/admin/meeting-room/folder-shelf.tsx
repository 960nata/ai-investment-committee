'use client'

/**
 * Map-map laporan di laci lemari arsip. Klik map: sampulnya membuka, selembar
 * surat naik keluar dari map, lalu surat itu terbuka sebagai popup.
 *
 * Isi surat diambil saat map dibuka (GET /api/v1/admin/rapat-project?id=),
 * bukan dimuat untuk semua map sekaligus — satu laci bisa berisi ratusan
 * laporan lengkap dengan notulennya.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectReportRow } from '@/lib/project/store'
import { ReportLetter } from './report-letter'
import styles from './meeting-room.module.css'
import letterStyles from './report-letter.module.css'

export interface FolderItem {
  id: number
  title: string
  lead: string
  meta: string
  urgent: number
  noMeeting: boolean
}

type Stage = 'closed' | 'opening' | 'open'

export function FolderShelf({ folders }: { folders: FolderItem[] }) {
  const [active, setActive] = useState<FolderItem | null>(null)
  const [stage, setStage] = useState<Stage>('closed')
  const [report, setReport] = useState<ProjectReportRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeButton = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setStage('closed')
    setActive(null)
    setReport(null)
    setError(null)
  }, [])

  function open(folder: FolderItem) {
    setActive(folder)
    setReport(null)
    setError(null)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setStage(reduced ? 'open' : 'opening')
    if (!reduced) timer.current = setTimeout(() => setStage('open'), 900)

    fetch(`/api/v1/admin/rapat-project?id=${folder.id}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setReport(body as ProjectReportRow)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(() => {
    if (stage === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [stage, close])

  useEffect(() => {
    if (stage === 'open') closeButton.current?.focus()
  }, [stage])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <>
      <div className={styles.folderGrid}>
        {folders.map((f) => (
          <button key={f.id} type="button" className={styles.folder} onClick={() => open(f)} aria-haspopup="dialog">
            <span className={styles.folderTab}>#{f.id}</span>
            <span className={styles.folderTitle}>{f.title}</span>
            <span className={styles.folderLead}>{f.lead}</span>
            <span className={styles.folderMeta}>
              {f.meta}
              {f.urgent ? ` · ${f.urgent} mendesak` : ''}
              {f.noMeeting ? ' · tanpa rapat' : ''}
            </span>
            <span className={styles.folderHint}>buka surat ↗</span>
          </button>
        ))}
      </div>

      {stage !== 'closed' && active && (
        <div
          className={`${letterStyles.overlay} ${stage === 'open' ? letterStyles.overlayOpen : ''}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Surat laporan #${active.id}`}
        >
          {stage === 'opening' && (
            <div className={letterStyles.openingScene} aria-hidden="true">
              <svg viewBox="0 0 320 240" className={letterStyles.openingSvg}>
                {/* Bagian belakang map */}
                <path d="M30 60 h80 l14 -18 h86 l14 18 h66 v160 h-260 z" className={letterStyles.folderBack} />
                {/* Surat yang naik keluar dari map */}
                <g className={letterStyles.sheet}>
                  <rect x="60" y="40" width="200" height="170" rx="4" />
                  <line x1="80" y1="70" x2="240" y2="70" />
                  <line x1="80" y1="90" x2="240" y2="90" />
                  <line x1="80" y1="110" x2="210" y2="110" />
                  <line x1="80" y1="130" x2="240" y2="130" />
                </g>
                {/* Sampul depan yang membuka */}
                <g className={letterStyles.cover}>
                  <path d="M30 96 h260 v124 h-260 z" />
                  <text x="160" y="164" textAnchor="middle">#{active.id}</text>
                </g>
              </svg>
              <div className={letterStyles.openingLabel}>membuka map…</div>
            </div>
          )}

          {stage === 'open' && (
            <div className={letterStyles.letterWrap}>
              <button ref={closeButton} type="button" className={letterStyles.closeLetter} onClick={close} aria-label="Tutup surat">
                ×
              </button>
              {report ? (
                <ReportLetter report={report} detailHref={`/admin/rapat-project/${report.id}`} />
              ) : error ? (
                <div className={letterStyles.paper}>
                  <p>Surat gagal dibuka: {error}</p>
                </div>
              ) : (
                <div className={`${letterStyles.paper} ${letterStyles.loading}`}>
                  <div className={letterStyles.skeleton} />
                  <div className={letterStyles.skeleton} />
                  <div className={letterStyles.skeletonShort} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
