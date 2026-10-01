'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import type { AgentVerdict, MarketCode } from '@/lib/db/schema'
import { SkeletonBoardroom, Tag, Lamp } from './ui'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconCourt,
  IconRows,
  IconScales,
  IconShield,
  IconTarget,
  IconChat,
  IconPlay,
  IconRefresh,
} from './icons'
import { verdictLabel, verdictTone } from '@/lib/format/verdict'
import { CommitteeSessionStage } from './committee-session-stage'
import { cleanRationale, findVal, isPos, parseKetua, parseLabeledSections, toStageView } from '@/lib/agents/session-view'

interface Turn {
  agent: string
  content: string
  providerId?: string | null
  model?: string | null
  latencyMs?: number | null
}

const PROVIDER_NAMES: Record<string, string> = {
  cerebras: 'Cerebras',
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  nvidia: 'NVIDIA',
  premium: 'Premium',
}

/** "NVIDIA · llama-3.3-70b-instruct" — nama model tanpa awalan organisasinya. */
function modelLabel(providerId: string | null | undefined, model: string): string {
  const short = model.split('/').pop() ?? model
  const provider = providerId ? PROVIDER_NAMES[providerId] ?? providerId : null
  return provider ? `${provider} · ${short}` : short
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
  const parsedKetua = useMemo(() => parseKetua(turns.find((t) => t.agent === 'ketua')?.content), [turns])

  function handleShare() {
    if (!session) return

    const verdictText = verdictLabel(session.verdict).toUpperCase()
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
      invalidationText ? `\n[SYARAT PEMBATALAN]\n${invalidationText}` : '',
      ``,
      `— Ditelaah oleh 4 Agen AI Kuantitatif (Analis, Strateg, Pengawas Risiko, Ketua Komite)`,
      `Bukan rekomendasi membeli atau menjual efek apa pun.`,
    ]
      .filter(Boolean)
      .join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const verdict = session?.verdict
  const confidence = session?.confidence ?? 0

  const stage = useMemo(() => toStageView(turns, session?.rationale ?? null), [turns, session?.rationale])

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
          <CommitteeSessionStage
            // Komponen baru per sidang: posisi putar saham sebelumnya tidak
            // boleh terbawa ke naskah saham berikutnya yang panjangnya beda.
            key={session.id}
            symbol={symbol}
            facts={stage.facts}
            analis={stage.analis}
            strateg={stage.strateg}
            risiko={stage.risiko}
            verdict={verdict ?? null}
            confidence={confidence}
            rationale={stage.rationale}
            invalidation={stage.invalidation}
            latencyMs={stage.latencyMs}
            playKey={session.id}
          />

          {/* Jawaban lengkap tiap agen, dilipat supaya tidak menenggelamkan sidang */}
          {turns.length > 0 && (
            <details className="verdict-transcript">
              <summary>
                <IconRows size={13} /> Baca jawaban lengkap tiap agen
              </summary>
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
                          <span className="agent-title">
                            {idx + 1}. {role.title}
                          </span>
                          <Tag tone={role.badgeTone}>{role.badge}</Tag>
                          {turn.model ? (
                            <span className="agent-model mono" title={turn.model}>
                              {modelLabel(turn.providerId, turn.model)}
                            </span>
                          ) : null}
                        </div>
                        {turn.latencyMs ? (
                          <span className="turn-latency">{(turn.latencyMs / 1000).toFixed(1)}s</span>
                        ) : null}
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
            </details>
          )}

          <p className="verdict-disclaimer">
            Hasil telaah 4 agen AI atas data kuantitatif. Bukan rekomendasi membeli atau menjual efek apa pun.
          </p>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// RINGKASAN PUTUSAN
// ---------------------------------------------------------------------------

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

  const points: { label: string; text: string }[] = []
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith('bukti') && v) points.push({ label: k.toUpperCase(), text: v })
  }
  const params = [posSize && `Posisi: ${posSize}`, horizon && `Horizon: ${horizon}`].filter(Boolean).join(' · ')
  if (params) points.push({ label: 'POSISI & HORIZON', text: params })

  return (
    <div className="arena-symmetric-layout">
      {/* Tier 1: Kartu Fokus Tesis Utama */}
      <div className="arena-focus-card bull">
        <div className="arena-focus-title">
          <IconTarget size={13} />
          <span>TESIS INVESTASI UTAMA</span>
        </div>
        <p className="arena-focus-text">{thesis ?? raw}</p>
      </div>

      {points.length > 0 && (
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
      )}

      {(cutloss || notes) && (
        <div className="arena-gate-card bull">
          <div className="arena-gate-head">
            <IconShield size={13} />
            <span>BATAS PEMBATALAN (CUT-LOSS)</span>
          </div>
          {cutloss && <p className="arena-gate-body">{cutloss}</p>}
          {notes && (
            <div className="arena-gate-note">
              <IconAlert size={11} />
              <span>Catatan: {notes}</span>
            </div>
          )}
        </div>
      )}
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

  const attacks = [
    { label: 'KELEMAHAN UTAMA', text: primaryWeakness },
    { label: 'DATA YANG DIABAIKAN', text: ignoredData },
    { label: 'VALIDASI ARGUMEN LEMAH', text: weakValidation },
    { label: 'RISIKO LIKUIDITAS', text: liquidityRisk },
  ].filter((a): a is { label: string; text: string } => Boolean(a.text))

  return (
    <div className="arena-symmetric-layout">
      {/* Tier 1: Kartu Fokus Skenario Kerugian */}
      <div className="arena-focus-card bear">
        <div className="arena-focus-title">
          <IconAlert size={13} />
          <span>SKENARIO KERUGIAN MAKSIMAL (WORST CASE)</span>
        </div>
        <p className="arena-focus-text">{worstCase ?? raw}</p>
      </div>

      {attacks.length > 0 && (
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
      )}

      {mandatoryCond && (
        <div className="arena-gate-card bear">
          <div className="arena-gate-head">
            <IconCheck size={13} />
            <span>KONDISI WAJIB PROTEKSI MODAL</span>
          </div>
          <p className="arena-gate-body">{mandatoryCond}</p>
        </div>
      )}
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
  const rationale = (parsed?.rationale as string | undefined) ?? cleanRationale(session.rationale) ?? raw
  const tone = verdictTone(verdict)

  return (
    <div className="cio-decree-box">
      <div className="cio-verdict-row">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-small)', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          Pembacaan Ketua:
        </span>
        <Tag tone={tone}>{verdictLabel(verdict).toUpperCase()}</Tag>
      </div>

      <div className="cio-rationale-box">
        <strong style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--mono)', fontSize: 'var(--t-small)', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          Alasan Konsensus Komite:
        </strong>
        {rationale}
      </div>

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
