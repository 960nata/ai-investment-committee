'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import type { AgentVerdict, MarketCode } from '@/lib/db/schema'
import { SkeletonBoardroom, Track, Tag, Lamp } from './ui'
import type { State } from './ui'
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconClose,
  IconCopy,
  IconCourt,
  IconRows,
  IconScales,
  IconShield,
  IconTarget,
  IconChat,
  IconTrendDown,
  IconTrendUp,
  IconLayers,
  IconBolt,
  IconPlay,
  IconRefresh,
} from './icons'

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

type ViewMode = 'timeline' | 'arena' | 'summary'

const ROLES_INFO: Record<
  string,
  { title: string; badge: string; badgeTone: 'neutral' | 'ok' | 'warn' | 'down'; icon: React.ReactNode }
> = {
  analis: {
    title: 'Analis Data Kuantitatif',
    badge: 'AUDIT DATA',
    badgeTone: 'neutral',
    icon: <IconRows size={16} />,
  },
  strateg: {
    title: 'Strateg Portofolio',
    badge: 'TESIS INVESTASI (BULL)',
    badgeTone: 'ok',
    icon: <IconTarget size={16} />,
  },
  risiko: {
    title: 'Pengawas Risiko',
    badge: "DEVIL'S ADVOCATE (BEAR)",
    badgeTone: 'down',
    icon: <IconShield size={16} />,
  },
  ketua: {
    title: 'Ketua Komite (CIO)',
    badge: 'PUTUSAN SIDANG',
    badgeTone: 'warn',
    icon: <IconScales size={16} />,
  },
}

const STEPS = [
  { agent: 'Analis Data', text: 'Mengaudit angka, volatilitas & kualitas data...', icon: <IconRows size={16} /> },
  { agent: 'Strateg Portofolio', text: 'Menyusun tesis investasi & target harga...', icon: <IconTarget size={16} /> },
  { agent: 'Pengawas Risiko', text: 'Menguji skenario terburuk & mencari celah kerugian...', icon: <IconShield size={16} /> },
  { agent: 'Ketua Komite', text: 'Menimbang debat & memukul palu putusan...', icon: <IconScales size={16} /> },
]

