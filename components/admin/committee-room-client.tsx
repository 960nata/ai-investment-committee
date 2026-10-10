'use client'

/**
 * Ruang komite: lima kursi agen, umpan terminal panggilan model, dan kolam
 * kunci tiap penyedia — disegarkan tiap tiga detik selama tab terlihat.
 *
 * Giliran sidang tercatat ke basis data satu per satu, jadi kursi yang sedang
 * "berbicara" adalah kursi pertama tanpa giliran pada sidang yang masih
 * berjalan. Kursi "digantikan" bila penyedia yang menjawab bukan penyedia yang
 * ditugaskan, atau ada penyedia yang gagal lebih dulu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CommitteeRoomSnapshot, RoomFeedEvent } from '@/lib/agents/committee-room'
import {
  IconAlert,
  IconCheck,
  IconChat,
  IconCourt,
  IconHistory,
  IconPlay,
  IconRows,
  IconScales,
  IconShield,
  IconTarget,
  IconTerminal,
} from '@/components/icons'
import styles from './committee-room.module.css'

type Session = CommitteeRoomSnapshot['sessions'][number]
type Turn = Session['turns'][number]

const POLL_MS = 3_000
const WIB: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }

const SEAT_ICON: Record<string, React.ReactNode> = {
  analis: <IconRows size={16} />,
  strateg: <IconTarget size={16} />,
  risiko: <IconShield size={16} />,
  ketua: <IconScales size={16} />,
  pemeriksa: <IconCheck size={16} />,
}

const VERDICT_LABEL: Record<string, string> = {
  beli: 'Bukti condong positif',
  tahan: 'Bukti berimbang',
  jual: 'Kerapuhan lebih besar',
  abstain: 'Abstain',
}

const FEATURE_LABEL: Record<string, string> = {
  committee: 'sidang',
  'committee-check': 'pemeriksa',
  'news-generator': 'penulis warta',
  'news-translation': 'penerjemah',
  'auto-news': 'redaktur',
}

function candidates(spec: string): string[] {
  return spec.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
}

function time(iso: string | number | undefined): string {
  if (iso === undefined) return '--:--:--'
  return new Date(iso).toLocaleTimeString('id-ID', WIB).replace(/\./g, ':')
}

export function CommitteeRoomClient({ initial }: { initial: CommitteeRoomSnapshot }) {
  const [data, setData] = useState(initial)
  const [feed, setFeed] = useState<RoomFeedEvent[]>(initial.feed ?? [])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [openSeat, setOpenSeat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyCommittee, setOnlyCommittee] = useState(false)
  const [market, setMarket] = useState('IDX')
  const [symbol, setSymbol] = useState('')
  const [starting, setStarting] = useState(false)
  const [startMsg, setStartMsg] = useState<string | null>(null)
  const inflight = useRef<AbortController | null>(null)
  const terminalRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    try {
      const res = await fetch('/api/v1/admin/ruang-komite', { cache: 'no-store', signal: controller.signal })
      if (!res.ok) throw new Error(res.status === 401 ? 'Sesi admin berakhir. Masuk kembali.' : `Ruang komite gagal disegarkan (HTTP ${res.status}).`)
      const next = (await res.json()) as CommitteeRoomSnapshot
      setData(next)
      if (next.feed) setFeed(next.feed)
      setError(null)
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => {
      clearInterval(timer)
      inflight.current?.abort()
    }
  }, [refresh])

  const live = data.sessions.find((s) => s.status === 'running')
  const session = data.sessions.find((s) => s.id === selectedId) ?? live ?? data.sessions[0]

  // Terminal: lama di atas, baru di bawah, seperti log sungguhan.
  const lines = useMemo(() => {
    const list = onlyCommittee ? feed.filter((e) => e.feature?.startsWith('committee')) : feed
    return [...list].reverse().slice(-60)
  }, [feed, onlyCommittee])

  useEffect(() => {
    const el = terminalRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  async function startSession(e: React.FormEvent) {
    e.preventDefault()
    if (!symbol.trim()) return
    setStarting(true)
    setStartMsg('Sidang dibuka. Kursi akan terisi bergantian…')
    setSelectedId(null)
    // Penyegaran tetap berjalan selama permintaan ini menunggu; giliran muncul satu per satu.
    try {
      const res = await fetch('/api/v1/admin/ruang-komite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market, symbol: symbol.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setStartMsg(body.skippedReason ? `Selesai tanpa rapat: ${body.skippedReason}` : `Sidang #${body.sessionId} selesai.`)
      if (body.sessionId) setSelectedId(body.sessionId)
    } catch (err) {
      setStartMsg(`Sidang gagal: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStarting(false)
      void refresh()
    }
  }

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: 6, height: 6 }} />
            <span>RUANG SIDANG · DISEGARKAN TIAP 3 DETIK</span>
          </div>
          <h1 className="admin-page-headline">
            Ruang <span className="admin-headline-accent">Komite</span>
          </h1>
          <p className="admin-page-standfirst">
            Lima agen dari keluarga model berbeda bergiliran di satu meja. Lihat siapa yang sedang bicara, penyedia mana
            yang menjawab, dan kapan cadangan harus menggantikan.
          </p>
        </div>
        <form className={styles.startForm} onSubmit={startSession}>
          <select value={market} onChange={(e) => setMarket(e.target.value)} className={styles.input} aria-label="Pasar">
            <option value="IDX">IDX</option>
            <option value="US">US</option>
            <option value="CRYPTO">CRYPTO</option>
            <option value="GLOBAL">GLOBAL</option>
          </select>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BBCA.JK"
            className={styles.input}
            aria-label="Simbol"
          />
          <button type="submit" className={styles.startBtn} disabled={starting || !symbol.trim()}>
            <IconPlay size={13} /> {starting ? 'Bersidang…' : 'Buka sidang'}
          </button>
        </form>
      </div>

      {startMsg && <p className={styles.notice}>{startMsg}</p>}
      {error && (
        <p className={`${styles.notice} ${styles.noticeBad}`}>
          <IconAlert size={14} /> {error}
        </p>
      )}

      <div className={styles.sessionTabs} role="tablist" aria-label="Sidang terbaru">
        {data.sessions.length === 0 && <span className={styles.muted}>Belum ada sidang dalam 7 hari terakhir.</span>}
        {data.sessions.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={session?.id === s.id}
            className={`${styles.sessionTab} ${session?.id === s.id ? styles.sessionTabActive : ''}`}
            onClick={() => setSelectedId(s.id)}
          >
            <span className={`${styles.dot} ${styles[`dot_${s.status}`] ?? ''}`} />
            <span className="mono">{s.symbol}</span>
            <span className={styles.muted}>{time(s.startedAt)}</span>
          </button>
        ))}
        <Link href="/admin/arsip-kerja" className={styles.archiveLink}>
          <IconHistory size={13} /> Arsip lengkap
        </Link>
      </div>

      {session && <Table session={session} roles={data.roles} openSeat={openSeat} setOpenSeat={setOpenSeat} />}

      <div className={styles.lower}>
        <section className={styles.terminalWrap} aria-label="Umpan panggilan model">
          <header className={styles.terminalHead}>
            <span className="mono">
              <IconTerminal size={13} /> ai@komite:~$ tail -f panggilan-model
            </span>
            <label className={styles.toggle}>
              <input type="checkbox" checked={onlyCommittee} onChange={(e) => setOnlyCommittee(e.target.checked)} /> hanya sidang
            </label>
          </header>
          <div className={styles.terminal} ref={terminalRef}>
            {lines.length === 0 && <div className={styles.termMuted}>menunggu panggilan pertama…</div>}
            {lines.map((e, i) => (
              <FeedLine key={`${e.requestId ?? 'x'}-${e.attempt ?? 0}-${e.timestamp ?? i}`} event={e} />
            ))}
            <div className={styles.cursor}>_</div>
          </div>
        </section>

        <section className={styles.pools} aria-label="Kolam kunci">
          <h2 className={styles.sectionTitle}>Kolam kunci</h2>
          {data.pools.length === 0 && <p className={styles.muted}>Tidak ada penyedia yang terkonfigurasi.</p>}
          {data.pools.map((p) => {
            const ratio = p.total ? p.available / p.total : 0
            return (
              <div key={p.id} className={styles.pool}>
                <div className={styles.poolHead}>
                  <span className="mono">{p.id}</span>
                  <span className={ratio === 0 ? styles.bad : ratio < 1 ? styles.warn : styles.ok}>
                    {p.available}/{p.total} siap
                  </span>
                </div>
                <div className={styles.poolBar}>
                  <span style={{ width: `${ratio * 100}%` }} className={ratio === 0 ? styles.barBad : ratio < 1 ? styles.barWarn : styles.barOk} />
                </div>
                <div className={styles.poolModel}>{p.model}</div>
                {p.cooling.length > 0 && <div className={styles.poolCooling}>istirahat: {p.cooling.map((c) => c.split(' ')[0]).join(', ')}</div>}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function Table({
  session,
  roles,
  openSeat,
  setOpenSeat,
}: {
  session: Session
  roles: CommitteeRoomSnapshot['roles']
  openSeat: string | null
  setOpenSeat: (name: string | null) => void
}) {
  const running = session.status === 'running'
  const speaking = running ? roles.find((r) => !session.turns.some((t) => t.agent === r.name))?.name : undefined
  const opened = session.turns.find((t) => t.agent === openSeat)

  return (
    <section className={styles.room}>
      <div className={styles.roomHead}>
        <div>
          <span className={styles.muted}>Sidang #{session.id} · {session.market}</span>
          <h2 className={styles.roomTitle}>
            <IconCourt size={18} /> {session.symbol}
          </h2>
        </div>
        <StatusBadge session={session} />
      </div>

      <div className={styles.seats}>
        {roles.map((role) => {
          const turn = session.turns.find((t) => t.agent === role.name)
          return (
            <Seat
              key={role.name}
              role={role}
              turn={turn}
              speaking={speaking === role.name}
              failedHere={session.status === 'failed' && !turn && !!session.error?.includes(role.name)}
              open={openSeat === role.name}
              onToggle={() => setOpenSeat(openSeat === role.name ? null : role.name)}
            />
          )
        })}
      </div>

      {opened && (
        <div className={styles.transcript}>
          <div className={styles.transcriptHead}>
            <span className="mono">{opened.agent.toUpperCase()}</span>
            <span className={styles.muted}>
              {opened.providerId}/{opened.model} · {time(opened.createdAt)}
            </span>
          </div>
          <pre className={styles.transcriptBody}>{opened.content}</pre>
        </div>
      )}

      {session.status !== 'running' && (session.verdict || session.error) && (
        <div className={styles.verdict}>
          {session.verdict ? (
            <>
              <div className={styles.verdictRow}>
                <span className={`${styles.verdictTag} ${styles[`v_${session.verdict}`] ?? ''}`}>{session.verdict.toUpperCase()}</span>
                <span className={styles.muted}>{VERDICT_LABEL[session.verdict]}</span>
                {session.confidence !== null && <span className="mono">keyakinan {session.confidence}</span>}
              </div>
              {session.rationale && <p className={styles.rationale}>{session.rationale}</p>}
            </>
          ) : (
            <p className={styles.bad}>{session.error}</p>
          )}
        </div>
      )}
    </section>
  )
}

function Seat({
  role,
  turn,
  speaking,
  failedHere,
  open,
  onToggle,
}: {
  role: CommitteeRoomSnapshot['roles'][number]
  turn?: Turn
  speaking: boolean
  failedHere: boolean
  open: boolean
  onToggle: () => void
}) {
  const assigned = candidates(role.provider)
  const replaced =
    !!turn && (turn.failovers.length > 0 || (assigned.length > 0 && !!turn.providerId && !assigned.includes(turn.providerId)))
  const state = turn ? 'done' : speaking ? 'speaking' : failedHere ? 'failed' : 'waiting'

  return (
    <button
      type="button"
      className={`${styles.seat} ${styles[`seat_${state}`]} ${open ? styles.seatOpen : ''}`}
      onClick={onToggle}
      disabled={!turn}
      aria-expanded={open}
    >
      <div className={styles.seatHead}>
        <span className={styles.seatIcon}>{SEAT_ICON[role.name] ?? <IconChat size={16} />}</span>
        <span className={styles.seatTitle}>{role.title}</span>
      </div>
      <div className={styles.seatAssigned}>
        tugas: <span className="mono">{assigned.length ? assigned.join(' | ') : 'siapa pun selain ketua'}</span>
      </div>

      {state === 'speaking' && (
        <div className={styles.speaking}>
          <span className={styles.wave}>
            <i /> <i /> <i />
          </span>
          sedang berbicara…
        </div>
      )}
      {state === 'waiting' && <div className={styles.muted}>menunggu giliran</div>}
      {state === 'failed' && <div className={styles.bad}>gagal di kursi ini</div>}

      {turn && (
        <>
          <div className={styles.seatAnswer}>
            <span className="mono">{turn.providerId ?? '?'}</span>
            <span className={styles.muted}>{turn.model}</span>
          </div>
          <div className={styles.seatMeta}>
            {turn.latencyMs !== null && <span>{(turn.latencyMs / 1000).toFixed(1)} dtk</span>}
            {turn.tokens > 0 && <span>{turn.tokens} tok</span>}
          </div>
          {replaced && (
            <div className={styles.replaced}>
              <span className={styles.replacedTag}>DIGANTIKAN</span>
              {turn.failovers.length > 0 ? (
                <span className="mono">
                  {turn.failovers.map((f) => `${f.providerId}${f.keyIndex >= 0 ? `#${f.keyIndex}` : ''} ${f.kind}`).join(' → ')} → {turn.providerId}
                </span>
              ) : (
                <span>penyedia tugas tidak tersedia</span>
              )}
            </div>
          )}
        </>
      )}
    </button>
  )
}

function StatusBadge({ session }: { session: Session }) {
  const label =
    session.status === 'running' ? 'BERSIDANG' : session.status === 'done' ? 'SELESAI' : session.status === 'stalled' ? 'MACET' : 'GAGAL'
  return <span className={`${styles.status} ${styles[`status_${session.status}`] ?? ''}`}>{label}</span>
}

function FeedLine({ event: e }: { event: RoomFeedEvent }) {
  const feature = FEATURE_LABEL[e.feature ?? ''] ?? e.feature ?? '-'
  const who = `${e.providerId}#${e.keyIndex}`
  return (
    <div className={styles.termLine}>
      <span className={styles.termTime}>{time(e.timestamp)}</span>
      <span className={styles.termFeature}>{feature.padEnd(14, ' ')}</span>
      <span className={styles.termWho}>{who.padEnd(14, ' ')}</span>
      {e.success ? (
        <span className={styles.termOk}>
          OK {e.latencyMs}ms {e.inputTokens}→{e.outputTokens} tok
          {(e.attempt ?? 1) > 1 && <span className={styles.termWarn}> (cadangan, percobaan ke-{e.attempt})</span>}
        </span>
      ) : (
        <span className={styles.termBad}>
          GAGAL {e.errorKind ?? 'galat'} {e.status ? `HTTP ${e.status}` : ''} → pindah
        </span>
      )}
    </div>
  )
}
