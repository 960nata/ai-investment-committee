'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENTS, type AgentId } from './landing-protocol'
import { verdictLabel } from '@/lib/format/verdict'
import type { StageFact } from '@/lib/agents/session-view'

/*
 * Ruang sidang di dashboard, dengan bahasa visual yang sama dengan bagian
 * "Cara sidang berjalan" di halaman depan: kursi komite di kiri, transkrip di
 * kanan, blok fakta di bawah. Bedanya, di sini isinya sidang sungguhan untuk
 * satu instrumen, bukan contoh ilustrasi.
 *
 * Transkrip diputar sekali saat pertama terlihat. Orang yang datang untuk
 * membaca putusan tidak harus menunggu: tombol "Lewati" menampilkan semuanya.
 */

export type { StageFact }

interface Props {
  symbol: string
  facts: StageFact[]
  /** Isi pesan tiap agen. Agen yang tidak bicara tidak ditampilkan. */
  analis?: string
  strateg?: string
  risiko?: string
  verdict: string | null
  confidence: number
  rationale?: string
  invalidation?: string
  latencyMs?: Partial<Record<AgentId, number>>
  /** Ganti nilainya untuk memutar ulang, mis. sesudah sidang baru selesai. */
  playKey: string | number
}

type Line =
  | { kind: 'message'; agent: Exclude<AgentId, 'ketua'>; round: number; body: string; withFacts?: boolean; veto?: boolean }
  | { kind: 'system'; body: string }
  | { kind: 'verdict' }

const TYPING_MS = 700
const READ_MS = 1100