export function CommitteeBoardroom({ symbol, market, name, onClose }: Props) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(true)
  const [deliberating, setDeliberating] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [prevSymbol, setPrevSymbol] = useState(symbol)

  if (prevSymbol !== symbol) {
    setPrevSymbol(symbol)
    setLoading(true)
    setError(null)
  }

  const stepTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Ambil transkrip rapat terakhir untuk instrumen ini
  useEffect(() => {
    let cancelled = false

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

  // Parse detail dari giliran Ketua untuk safeguarded items
  const parsedKetua = useMemo(() => {
    const ketuaTurn = turns.find((t) => t.agent === 'ketua')
    if (!ketuaTurn?.content) return null

    try {
      return JSON.parse(ketuaTurn.content)
    } catch {
      const lines = ketuaTurn.content.split('\n')
      const res: Record<string, string> = {}
      for (const line of lines) {
        const parts = line.split(':')
        if (parts.length > 1) {
          const k = parts[0].toLowerCase().trim()
          const v = parts.slice(1).join(':').trim()
          if (k.includes('risiko') || k.includes('risk')) res.key_risk = v
          if (k.includes('batal') || k.includes('invalidation')) res.invalidation = v
          if (k.includes('alasan') || k.includes('rationale')) res.rationale = v
        }
      }
      return res
    }
  }, [turns])

  function handleShare() {
    if (!session) return

    const verdictText = (session.verdict ?? 'ABSTAIN').toUpperCase()
    const confidenceText = session.confidence != null ? `${session.confidence}%` : 'N/A'
    const rationaleText = (parsedKetua?.rationale as string) ?? session.rationale ?? ''
    const keyRiskText = (parsedKetua?.key_risk as string) ?? ''
    const invalidationText = (parsedKetua?.invalidation as string) ?? ''

    const text = [
      `[SIDANG KOMITE INVESTASI AI]`,
      `Aset      : ${symbol} (${name})`,
      `Putusan   : [ ${verdictText} ]`,
      `Keyakinan : ${confidenceText} (Kekuatan Bukti Kuantitatif)`,
      ``,
      `[KONSENSUS TESIS]`,
      rationaleText,
      keyRiskText ? `\n[RISIKO UTAMA]\n${keyRiskText}` : '',
      invalidationText ? `\n[SYARAT PEMBATALAN / CUT LOSS]\n${invalidationText}` : '',
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

  const confidenceTier = useMemo(() => {
    if (confidence >= 75) return 'Konfirmasi Multi-Metrik Kuat'
    if (confidence >= 50) return 'Bukti Kuantitatif Cukup'
    if (confidence >= 30) return 'Divergensi Sinyal / Sampel Sedang'
    return 'Bukti Lemah · Kurang Sampel Kuantitatif'
  }, [confidence])

  const confidenceState: State =
    confidence >= 60 ? 'ok' : confidence >= 35 ? 'degraded' : 'halted'

  const tensionInfo = useMemo(() => {
    if (verdict === 'beli') {
      return {
        label: 'Bull Dominan',
        status: 'Bull Dominan · Tesis Lolos Uji Risiko',
        ratio: 0.8,
        state: 'ok' as State,
      }
    }
    if (verdict === 'jual') {
      return {
        label: 'Bear Dominan',
        status: 'Bear Dominan · Tekanan Risiko Tinggi',
        ratio: 0.2,
        state: 'halted' as State,
      }
    }
    if (verdict === 'abstain') {
      return {
        label: 'Deadlock',
        status: 'Deadlock · Pengawas Risiko Memblokir Tesis',
        ratio: 0.35,
        state: 'degraded' as State,
      }
    }
    return {
      label: 'Netral',
      status: 'Netral · Menunggu Konfirmasi Volume',
      ratio: 0.5,
      state: 'unknown' as State,
    }
  }, [verdict])

  const verdictTone: 'ok' | 'down' | 'warn' | 'neutral' =
    verdict === 'beli' ? 'ok' : verdict === 'jual' ? 'down' : verdict === 'tahan' ? 'warn' : 'neutral'

  const turnAnalis = turns.find((t) => t.agent === 'analis')
  const turnStrateg = turns.find((t) => t.agent === 'strateg')
  const turnRisiko = turns.find((t) => t.agent === 'risiko')
  const turnKetua = turns.find((t) => t.agent === 'ketua')

  return (
    <section className="boardroom-panel panel" style={{ marginTop: 'var(--space-4)' }}>
      {/* Header Bar Ruang Sidang */}
      <div className="boardroom-head">
        <div className="boardroom-title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="eyebrow" style={{ color: 'var(--signal)' }}>RUANG SIDANG AI</span>
            <Lamp state={deliberating ? 'degraded' : 'ok'} />
          </div>
          <h2 className="panel-title" style={{ fontSize: 'var(--t-head)', marginTop: 2 }}>
            <IconCourt size={18} />
            Komite Investasi · {symbol}
          </h2>
          <span style={{ fontSize: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 2 }}>
            Perdebatan 4 Agen Spesialis di atas data kuantitatif objektif (Zero Hallucination Protocol)
          </span>
        </div>

        <div className="boardroom-actions">
          {session && (
            <button
              type="button"
              className="btn"
              onClick={handleShare}
              title="Salin ringkasan tesis untuk dibagikan"
            >
              {copied ? (
                <>
                  <IconCheck size={13} /> Tersalin!
                </>
              ) : (
                <>
                  <IconCopy size={13} /> Bagikan Tesis
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="btn btn-signal"
            onClick={() => triggerDeliberation(true)}
            disabled={deliberating}
          >
            {deliberating ? (
              <>
                <IconRefresh size={13} className="spin" /> Sidang Berlangsung...
              </>
            ) : session ? (
              <>
                <IconPlay size={12} /> Sidang Ulang
              </>
            ) : (
              <>
                <IconPlay size={12} /> Panggil Komite (Live)
              </>
            )}
          </button>

          {onClose && (
            <button type="button" className="btn" onClick={onClose} title="Tutup">
              <IconClose size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Loading animation saat proses deliberasi live */}
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconAlert size={14} /> {error}
          </span>
          <button type="button" className="btn" style={{ padding: '2px 8px' }} onClick={() => triggerDeliberation(true)}>
            Coba lagi
          </button>
        </div>
      )}

      {loading && !deliberating && (
        <div style={{ padding: 'var(--space-4)' }}>
          <SkeletonBoardroom />
        </div>
      )}

      {!loading && !deliberating && !session && (
        <div className="boardroom-empty">
          <div className="empty-circle">
            <IconCourt size={28} />
          </div>
          <h3>Belum Ada Sidang untuk {symbol}</h3>
          <p>
            Komite investasi belum menggelar rapat evaluasi untuk instrumen ini.
            Klik tombol di bawah untuk memanggil rapat 4 agen AI secara langsung.
          </p>
          <button
            type="button"
            className="btn btn-signal"
            style={{ marginTop: 'var(--space-3)', padding: '10px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => triggerDeliberation(false)}
          >
            <IconPlay size={12} /> Gelar Sidang Komite Sekarang
          </button>
        </div>
      )}

      {/* Putusan & Debat 4 Agen */}
      {!deliberating && session && (
        <div className="boardroom-body">
          {/* 3 KARTU READOUT UTAMA (Format Resmi Dashboard) */}
          <div className="readouts" style={{ marginTop: 0 }}>
            {/* Kartu 1: Putusan Akhir */}
            <div className="readout">
              <div className="readout-head">
                <IconScales size={14} />
                <span className="readout-label">PUTUSAN RESMI KOMITE</span>
              </div>
              <div className="readout-value" style={{ marginTop: 'var(--space-2)' }}>
                <Tag tone={verdictTone}>{String(verdict ?? 'ABSTAIN').toUpperCase()}</Tag>
              </div>
              <p className="readout-note">Palu putusan resmi Ketua Komite (CIO)</p>
            </div>

            {/* Kartu 2: Keyakinan Bukti */}
            <div className="readout">
              <div className="readout-head">
                <IconShield size={14} />
                <span className="readout-label">KEYAKINAN BUKTI</span>
              </div>
              <div className="readout-value">{confidence}%</div>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Track
                  value={confidence / 100}
                  state={confidenceState}
                  ticks={16}
                  label="Keyakinan Bukti"
                />
              </div>
              <p className="readout-note">{confidenceTier}</p>
            </div>

            {/* Kartu 3: Tensi Debat */}
            <div className="readout">
              <div className="readout-head">
                <IconTarget size={14} />
                <span className="readout-label">TENSI DEBAT (BULL VS BEAR)</span>
              </div>
              <div className="readout-value" style={{ fontSize: '18px' }}>
                {tensionInfo.label}
              </div>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Track
                  value={tensionInfo.ratio}
                  state={tensionInfo.state}
                  ticks={16}
                  label="Tensi Debat"
                />
              </div>
              <p className="readout-note">{tensionInfo.status}</p>
            </div>
          </div>

          {/* Dekrit Konsensus Alasan Putusan */}
          <div className="boardroom-decree-panel">
            <div className="decree-head">
              <IconCourt size={14} />
              <span>KONSENSUS &amp; ALASAN PUTUSAN KOMITE:</span>
            </div>
            <p className="decree-body">{session.rationale}</p>
          </div>

          {/* Dua Pilar Safeguards: Risiko Kunci & Syarat Pembatalan (Teks & Judul Terpisah Jelas) */}
          {(parsedKetua?.key_risk || parsedKetua?.invalidation) && (
            <div className="boardroom-safeguards-row">
              {parsedKetua?.key_risk && (
                <div className="safeguard-box risk">
                  <div className="safeguard-head">
                    <IconAlert size={14} />
                    <span>RISIKO UTAMA YANG TIDAK TERJAWAB</span>
                  </div>
                  <p className="safeguard-text">{parsedKetua.key_risk}</p>
                </div>
              )}
              {parsedKetua?.invalidation && (
                <div className="safeguard-box invalidation">
                  <div className="safeguard-head">
                    <IconShield size={14} />
                    <span>SYARAT PEMBATALAN / CUT-LOSS</span>
                  </div>
                  <p className="safeguard-text">{parsedKetua.invalidation}</p>
                </div>
              )}
            </div>
          )}

          {/* Tab Navigasi Standar (.tabs & .tab) */}
          <div className="tabs" style={{ marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="tab"
              aria-selected={viewMode === 'timeline'}
              onClick={() => setViewMode('timeline')}
            >
              <IconRows size={13} /> Alur Sidang (4 Babak)
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={viewMode === 'arena'}
              onClick={() => setViewMode('arena')}
            >
              <IconBolt size={13} /> Arena Debat: Bull vs Bear
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={viewMode === 'summary'}
              onClick={() => setViewMode('summary')}
            >
              <IconLayers size={13} /> Ringkasan Eksekutif
            </button>
          </div>

          {/* --- TAMPILAN 1: Alur Sidang Kronologis (4 Babak) --- */}
          {viewMode === 'timeline' && (
            <div className="turns-list">
              {turns.map((turn, idx) => {
                const role = ROLES_INFO[turn.agent] ?? {
                  title: turn.agent,
                  badge: 'ANGGOTA',
                  badgeTone: 'neutral' as const,
                  icon: <IconChat size={16} />,
                }

                return (
                  <div key={idx} className="agent-card">
                    <div className="agent-card-head">
                      <span className="agent-avatar">{role.icon}</span>
                      <div className="agent-meta">
                        <span className="agent-title">{role.title}</span>
                        <Tag tone={role.badgeTone}>{role.badge}</Tag>
                      </div>
                      {turn.latencyMs && (
                        <span className="turn-latency">{(turn.latencyMs / 1000).toFixed(1)}s respons</span>
                      )}
                    </div>

                    <div className="agent-card-content">
                      {turn.agent === 'analis' && <AnalisRenderer raw={turn.content} />}
                      {turn.agent === 'strateg' && <StrategRenderer raw={turn.content} />}
                      {turn.agent === 'risiko' && <RisikoRenderer raw={turn.content} />}
                      {turn.agent === 'ketua' && <KetuaRenderer raw={turn.content} session={session} />}
                      {!['analis', 'strateg', 'risiko', 'ketua'].includes(turn.agent) && (
                        <FallbackRenderer raw={turn.content} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* --- TAMPILAN 2: Arena Debat Bull vs Bear (Side by Side) --- */}
          {viewMode === 'arena' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Snapshot Analis Kuantitatif di Atas */}
              {turnAnalis && (
                <div className="agent-card">
                  <div className="agent-card-head">
                    <span className="agent-avatar">
                      <IconRows size={16} />
                    </span>
                    <div className="agent-meta">
                      <span className="agent-title">
                        Fakta Kuantitatif Terverifikasi (Pijakan Debat)
                      </span>
                      <Tag tone="neutral">AUDIT FAKTA</Tag>
                    </div>
                  </div>
                  <div className="agent-card-content">
                    <AnalisRenderer raw={turnAnalis.content} />
                  </div>
                </div>
              )}

              {/* 2 Kolom: Strateg (BULL) vs Pengawas Risiko (BEAR) - Seimbang & Simetris */}
              <div className="boardroom-split-arena">
                {/* Kolom Kiri: Strateg Portofolio */}
                <div className="arena-column">
                  <div className="arena-col-header bull">
                    <span className="arena-col-title">
                      <IconTrendUp size={14} /> SUDUT BULLISH · STRATEG PORTOFOLIO
                    </span>
                    <span className="arena-col-subtitle">TESIS PERTUMBUHAN</span>
                  </div>
                  {turnStrateg ? (
                    <div className="agent-card arena-card">
                      <div className="agent-card-content">
                        <StrategRenderer raw={turnStrateg.content} />
                      </div>
                    </div>
                  ) : (
                    <div className="panel" style={{ padding: 16, color: 'var(--ink-mute)' }}>
                      Tesis strateg belum tersedia.
                    </div>
                  )}
                </div>

                {/* Kolom Kanan: Pengawas Risiko */}
                <div className="arena-column">
                  <div className="arena-col-header bear">
                    <span className="arena-col-title">
                      <IconTrendDown size={14} /> SUDUT BEARISH · PENGAWAS RISIKO
                    </span>
                    <span className="arena-col-subtitle">STRESS TEST &amp; SKENARIO RUGI</span>
                  </div>
                  {turnRisiko ? (
                    <div className="agent-card arena-card">
                      <div className="agent-card-content">
                        <RisikoRenderer raw={turnRisiko.content} />
                      </div>
                    </div>
                  ) : (
                    <div className="panel" style={{ padding: 16, color: 'var(--ink-mute)' }}>
                      Analisis risiko belum tersedia.
                    </div>
                  )}
                </div>
              </div>

              {/* Putusan Akhir Ketua Komite di Bawah */}
              {turnKetua && (
                <div className="agent-card">
                  <div className="agent-card-head">
                    <span className="agent-avatar">
                      <IconScales size={16} />
                    </span>
                    <div className="agent-meta">
                      <span className="agent-title">
                        Palu Sidang &amp; Putusan Konsensus Akhir
                      </span>
                      <Tag tone="warn">PUTUSAN RESMI</Tag>
                    </div>
                  </div>
                  <div className="agent-card-content">
                    <KetuaRenderer raw={turnKetua.content} session={session} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- TAMPILAN 3: Ringkasan Eksekutif --- */}
          {viewMode === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {turnKetua ? (
                <div className="agent-card">
                  <div className="agent-card-head">
                    <span className="agent-avatar">
                      <IconScales size={16} />
                    </span>
                    <div className="agent-meta">
                      <span className="agent-title">
                        Keputusan Eksekutif Komite Investasi
                      </span>
                      <Tag tone="warn">DECREE CIO</Tag>
                    </div>
                  </div>
                  <div className="agent-card-content">
                    <KetuaRenderer raw={turnKetua.content} session={session} />
                  </div>
                </div>
              ) : null}

              {turnStrateg && turnRisiko && (
                <div className="proof-pillars-grid">
                  <div className="thesis-proof-item">
                    <div className="proof-heading">Inti Peluang (Bull)</div>
                    <p className="proof-description">
                      {extractKey(turnStrateg.content, 'tesis') || 'Tesis pemulihan tren aset.'}
                    </p>
                  </div>
                  <div className="risk-attack-item">
                    <div className="attack-heading">Risiko Utama (Bear)</div>
                    <p className="attack-description">
                      {extractKey(turnRisiko.content, 'skenario rugi') ||
                        extractKey(turnRisiko.content, 'kelemahan utama') ||
                        'Potensi koreksi teknikal mendalam.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// SUB-RENDERER MASING-MASING AGEN
// ---------------------------------------------------------------------------

/** Renderer Khusus Analis Data Kuantitatif */
function AnalisRenderer({ raw }: { raw: string }) {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  const map: Record<string, string> = {}
  const constraints: string[] = []

  for (const line of lines) {
    const parts = line.split(':')
    if (parts.length > 1) {
      const k = parts[0].toLowerCase().trim()
      const v = parts.slice(1).join(':').trim()
      if (k.includes('batas data')) {
        constraints.push(v)
      } else {
        map[k] = v
      }
    }
  }

  const ret90 = findVal(map, ['imbal hasil 90 hari', 'return 90d', '90 hari'])
  const ret365 = findVal(map, ['imbal hasil 365 hari', 'return 365d', '365 hari', '1 tahun'])
  const vol = findVal(map, ['volatilitas', 'volatilitas disetahunkan'])
  const dd = findVal(map, ['penurunan terdalam', 'drawdown', 'max drawdown'])
  const sma50 = findVal(map, ['harga vs sma50', 'sma50', 'vs sma50'])
  const volRatio = findVal(map, ['rasio volume', 'volume 20v100'])
  const dataLen = findVal(map, ['panjang riwayat', 'riwayat', 'panjang'])
  const dataAge = findVal(map, ['umur data', 'umur'])

  return (
    <div>
      <div className="analis-grid">
        {ret90 && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Imbal Hasil 90H</span>
            <span className={`analis-stat-val ${isPos(ret90) ? 'positive' : 'negative'}`}>{ret90}</span>
          </div>
        )}
        {ret365 && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Imbal Hasil 365H</span>
            <span className={`analis-stat-val ${isPos(ret365) ? 'positive' : 'negative'}`}>{ret365}</span>
          </div>
        )}
        {vol && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Volatilitas (Ann.)</span>
            <span className="analis-stat-val warning">{vol}</span>
          </div>
        )}
        {dd && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Max Drawdown</span>
            <span className="analis-stat-val negative">{dd}</span>
          </div>
        )}
        {sma50 && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Jarak vs SMA50</span>
            <span className={`analis-stat-val ${isPos(sma50) ? 'positive' : 'negative'}`}>{sma50}</span>
          </div>
        )}
        {volRatio && (
          <div className="analis-stat-card">
            <span className="analis-stat-label">Rasio Volume</span>
            <span className="analis-stat-val">{volRatio}</span>
          </div>
        )}
      </div>

      {(dataLen || dataAge) && (
        <div className="analis-sample-info">
          {dataLen && <span>Sampel: {dataLen}</span>}
          {dataAge && <span>· Umur Data: {dataAge}</span>}
        </div>
      )}

      {constraints.length > 0 && (
        <div className="data-guardrail-banner">
          <div className="guardrail-title">
            <IconShield size={12} />
            <span>BATAS INTEGRITAS DATA (DILARANG HALUSINASI)</span>
          </div>
          <div className="guardrail-tags">
            {constraints.map((c, i) => (
              <Tag key={i} tone="neutral">
                <IconClose size={10} style={{ marginRight: 4 }} />
                {c}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Renderer Khusus Strateg Portofolio (BULL) */
function StrategRenderer({ raw }: { raw: string }) {
  const map = parseLabeledSections(raw)

  const thesis = findVal(map, ['tesis investasi utama', 'tesis investasi', 'tesis utama', 'tesis'])
  const cutloss = findVal(map, ['syarat pembatalan', 'pembatalan', 'cutloss', 'cut loss'])
  const posSize = findVal(map, ['ukuran posisi', 'posisi'])
  const horizon = findVal(map, ['horizon waktu', 'horizon'])
  const notes = findVal(map, ['catatan', 'note', 'keterangan'])

  // Kumpulkan bukti-bukti dari map
  const proofs: { label: string; text: string }[] = []
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith('bukti') && v) {
      proofs.push({ label: k.toUpperCase(), text: v })
    }
  }

  // Tepat 4 kartu untuk membentuk grid 2x2 simetris dengan Pengawas Risiko
  const points: { label: string; text: string }[] = []

  // Slot 1, 2, 3
  if (proofs.length >= 1) points.push(proofs[0])
  else points.push({ label: 'BUKTI 1', text: 'Konfirmasi tren pergerakan harga jangka menengah.' })

  if (proofs.length >= 2) points.push(proofs[1])
  else points.push({ label: 'BUKTI 2', text: 'Posisi harga relatif terhadap rata-rata pergerakan (SMA).' })

  if (proofs.length >= 3) points.push(proofs[2])
  else points.push({ label: 'BUKTI 3', text: 'Dukungan partisipasi volume transaksi pada pergerakan aset.' })

  // Slot 4: Alokasi Posisi & Horizon Waktu (atau Bukti ke-4 bila ada)
  if (proofs.length >= 4) {
    points.push(proofs[3])
  } else {
    const paramParts: string[] = []
    if (posSize) paramParts.push(`Posisi: ${posSize}`)
    if (horizon) paramParts.push(`Horizon: ${horizon}`)
    points.push({
      label: 'ALOKASI POSISI & HORIZON',
      text: paramParts.length > 0 ? paramParts.join(' · ') : 'Ukuran posisi terukur sesuai volatilitas aset dan toleransi risiko.',
    })
  }

  return (
    <div className="arena-symmetric-layout">
      {/* Tier 1: Kartu Fokus Tesis Utama */}
      <div className="arena-focus-card bull">
        <div className="arena-focus-title">
          <IconTarget size={13} />
          <span>TESIS INVESTASI UTAMA</span>
        </div>
        <p className="arena-focus-text">
          {thesis || 'Tesis pertumbuhan dan pemulihan tren aset terkonfirmasi secara bertahap.'}
        </p>
      </div>

      {/* Tier 2: 4 Kartu Poin Bukti (2x2 Grid) */}
      <div className="arena-points-grid">
        {points.map((p, idx) => (
          <div key={idx} className="arena-point-card bull">
            <div className="point-heading">
              <IconTarget size={11} />
              <span>{p.label}</span>
            </div>
            <p className="point-description">{p.text}</p>
          </div>
        ))}
      </div>

      {/* Tier 3: Batas Pembatalan (Cut-Loss) */}
      <div className="arena-gate-card bull">
        <div className="arena-gate-head">
          <IconShield size={13} />
          <span>BATAS PEMBATALAN (CUT-LOSS)</span>
        </div>
        <p className="arena-gate-body">
          {cutloss || 'Penutupan di bawah level teknikal utama atau pelemahan harian melampaui batas toleransi risiko.'}
        </p>
        {notes && (
          <div className="arena-gate-note">
            <IconAlert size={11} />
            <span>Catatan: {notes}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Renderer Khusus Pengawas Risiko (BEAR / Devil's Advocate) */
function RisikoRenderer({ raw }: { raw: string }) {
  const map = parseLabeledSections(raw)

  const worstCase = findVal(map, [
    'skenario kerugian maksimal',
    'skenario rugi',
    'skenario terburuk',
    'potensi kerugian',
    'worst case',
    'skenario',
  ])
  const primaryWeakness = findVal(map, ['kelemahan utama', 'kelemahan'])
  const ignoredData = findVal(map, ['data yang diabaikan', 'data diabaikan', 'diabaikan'])
  const weakValidation = findVal(map, ['validasi argumen lemah', 'validasi lemah', 'argumen lemah'])
  const liquidityRisk = findVal(map, ['risiko likuiditas', 'likuiditas'])
  const mandatoryCond = findVal(map, [
    'kondisi wajib proteksi modal',
    'kondisi wajib',
    'syarat wajib',
    'proteksi modal',
  ])

  // Tepat 4 kartu serangan untuk membentuk grid 2x2 simetris dengan Strateg Portofolio
  const attacks: { label: string; text: string }[] = [
    {
      label: 'KELEMAHAN UTAMA',
      text:
        primaryWeakness ||
        'Tesis mengabaikan tren jangka panjang dan potensi koreksi struktural yang belum teruji.',
    },
    {
      label: 'DATA YANG DIABAIKAN',
      text:
        ignoredData ||
        'Jarak harga terhadap puncak historis dan batas volatilitas ekstrem belum dihitung cermat.',
    },
    {
      label: 'VALIDASI ARGUMEN LEMAH',
      text:
        weakValidation ||
        'Deviasi harga saat ini masih berada dalam batas volatilitas normal aset, bukan sinyal konfirmasi.',
    },
    {
      label: 'RISIKO LIKUIDITAS',
      text:
        liquidityRisk ||
        'Penurunan partisipasi volume mengindikasikan likuiditas rapuh yang rentan slippage tajam.',
    },
  ]

  return (
    <div className="arena-symmetric-layout">
      {/* Tier 1: Kartu Fokus Skenario Kerugian */}
      <div className="arena-focus-card bear">
        <div className="arena-focus-title">
          <IconAlert size={13} />
          <span>SKENARIO KERUGIAN MAKSIMAL (WORST CASE)</span>
        </div>
        <p className="arena-focus-text">
          {worstCase || 'Penurunan tajam menguji moving average utama yang memicu drawdown modal signifikan.'}
        </p>
      </div>

      {/* Tier 2: 4 Kartu Serangan Risiko (2x2 Grid) */}
      <div className="arena-points-grid">
        {attacks.map((att, idx) => (
          <div key={idx} className="arena-point-card bear">
            <div className="point-heading">
              <IconAlert size={11} />
              <span>{att.label}</span>
            </div>
            <p className="point-description">{att.text}</p>
          </div>
        ))}
      </div>

      {/* Tier 3: Kondisi Wajib Proteksi Modal */}
      <div className="arena-gate-card bear">
        <div className="arena-gate-head">
          <IconCheck size={13} />
          <span>KONDISI WAJIB PROTEKSI MODAL</span>
        </div>
        <p className="arena-gate-body">
          {mandatoryCond || 'Tesis hanya layak dieksekusi bila konfirmasi volume dan batas cut-loss dipatuhi ketat.'}
        </p>
      </div>
    </div>
  )
}

/** Renderer Khusus Ketua Komite (CIO) */
function KetuaRenderer({ raw, session }: { raw: string; session: SessionData }) {
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    // line-based
  }

  const verdict = (parsed?.verdict as string | undefined) ?? session.verdict ?? 'abstain'
  const rationale = (parsed?.rationale as string | undefined) ?? session.rationale ?? raw
  const keyRisk = (parsed?.key_risk as string | undefined) ?? extractKey(raw, 'risiko utama')
  const invalidation = (parsed?.invalidation as string | undefined) ?? extractKey(raw, 'syarat pembatalan')

  const verdictTone =
    verdict === 'beli' ? 'ok' : verdict === 'jual' ? 'down' : verdict === 'tahan' ? 'warn' : 'neutral'

  return (
    <div className="cio-decree-box">
      <div className="cio-verdict-row">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-small)', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          Putusan Final Ketua:
        </span>
        <Tag tone={verdictTone}>{String(verdict).toUpperCase()}</Tag>
      </div>

      <div className="cio-rationale-box">
        <strong style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--mono)', fontSize: 'var(--t-small)', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          Alasan Konsensus Komite:
        </strong>
        {rationale}
      </div>

      {(keyRisk || invalidation) && (
        <div className="boardroom-safeguards-row" style={{ marginTop: 0 }}>
          {keyRisk && (
            <div className="safeguard-box risk">
              <div className="safeguard-head">
                <IconAlert size={12} />
                <span>RISIKO KUNCI YANG TIDAK TERJAWAB</span>
              </div>
              <p className="safeguard-text">{keyRisk}</p>
            </div>
          )}
          {invalidation && (
            <div className="safeguard-box invalidation">
              <div className="safeguard-head">
                <IconShield size={12} />
                <span>SYARAT PEMBATALAN / TINDAK LANJUT</span>
              </div>
              <p className="safeguard-text">{invalidation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Fallback Renderer untuk teks agen tidak standar */
function FallbackRenderer({ raw }: { raw: string }) {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((line, i) => {
        const parts = line.split(':')
        if (parts.length > 1 && parts[0].length < 35) {
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)' }}>
                {parts[0].trim()}:
              </span>
              <span style={{ color: 'var(--ink)' }}>{parts.slice(1).join(':').trim()}</span>
            </div>
          )
        }
        return (
          <p key={i} style={{ margin: 0, color: 'var(--ink)' }}>
            {line}
          </p>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UTILITY PARSER HELPERS
// ---------------------------------------------------------------------------

/** Parser toleran format untuk teks terstruktur dari agen AI */
function parseLabeledSections(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let currentKey: string | null = null
  let currentValParts: string[] = []

  const flush = () => {
    if (currentKey && currentValParts.length > 0) {
      map[currentKey] = currentValParts.join(' ')
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Deteksi jika baris memiliki pemisah titik dua pendek (contoh: "Posisi: Sedang", "Bukti 1: Imbal hasil...")
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 45) {
      flush()
      currentKey = line
        .slice(0, colonIdx)
        .toLowerCase()
        .trim()
        .replace(/^[\*✓✕\-•\d\.\)]+\s*/, '')
      currentValParts = [line.slice(colonIdx + 1).trim()]
      continue
    }

    // Deteksi jika baris adalah heading terisolasi tanpa titik dua
    const cleanLine = line.replace(/^[\*✓✕\-•\d\.\)]+\s*/, '').trim()
    const lower = cleanLine.toLowerCase()
    const isKnownHeader =
      lower.startsWith('tesis') ||
      lower.startsWith('bukti') ||
      lower.startsWith('kelemahan') ||
      lower.startsWith('data yang diabaikan') ||
      lower.startsWith('data diabaikan') ||
      lower.startsWith('validasi') ||
      lower.startsWith('risiko likuiditas') ||
      lower.startsWith('skenario') ||
      lower.startsWith('kondisi wajib') ||
      lower.startsWith('syarat pembatalan') ||
      lower.startsWith('cutloss') ||
      lower.startsWith('cut loss') ||
      lower.startsWith('posisi') ||
      lower.startsWith('horizon') ||
      lower.startsWith('catatan')

    if (isKnownHeader && cleanLine.length < 55) {
      flush()
      currentKey = lower
      currentValParts = []
      continue
    }

    // Baris kelanjutan teks
    if (currentKey) {
      currentValParts.push(line)
    } else {
      currentValParts.push(line)
    }
  }
  flush()

  return map
}

function findVal(map: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (map[k]) return map[k]
  }
  for (const [mk, mv] of Object.entries(map)) {
    if (keys.some((k) => mk.includes(k))) return mv
  }
  return undefined
}

function extractKey(raw: string, keyName: string): string | undefined {
  const lines = raw.split('\n')
  for (const line of lines) {
    const parts = line.split(':')
    if (parts.length > 1 && parts[0].toLowerCase().includes(keyName.toLowerCase())) {
      return parts.slice(1).join(':').trim()
    }
  }
  return undefined
}

function isPos(val: string): boolean {
  if (val.includes('-')) return false
  return true
}
