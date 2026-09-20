'use client'

import { useState, useEffect, useRef } from 'react'
import type { AgentVerdict, MarketCode } from '@/lib/db/schema'

interface Turn {
  agent: string
  content: string
  providerId?: string | null
  model?: string | null
  latencyMs?: number | null
}

interface SessionData {
  id: number
  symbol: string
  market: MarketCode | string
  status: string
  verdict: AgentVerdict | null
  confidence: number | null
  rationale: string | null
  startedAt: string
  finishedAt: string | null
}

interface Props {
  symbol: string
  market: MarketCode | string
  name: string
  currency?: string
  onClose?: () => void
}

const ROLES_INFO: Record<
  string,
  { title: string; badge: string; icon: string; color: string; bg: string; border: string }
> = {
  analis: {
    title: 'Analis Data Kuantitatif',
    badge: 'AUDIT DATA',
    icon: '📊',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.08)',
    border: 'rgba(56, 189, 248, 0.25)',
  },
  strateg: {
    title: 'Strateg Portofolio',
    badge: 'TESIS INVESTASI (BULL)',
    icon: '🎯',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.08)',
    border: 'rgba(52, 211, 153, 0.25)',
  },
  risiko: {
    title: 'Pengawas Risiko',
    badge: "DEVIL'S ADVOCATE (BEAR)",
    icon: '🛡️',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.08)',
    border: 'rgba(248, 113, 113, 0.25)',
  },
  ketua: {
    title: 'Ketua Komite (CIO)',
    badge: 'PUTUSAN SIDANG',
    icon: '⚖️',
    color: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.08)',
    border: 'rgba(167, 139, 250, 0.25)',
  },
}

const STEPS = [
  { agent: 'Analis Data', text: 'Mengaudit angka, volatilitas & kualitas data...', icon: '📊' },
  { agent: 'Strateg Portofolio', text: 'Menyusun tesis investasi & target harga...', icon: '🎯' },
  { agent: 'Pengawas Risiko', text: 'Menguji skenario terburuk & mencari celah kerugian...', icon: '🛡️' },
  { agent: 'Ketua Komite', text: 'Menimbang debat & memukul palu putusan...', icon: '⚖️' },
]