export function CommitteeSessionStage({
  symbol,
  facts,
  analis,
  strateg,
  risiko,
  verdict,
  confidence,
  rationale,
  invalidation,
  latencyMs,
  playKey,
}: Props) {
  const abstained = verdict === 'abstain' || verdict == null

  const script: Line[] = []
  if (analis) script.push({ kind: 'message', agent: 'analis', round: 1, body: analis, withFacts: true })
  if (strateg) script.push({ kind: 'message', agent: 'strateg', round: 2, body: strateg })
  if (risiko) script.push({ kind: 'message', agent: 'risiko', round: 3, body: risiko, veto: abstained })
  if (risiko && abstained) script.push({ kind: 'system', body: 'Keberatan risiko belum terjawab.' })
  script.push({ kind: 'verdict' })

  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)
  const [started, setStarted] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const total = script.length

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }

  const skip = useCallback(() => {
    clearTimers()
    setTyping(false)
    setShown(total)
  }, [total])

  const play = useCallback(() => {
    clearTimers()
    setShown(0)
    setTyping(false)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(total)
      return
    }

    let at = 200
    for (let i = 0; i < total; i++) {
      timers.current.push(setTimeout(() => setTyping(true), at))
      at += TYPING_MS
      timers.current.push(
        setTimeout(() => {
          setTyping(false)
          setShown(i + 1)
        }, at),
      )
      at += READ_MS
    }
  }, [total])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          play()
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -20% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimers()
    }
  }, [play, playKey])

  // `shown` bisa tertinggal dari saham sebelumnya: transkrip lima baris yang
  // sudah selesai diputar, lalu saham berikutnya cuma punya tiga. Tanpa
  // dijepit, `script[shown - 1]` kosong dan `current.kind` menjatuhkan halaman.
  // Effect di atas memutar ulang dari nol begitu naskah barunya terlihat.
  const at = Math.min(shown, total)
  const done = at >= total
  const current: Line | undefined = script[Math.max(0, at - 1)]
  const next: Line | undefined = script[at]
  const agentOf = (line: Line | undefined): AgentId | null =>
    !line ? null : line.kind === 'message' ? line.agent : line.kind === 'verdict' ? 'ketua' : null
  const speaking = typing ? agentOf(next) : at > 0 ? agentOf(current) : null
  const spoken = new Set(script.slice(0, at).map(agentOf).filter(Boolean))
  const factsLit = at > 0 && current?.kind === 'message' && current.withFacts === true

  return (
    <div ref={ref} className="dlb is-embedded">
      <div className="dlb-stage">
        <ol className="dlb-seats" aria-label="Anggota komite">
          {AGENTS.map((a, i) => (
            <li
              key={a.id}
              className={`dlb-seat is-${a.id}${speaking === a.id ? ' is-speaking' : ''}${
                spoken.has(a.id) ? ' has-spoken' : ''
              }`}
            >
              <span className="dlb-avatar" aria-hidden="true">
                {a.initials}
              </span>
              <div className="dlb-seat-text">
                <p className="dlb-seat-name">
                  {a.name}
                  <span className="dlb-seat-turn">
                    putaran {i + 1}
                    {latencyMs?.[a.id] ? ` · ${(latencyMs[a.id]! / 1000).toFixed(1)} dtk` : ''}
                  </span>
                </p>
                <p className="dlb-seat-duty">{a.duty}</p>
                <p className="dlb-seat-rule">{a.rule}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="dlb-window">
          <div className="dlb-window-bar">
            <span className="dlb-window-title">
              <span className={`dlb-rec${started && !done ? ' is-live' : ''}`} aria-hidden="true" />
              Sidang · {symbol}
            </span>
            <span className="dlb-window-tag">{done ? 'transkrip sidang' : 'sidang berjalan'}</span>
          </div>

          <div className="dlb-transcript" aria-live="polite">
            {!started && <p className="dlb-waiting">Memutar transkrip sidang…</p>}

            {script.slice(0, at).map((line, i) => (
              <TranscriptLine
                key={`${playKey}-${i}`}
                line={line}
                verdict={verdict}
                confidence={confidence}
                rationale={rationale}
                invalidation={invalidation}
              />
            ))}

            {typing && next && (
              <div className={`dlb-typing is-${agentOf(next) ?? 'system'}`}>
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <div className="dlb-window-foot">
            <span>Transkrip dan blok fakta dibekukan saat pembacaan ditulis.</span>
            {done ? (
              <button type="button" className="dlb-replay" onClick={play}>
                ↻ Putar ulang
              </button>
            ) : (
              started && (
                <button type="button" className="dlb-replay" onClick={skip}>
                  Lewati ›
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {facts.length > 0 && (
        <div className="dlb-facts">
          <p className="dlb-facts-title">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Blok fakta — satu-satunya sumber angka
          </p>
          <ul>
            {facts.map((f) => (
              <li key={f.label} className={factsLit ? 'is-lit' : ''}>
                <span className="k">{f.label}</span>
                <span className={`v tone-${f.tone}`}>{f.value}</span>
              </li>
            ))}
          </ul>
          <p className="dlb-facts-note">
            Dihitung kode dari candle harian, lalu dibacakan Analis di putaran pertama.
          </p>
        </div>
      )}
    </div>
  )
}

function TranscriptLine({
  line,
  verdict,
  confidence,
  rationale,
  invalidation,
}: {
  line: Line
  verdict: string | null
  confidence: number
  rationale?: string
  invalidation?: string
}) {
  if (line.kind === 'system') {
    return <p className="dlb-system dlb-enter">{line.body}</p>
  }

  if (line.kind === 'verdict') {
    return (
      <div className="dlb-msg is-ketua dlb-enter">
        <span className="dlb-avatar" aria-hidden="true">
          KE
        </span>
        <div className="dlb-verdict">
          <p className="dlb-msg-who">Ketua Komite · putaran 4</p>
          <p className="dlb-verdict-label">Pembacaan</p>
          <p className="dlb-verdict-value">
            <span className="after">{verdictLabel(verdict)}</span>
          </p>
          <p className="dlb-verdict-why">
            keyakinan <strong>{confidence}</strong>/100
          </p>
          {rationale && <p className="dlb-msg-body dlb-verdict-rationale">{rationale}</p>}
          {invalidation && (
            <p className="dlb-verdict-watch">
              <span>Ditinjau ulang bila</span> {invalidation}
            </p>
          )}
        </div>
      </div>
    )
  }

  const agent = AGENTS.find((a) => a.id === line.agent)!
  return (
    <div className={`dlb-msg is-${line.agent} dlb-enter`}>
      <span className="dlb-avatar" aria-hidden="true">
        {agent.initials}
      </span>
      <div className="dlb-bubble">
        <p className="dlb-msg-who">
          {agent.name} · putaran {line.round}
        </p>
        <p className="dlb-msg-body">{line.body}</p>
        {line.veto && (
          <span className="dlb-stamp" role="img" aria-label="Veto dijatuhkan">
            Veto
          </span>
        )}
      </div>
    </div>
  )
}
