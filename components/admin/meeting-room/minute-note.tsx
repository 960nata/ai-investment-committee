'use client'

/**
 * Catatan rapat sebagai kertas memo dalam popup — dibuka dari kertas di depan
 * kursi agen di meja sidang.
 *
 * Notulen berbentuk "LABEL: isi" ditulis per label; notulen JSON (peneliti,
 * ketua rapat) diurai jadi daftar yang terbaca, bukan ditampilkan mentah.
 */

import { useEffect, useRef } from 'react'
import type { MeetingMinute, ProjectIssue } from '@/lib/project/store'
import { parseDecision } from '@/lib/project/decision'
import styles from './minute-note.module.css'

export type NoteContent =
  | { kind: 'minute'; minute: MeetingMinute }
  | { kind: 'monitor'; issues: ProjectIssue[] }

function labeled(text: string): { label: string | null; lines: string[] }[] {
  const out: { label: string | null; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([A-Z][A-Z &/]{2,30}):\s*(.*)$/)
    if (m) {
      const last = out.at(-1)
      if (last?.label === m[1]) {
        if (m[2]) last.lines.push(m[2])
      } else {
        out.push({ label: m[1], lines: m[2] ? [m[2]] : [] })
      }
    } else if (out.length) {
      out.at(-1)!.lines.push(line.replace(/^[-•*]\s*/, ''))
    } else {
      out.push({ label: null, lines: [line] })
    }
  }
  return out
}

function parseJson(text: string): Record<string, unknown> | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    return JSON.parse(text.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1'))
  } catch {
    return null
  }
}

function MinuteBody({ minute }: { minute: MeetingMinute }) {
  if (minute.role === 'ketua-rapat') {
    const d = parseDecision(minute.content)
    if (d) {
      return (
        <>
          <p className={styles.label}>Kesimpulan</p>
          <p>{d.kesimpulan}</p>
          {d.mendesak.length > 0 && (
            <>
              <p className={`${styles.label} ${styles.red}`}>Mendesak</p>
              <ul>{d.mendesak.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </>
          )}
          {d.tindakan.length > 0 && (
            <>
              <p className={styles.label}>Tindakan</p>
              <ol>{d.tindakan.map((m, i) => <li key={i}>{m}</li>)}</ol>
            </>
          )}
          {d.dibuang.length > 0 && <p className={styles.small}>Usulan dibuang: {d.dibuang.map((n) => `#${n}`).join(', ')}</p>}
        </>
      )
    }
  }

  if (minute.role === 'peneliti') {
    const obj = parseJson(minute.content)
    const usulan = Array.isArray(obj?.usulan) ? (obj!.usulan as Record<string, unknown>[]) : null
    if (usulan) {
      const pengingat = Array.isArray(obj?.pengingat) ? (obj!.pengingat as Record<string, unknown>[]) : []
      const pembaruan = Array.isArray(obj?.pembaruan) ? (obj!.pembaruan as Record<string, unknown>[]) : []
      return (
        <>
          <p className={styles.label}>Usulan ({usulan.length})</p>
          {usulan.length === 0 && <p className={styles.small}>Tidak ada usulan baru pada rapat ini.</p>}
          <ol>
            {usulan.map((u, i) => (
              <li key={i}>
                <strong>{String(u.judul ?? '')}</strong>
                {u.masalah ? <div className={styles.small}>Penyebab: {String(u.masalah)}</div> : null}
                {u.usulan ? <div>{String(u.usulan)}</div> : null}
                {u.biaya ? <div className={styles.small}>Biaya: {String(u.biaya)}</div> : null}
                {u.alternatifGratis ? <div className={styles.small}>Alternatif gratis: {String(u.alternatifGratis)}</div> : null}
              </li>
            ))}
          </ol>
          {pembaruan.length > 0 && (
            <>
              <p className={styles.label}>Progres usulan lama</p>
              <ul>{pembaruan.map((p, i) => <li key={i}>#{String(p.id)} — {String(p.status)}: {String(p.catatan ?? '')}</li>)}</ul>
            </>
          )}
          {pengingat.length > 0 && (
            <>
              <p className={`${styles.label} ${styles.red}`}>Pengingat untuk owner</p>
              <ul>{pengingat.map((p, i) => <li key={i}>#{String(p.id)}: {String(p.alasan ?? '')}</li>)}</ul>
            </>
          )}
        </>
      )
    }
  }

  return (
    <>
      {labeled(minute.content).map((block, i) => (
        <div key={i} className={styles.block}>
          {block.label && <p className={styles.label}>{block.label.toLowerCase()}</p>}
          {block.lines.length > 1 ? (
            <ul>{block.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
          ) : (
            <p>{block.lines[0]}</p>
          )}
        </div>
      ))}
    </>
  )
}

export function MinuteNote({ note, onClose }: { note: NoteContent; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const title = note.kind === 'minute' ? note.minute.title : 'Pemantau'
  const minute = note.kind === 'minute' ? note.minute : null

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Catatan ${title}`}
    >
      <article className={styles.note}>
        <span className={styles.tape} aria-hidden="true" />
        <button ref={closeButton} type="button" className={styles.close} onClick={onClose} aria-label="Tutup catatan">
          ×
        </button>
        <header className={styles.head}>
          <div className={styles.title}>Catatan {title}</div>
          <div className={styles.meta}>
            {minute ? (
              <>
                {minute.providerId}/{minute.model} · {(minute.latencyMs / 1000).toFixed(1)} dtk
              </>
            ) : (
              'pemeriksa ambang tetap · tanpa model'
            )}
          </div>
          {minute && minute.failovers.length > 0 && (
            <div className={styles.replaced}>
              digantikan:{' '}
              {[...minute.failovers.map((f) => `${f.providerId}${f.keyIndex >= 0 ? `#${f.keyIndex}` : ''} ${f.kind}`), minute.providerId].join(' → ')}
            </div>
          )}
        </header>
        <div className={styles.body}>
          {minute ? (
            <MinuteBody minute={minute} />
          ) : note.kind === 'monitor' && note.issues.length > 0 ? (
            <ol>
              {note.issues.map((i) => (
                <li key={i.key}>
                  <span className={i.severity === 'mendesak' ? styles.red : styles.amber}>[{i.severity}]</span> <strong>{i.title}</strong>
                  <div className={styles.small}>{i.detail}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p>Tidak ada temuan pada rapat ini.</p>
          )}
        </div>
      </article>
    </div>
  )
}