export function CommitteeBoardroom({ symbol, market, name, onClose }: Props) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(true)
  const [deliberating, setDeliberating] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const stepTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Ambil transkrip rapat terakhir untuk instrumen ini
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function fetchSession() {
      try {
        const res = await fetch(`/api/v1/committee/deliberate?symbol=${encodeURIComponent(symbol)}&market=${market}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setSession(data.session)
          setTurns(data.turns ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[Boardroom] Gagal memuat sesi rapat:', err)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSession()
    return () => {
      cancelled = true
    }
  }, [symbol, market])

  // Panggil rapat komite live
  async function triggerDeliberation(force = true) {
    if (deliberating) return
    setDeliberating(true)
    setError(null)
    setStepIndex(0)

    // Animasi bertahap untuk 4 agen
    let currentStep = 0
    stepTimerRef.current = setInterval(() => {
      currentStep = (currentStep + 1) % STEPS.length
      setStepIndex(currentStep)
    }, 1500)

    try {
      const res = await fetch('/api/v1/committee/deliberate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market, force }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      if (data.result) {
        setSession({
          id: data.result.sessionId,
          symbol,
          market,
          status: data.result.status,
          verdict: data.result.verdict,
          confidence: data.result.confidence,
          rationale: data.result.rationale,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        })
        setTurns(data.result.turns ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current)
      setDeliberating(false)
    }
  }

  function handleShare() {
    if (!session) return

    const ketuaTurn = turns.find((t) => t.agent === 'ketua')
    let parsed: Record<string, unknown> = {}
    try {
      if (ketuaTurn?.content) parsed = JSON.parse(ketuaTurn.content)
    } catch {
      // Abaikan jika teks bukan JSON murni
    }

    const verdictText = (session.verdict ?? 'BELI').toUpperCase()
    const confidenceText = session.confidence != null ? `${session.confidence}%` : 'N/A'
    const rationaleText = (parsed.rationale as string) ?? session.rationale ?? ''
    const keyRiskText = (parsed.key_risk as string) ?? ''
    const invalidationText = (parsed.invalidation as string) ?? ''

    const text = [
      `🏛️ HASIL RAPAT KOMITE INVESTASI AI`,
      `Instrumen: ${symbol} (${name})`,
      `Putusan  : [ ${verdictText} ]`,
      `Keyakinan: ${confidenceText} (Kekuatan Bukti Kuantitatif)`,
      ``,
      `📌 Tesis Utama:`,
      rationaleText,
      keyRiskText ? `\n⚠️ Risiko Terbesar (Pengawas Risiko):\n${keyRiskText}` : '',
      invalidationText ? `\n🛑 Syarat Pembatalan (Cut Loss):\n${invalidationText}` : '',
      ``,
      `— Ditelaah oleh 4 Agen AI Kuantitatif (Analis, Strateg, Pengawas Risiko, Ketua Komite)`,
    ]
      .filter(Boolean)
      .join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const verdict = session?.verdict
  const confidence = session?.confidence ?? 0

  return (
    <section className="boardroom-panel panel" style={{ marginTop: 'var(--space-3)' }}>
      {/* Header bar */}
      <div className="boardroom-head">
        <div className="boardroom-title-block">
          <span className="boardroom-tag">RUANG SIDANG AI</span>
          <h2 className="boardroom-title">
            <span className="boardroom-icon">🏛️</span>
            Komite Investasi · {symbol}
          </h2>
          <span className="boardroom-sub">
            Perdebatan 4 Agen Spesialis di atas data kuantitatif objektif
          </span>
        </div>

        <div className="boardroom-actions">
          {session && (
            <button
              type="button"
              className="boardroom-btn btn-share"
              onClick={handleShare}
              title="Salin ringkasan tesis untuk dibagikan ke Telegram/Twitter"
            >
              {copied ? '✓ Tersalin!' : '📋 Bagikan Tesis'}
            </button>
          )}

          <button
            type="button"
            className="boardroom-btn btn-primary"
            onClick={() => triggerDeliberation(true)}
            disabled={deliberating}
          >
            {deliberating ? (
              <>
                <span className="live-dot" />
                Rapat Sedang Berlangsung...
              </>
            ) : session ? (
              '▶ Sidang Ulang'
            ) : (
              '▶ Panggil Komite (Live)'
            )}
          </button>

          {onClose && (
            <button type="button" className="boardroom-btn btn-close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Loading state perputaran agen saat sidang berlangsung */}
      {deliberating && (
        <div className="boardroom-live-status">
          <div className="live-progress-bar">
            <div className="live-progress-glow" />
          </div>
          <div className="live-status-content">
            <span className="live-agent-icon">{STEPS[stepIndex]?.icon}</span>
            <div className="live-status-text">
              <strong>{STEPS[stepIndex]?.agent}</strong>
              <p>{STEPS[stepIndex]?.text}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="boardroom-error">
          <span>⚠️ {error}</span>
          <button type="button" className="link-inline" onClick={() => triggerDeliberation(true)}>
            Coba lagi
          </button>
        </div>
      )}

      {loading && !deliberating && (
        <div className="boardroom-empty">
          <span className="boardroom-spinner" />
          <p>Memeriksa riwayat sidang komite...</p>
        </div>
      )}

      {!loading && !deliberating && !session && (
        <div className="boardroom-empty">
          <div className="empty-circle">🏛️</div>
          <h3>Belum Ada Sidang untuk {symbol}</h3>
          <p>
            Komite investasi belum menggelar rapat evaluasi untuk instrumen ini.
            Klik tombol di bawah untuk memanggil rapat 4 agen AI secara langsung.
          </p>
          <button
            type="button"
            className="boardroom-btn btn-primary btn-large"
            onClick={() => triggerDeliberation(false)}
          >
            ▶ Gelar Sidang Komite Sekarang
          </button>
        </div>
      )}

      {/* Putusan & Debat 4 Agen */}
      {!deliberating && session && (
        <div className="boardroom-body">
          {/* Banner Putusan Akhir */}
          <div className={`verdict-banner verdict-${verdict ?? 'abstain'}`}>
            <div className="verdict-pill-wrap">
              <span className="verdict-label">PUTUSAN KOMITE</span>
              <div className="verdict-badge">
                {verdict === 'beli' && '🚀 BELI'}
                {verdict === 'tahan' && '⏸️ TAHAN'}
                {verdict === 'jual' && '🔻 JUAL'}
                {verdict === 'abstain' && '🛡️ ABSTAIN'}
              </div>
            </div>

            <div className="verdict-metrics">
              <div className="metric-box">
                <span className="metric-label">Keyakinan Bukti</span>
                <div className="metric-val-row">
                  <span className="metric-value">{confidence}%</span>
                  <div className="confidence-meter">
                    <div
                      className="confidence-fill"
                      style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="metric-box tension-box">
                <span className="metric-label">Tensi Rapat (Bull vs Bear)</span>
                <div className="tension-bar">
                  <span className="tension-bull">🐂 Strateg</span>
                  <div className="tension-track">
                    <div
                      className="tension-pointer"
                      style={{
                        left: `${verdict === 'beli' ? 75 : verdict === 'jual' ? 25 : 50}%`,
                      }}
                    />
                  </div>
                  <span className="tension-bear">Risiko 🐻</span>
                </div>
              </div>
            </div>

            <div className="verdict-rationale">
              <p className="rationale-text">{session.rationale}</p>
            </div>
          </div>

          {/* Transkrip 4 Agen */}
          <div className="boardroom-transcript">
            <div className="transcript-head">
              <h3>Transkrip Rapat & Argumen Agen</h3>
              <span className="transcript-hint">
                {turns.length} putaran sidang · Dicatat permanen di database
              </span>
            </div>

            <div className="turns-list">
              {turns.map((turn, idx) => {
                const role = ROLES_INFO[turn.agent] ?? {
                  title: turn.agent,
                  badge: 'ANGGOTA',
                  icon: '💬',
                  color: 'var(--ink)',
                  bg: 'var(--surface-2)',
                  border: 'var(--line)',
                }

                return (
                  <div
                    key={idx}
                    className={`agent-card agent-${turn.agent}`}
                    style={{ borderColor: role.border }}
                  >
                    <div className="agent-card-head" style={{ background: role.bg }}>
                      <span className="agent-avatar">{role.icon}</span>
                      <div className="agent-meta">
                        <span className="agent-title" style={{ color: role.color }}>
                          {role.title}
                        </span>
                        <span className="agent-badge">{role.badge}</span>
                      </div>
                      {turn.latencyMs && (
                        <span className="turn-latency">{(turn.latencyMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>

                    <div className="agent-card-content">
                      {formatAgentContent(turn.agent, turn.content)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Format teks agen agar nyaman dibaca dan tidak berupa JSON mentah */
function formatAgentContent(agent: string, raw: string) {
  if (agent === 'ketua') {
    try {
      const parsed = JSON.parse(raw)
      return (
        <div className="ketua-summary">
          <div className="ketua-row">
            <strong>Putusan:</strong>
            <span className={`pill-inline verdict-${parsed.verdict}`}>{parsed.verdict?.toUpperCase()}</span>
          </div>
          <div className="ketua-row">
            <strong>Alasan:</strong>
            <span>{parsed.rationale}</span>
          </div>
          {parsed.key_risk && (
            <div className="ketua-row risk-row">
              <strong>Risiko Utama:</strong>
              <span>{parsed.key_risk}</span>
            </div>
          )}
          {parsed.invalidation && (
            <div className="ketua-row inv-row">
              <strong>Syarat Pembatalan:</strong>
              <span>{parsed.invalidation}</span>
            </div>
          )}
        </div>
      )
    } catch {
      // Jika bukan JSON, render sebagai teks
    }
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  return (
    <div className="turn-lines">
      {lines.map((line, i) => {
        const parts = line.split(':')
        if (parts.length > 1 && parts[0] && parts[0].length < 35) {
          const label = parts[0].trim()
          const val = parts.slice(1).join(':').trim()
          return (
            <div key={i} className="turn-row">
              <span className="turn-key">{label}:</span>
              <span className="turn-val">{val}</span>
            </div>
          )
        }
        return (
          <p key={i} className="turn-p">
            {line}
          </p>
        )
      })}
    </div>
  )
}
