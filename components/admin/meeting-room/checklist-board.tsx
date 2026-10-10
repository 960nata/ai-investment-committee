'use client'

/**
 * Papan ceklis usulan perbaikan — ditulis agen rapat, diputuskan owner.
 *
 * Centang beberapa usulan lalu pilih keputusannya. Catatan owner disimpan
 * bersama keputusan dan dibaca rapat berikutnya: alasan penolakan mencegah
 * usulan serupa muncul lagi, catatan persetujuan mengarahkan pengerjaannya.
 * Status progres (belum digarap, sedang, tampak selesai, terhambat) ditulis
 * agen dari data — owner yang menandai selesai.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OVERDUE_AFTER_DAYS, REMIND_AFTER_DAYS, waitingDays } from '@/lib/project/proposal-rules'
import type { Proposal, ProposalStatus } from '@/lib/project/proposals'
import styles from './meeting-room.module.css'

const TABS: { id: ProposalStatus | 'semua'; label: string }[] = [
  { id: 'menunggu', label: 'Menunggu keputusan' },
  { id: 'disetujui', label: 'Disetujui' },
  { id: 'selesai', label: 'Selesai' },
  { id: 'ditolak', label: 'Ditolak' },
  { id: 'semua', label: 'Semua' },
]

const AI_LABEL: Record<Proposal['aiStatus'], string> = {
  'belum-digarap': 'belum digarap',
  sedang: 'sedang digarap',
  'tampak-selesai': 'tampak selesai',
  terhambat: 'terhambat',
}

const ACTIONS: { status: ProposalStatus; label: string; tone: string }[] = [
  { status: 'disetujui', label: '✓ Setujui', tone: 'ok' },
  { status: 'ditolak', label: '✕ Tolak', tone: 'bad' },
  { status: 'selesai', label: '★ Tandai selesai', tone: 'done' },
  { status: 'menunggu', label: '↺ Kembalikan', tone: 'plain' },
]

function rupiah(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`
}

const REMINDED: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }

export function ChecklistBoard({ proposals, now }: { proposals: Proposal[]; now: number }) {
  const router = useRouter()
  const [tab, setTab] = useState<ProposalStatus | 'semua'>(() =>
    proposals.some((p) => p.status === 'menunggu') ? 'menunggu' : 'semua',
  )
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { semua: proposals.length }
    for (const p of proposals) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [proposals])
  const visible = tab === 'semua' ? proposals : proposals.filter((p) => p.status === tab)
  const selectedVisible = visible.filter((p) => checked.has(p.id))

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function decide(status: ProposalStatus) {
    const ids = selectedVisible.map((p) => p.id)
    if (ids.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/usulan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, status, note: note.trim() || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setChecked(new Set())
      setNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.board} aria-label="Papan ceklis usulan perbaikan">
      <div className={styles.boardFrame}>
        <header className={styles.boardHead}>
          <span className={styles.boardTitle}>PAPAN USULAN</span>
          <span className={styles.boardSub}>ditulis agen rapat · diputuskan owner</span>
        </header>

        <nav className={styles.boardTabs} aria-label="Status usulan">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.boardTab} ${tab === t.id ? styles.boardTabActive : ''}`}
              onClick={() => {
                setTab(t.id)
                setChecked(new Set())
              }}
            >
              {t.label} <span className={styles.boardCount}>{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </nav>

        <div className={styles.boardList}>
          {visible.length === 0 && (
            <p className={styles.boardEmpty}>
              {proposals.length === 0
                ? 'Papan masih kosong. Usulan muncul setelah rapat berikutnya — peneliti menuliskannya di sini.'
                : 'Tidak ada usulan di kolom ini.'}
            </p>
          )}
          {visible.map((p) => {
            const waited = waitingDays(p, now)
            const late = waited >= OVERDUE_AFTER_DAYS ? 'overdue' : waited >= REMIND_AFTER_DAYS ? 'late' : null
            return (
            <article key={p.id} className={`${styles.card} ${styles[`card_${p.status}`] ?? ''} ${late ? styles[`card_${late}`] : ''}`}>
              <label className={styles.cardCheck}>
                <input
                  type="checkbox"
                  checked={checked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`Pilih usulan ${p.title}`}
                />
                <span className={styles.checkBox} aria-hidden="true">
                  {p.status === 'selesai' ? '★' : p.status === 'disetujui' ? '✓' : p.status === 'ditolak' ? '✕' : ''}
                </span>
              </label>
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <span className={styles.cardId}>#{p.id}</span>
                  <span className={styles.cardTitle}>{p.title}</span>
                </div>
                <div className={styles.pills}>
                  <span className={styles.pill}>{p.category}</span>
                  <span className={styles.pill} title="Dampak 1–5">
                    dampak {'●'.repeat(p.impact)}
                    {'○'.repeat(5 - p.impact)}
                  </span>
                  <span className={styles.pill}>usaha {p.effort}</span>
                  <span className={`${styles.pill} ${p.costIdr === 0 || /gratis/i.test(p.cost) ? styles.pillOk : ''}`}>
                    {p.costIdr ? `${rupiah(p.costIdr)}/bln` : p.cost || 'biaya ?'}
                  </span>
                  {p.status === 'disetujui' && (
                    <span className={`${styles.pill} ${styles[`ai_${p.aiStatus}`] ?? ''}`}>AI: {AI_LABEL[p.aiStatus]}</span>
                  )}
                  {p.timesRaised > 1 && <span className={styles.pill}>diangkat {p.timesRaised}×</span>}
                  {late && (
                    <span className={`${styles.pill} ${late === 'overdue' ? styles.pillOverdue : styles.pillLate}`}>
                      menunggu {waited} hari{late === 'overdue' ? ' · lewat 1 bulan' : ' · lewat 1 minggu'}
                    </span>
                  )}
                </div>
                {p.status === 'menunggu' && p.aiReminder && (
                  <p className={`${styles.cardReminder} ${late === 'overdue' ? styles.cardReminderOverdue : ''}`}>
                    <strong>Pengingat rapat{p.aiReminderAt ? ` ${new Date(p.aiReminderAt).toLocaleDateString('id-ID', REMINDED)}` : ''}:</strong>{' '}
                    {p.aiReminder}
                  </p>
                )}
                <p className={styles.cardText}>{p.proposal}</p>
                {p.votes && (
                  <div className={`${styles.votes} ${styles.pill}`} title={p.votes.rincian.map((r) => `${r.providerId}: ${r.pilihan}${r.alasan ? ` — ${r.alasan}` : ''}`).join('\n')}>
                    voting:
                    <span className={styles.voteYes}>{p.votes.setuju} setuju</span>·
                    <span className={styles.voteNo}>{p.votes.tolak} tolak</span>·
                    <span className={styles.voteAbs}>
                      {p.votes.abstain} abstain · {p.votes.absen} absen
                    </span>
                  </div>
                )}
                <details className={styles.cardMore}>
                  <summary className={styles.cardSummary}>rincian, kebutuhan, alternatif gratis</summary>
                  <dl className={styles.cardDl}>
                    {p.problem && (
                      <>
                        <dt>Penyebab</dt>
                        <dd>{p.problem}</dd>
                      </>
                    )}
                    {p.evidence && (
                      <>
                        <dt>Bukti</dt>
                        <dd>{p.evidence}</dd>
                      </>
                    )}
                    {p.needs.data.length > 0 && (
                      <>
                        <dt>Data yang dibutuhkan</dt>
                        <dd>{p.needs.data.join(' · ')}</dd>
                      </>
                    )}
                    {p.needs.api.length > 0 && (
                      <>
                        <dt>API / layanan</dt>
                        <dd>{p.needs.api.join(' · ')}</dd>
                      </>
                    )}
                    {p.cost && (
                      <>
                        <dt>Biaya</dt>
                        <dd>{p.cost}</dd>
                      </>
                    )}
                    {p.freeAlternative && (
                      <>
                        <dt>Alternatif gratis</dt>
                        <dd>{p.freeAlternative}</dd>
                      </>
                    )}
                    {p.votes && p.votes.rincian.length > 0 && (
                      <>
                        <dt>Suara anggota</dt>
                        <dd>
                          {p.votes.rincian.map((r) => (
                            <div key={r.providerId}>
                              <strong className={r.pilihan === 'setuju' ? styles.voteYes : r.pilihan === 'tolak' ? styles.voteNo : styles.voteAbs}>
                                {r.providerId}: {r.pilihan}
                              </strong>
                              {r.alasan ? ` — ${r.alasan}` : ''}
                            </div>
                          ))}
                        </dd>
                      </>
                    )}
                  </dl>
                </details>
                {p.aiNote && p.status === 'disetujui' && <p className={styles.cardAi}>Catatan progres AI: {p.aiNote}</p>}
                {p.ownerNote && <p className={styles.cardOwner}>Catatan owner: {p.ownerNote}</p>}
              </div>
            </article>
            )
          })}
        </div>

        <footer className={styles.boardBar}>
          <span className={styles.boardSelected}>{selectedVisible.length} dicentang</span>
          <input
            className={styles.noteInput}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan untuk rapat berikutnya (opsional) — mis. alasan menolak"
          />
          <div className={styles.boardActions}>
            {ACTIONS.filter((a) => a.status !== tab).map((a) => (
              <button
                key={a.status}
                type="button"
                className={`${styles.btn} ${styles[`act_${a.tone}`]}`}
                disabled={busy || selectedVisible.length === 0}
                onClick={() => decide(a.status)}
              >
                {a.label}
              </button>
            ))}
          </div>
          {error && <p className={`${styles.notice} ${styles.noticeBad}`}>{error}</p>}
        </footer>
      </div>
    </section>
  )
}
