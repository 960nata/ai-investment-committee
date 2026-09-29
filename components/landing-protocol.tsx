'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { CommitteeSessionStage } from './committee-session-stage'
import type { LiveSession } from '@/lib/agents/session-view'

/*
 * "Cara sidang berjalan" — sidang komite terakhir yang sungguhan, diputar.
 *
 * Isinya diambil dari sidang terakhir yang selesai di basis data, lalu bagian
 * ini memeriksa tiap menit apakah ada sidang baru. Begitu ada, panggungnya
 * diganti dan diputar ulang. Selama belum ada satu pun sidang yang selesai
 * (basis data baru, atau gagal dibaca), yang diputar adalah sidang contoh di
 * bawah ini, dan ditandai begitu di layar.
 *
 * Sidang contoh:
 *
 * Kiri: empat kursi komite; yang sedang bicara menyala. Kanan: transkrip yang
 * terisi pesan demi pesan. Tiap angka di pesan disorot, dan chip yang sama di
 * blok fakta di bawahnya ikut menyala — memperlihatkan, bukan mengatakan, bahwa
 * agen hanya boleh memakai angka dari blok itu. Puncaknya keberatan risiko yang
 * tidak terjawab: stempel veto jatuh, dan pembacaan ketua berbalik.
 *
 * Angka di sini ilustrasi, dan ditandai begitu di layar.
 */

export type AgentId = 'analis' | 'strateg' | 'risiko' | 'ketua'

/** Dipakai juga oleh ruang sidang di dashboard, supaya kursinya sama persis. */
export const AGENTS: { id: AgentId; initials: string; name: string; duty: string; rule: string }[] = [
  {
    id: 'analis',
    initials: 'AN',
    name: 'Analis Data',
    duty: 'Melaporkan fakta',
    rule: 'Dilarang menyarankan transaksi',
  },
  {
    id: 'strateg',
    initials: 'ST',
    name: 'Strateg Portofolio',
    duty: 'Menyusun satu tesis',
    rule: 'Dilarang memakai angka di luar blok fakta',
  },
  {
    id: 'risiko',
    initials: 'RI',
    name: 'Pengawas Risiko',
    duty: 'Menyerang tesis',
    rule: 'Dilarang mencari titik tengah',
  },
  {
    id: 'ketua',
    initials: 'KE',
    name: 'Ketua Komite',
    duty: 'Menulis pembacaan',
    rule: 'Dilarang mengabaikan keberatan yang tak terjawab',
  },
]

const FACTS = [
  { key: 'vol_ratio_20_100', value: '1,42×' },
  { key: 'dist_sma200', value: '+3,2%' },
  { key: 'max_drawdown_1y', value: '−12,4%' },
  { key: 'batas_drawdown', value: '−10,0%' },
  { key: 'volatility_20d', value: '1,8%' },
] as const

type FactKey = (typeof FACTS)[number]['key']

/** Potongan teks; `fact` menandai angka yang diambil dari blok fakta. */
type Segment = string | { text: string; fact: FactKey }

type Line =
  | { kind: 'message'; agent: AgentId; round: number; body: Segment[]; veto?: boolean }
  | { kind: 'system'; body: string }
  | { kind: 'verdict' }

const SCRIPT: Line[] = [
  {
    kind: 'message',
    agent: 'analis',
    round: 1,
    body: [
      'Volume 20 hari ',
      { text: '1,42×', fact: 'vol_ratio_20_100' },
      ' rata-rata 100 hari. Harga ',
      { text: '3,2%', fact: 'dist_sma200' },
      ' di atas SMA200. Drawdown setahun ',
      { text: '−12,4%', fact: 'max_drawdown_1y' },
      '.',
    ],
  },
  {
    kind: 'message',
    agent: 'strateg',
    round: 2,
    body: [
      'Tesis: harga bertahan di atas SMA200 (',
      { text: '+3,2%', fact: 'dist_sma200' },
      '). Horizon 1–3 bulan, kekuatan sedang. Batal bila tutup di bawah SMA200.',
    ],
  },
  {
    kind: 'message',
    agent: 'risiko',
    round: 3,
    veto: true,
    body: [
      'Drawdown terburuk ',
      { text: '−12,4%', fact: 'max_drawdown_1y' },
      ' melewati batas ',
      { text: '−10,0%', fact: 'batas_drawdown' },
      '. Tesis tidak menyebutnya sama sekali.',
    ],
  },
  { kind: 'system', body: 'Strateg tidak menjawab keberatan.' },
  { kind: 'verdict' },
]

/** Jeda "sedang mengetik" sebelum tiap baris, lalu jeda baca sesudahnya. */
const TYPING_MS = 900
const READ_MS = 1500

function factsOf(line: Line | undefined): FactKey[] {
  if (!line || line.kind !== 'message') return []
  return line.body.flatMap((s) => (typeof s === 'string' ? [] : [s.fact]))
}

/** Jarak antar pemeriksaan sidang baru. Endpointnya ditahan CDN 30 detik. */
const POLL_MS = 60_000

export function LandingProtocol({ initial = null }: { initial?: LiveSession | null }) {
  const [live, setLive] = useState<LiveSession | null>(initial)
  const liveId = live?.id

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/v1/committee/latest')
        if (!res.ok) return
        const data = (await res.json()) as { session: LiveSession | null }
        if (!cancelled && data.session && data.session.id !== liveId) setLive(data.session)
      } catch {
        // Jaringan putus: tetap tampilkan sidang yang sudah ada.
      }
    }
    const timer = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [liveId])

  return (
    <section className="dlb" id="features">
      <div className="dlb-inner">
        <header className="dlb-head">
          <div>
            <p className="dlb-eyebrow">Cara sidang berjalan</p>
            <h2 className="dlb-title">
              Empat agen bergiliran.
              <br />
              <span>Satu yang boleh bilang tidak.</span>
            </h2>
          </div>
          <p className="dlb-lede">
            Satu model yang ditanya langsung cenderung membenarkan apa yang ingin didengar
            penanyanya. Komite memecah pekerjaan itu: yang melapor fakta tidak menyusun tesis, dan
            yang menyusun tesis tidak menilai risikonya sendiri.
          </p>
        </header>

        {live ? (
          <>
            <p className="dlb-live-meta">
              <span className="dlb-rec is-live" aria-hidden="true" />
              Sidang terakhir · {live.symbol}
              {live.finishedAt && (
                <span suppressHydrationWarning> · selesai {timeAgo(live.finishedAt)}</span>
              )}
            </p>
            <CommitteeSessionStage
              key={live.id}
              symbol={live.symbol}
              facts={live.stage.facts}
              analis={live.stage.analis}
              strateg={live.stage.strateg}
              risiko={live.stage.risiko}
              verdict={live.verdict}
              confidence={live.confidence}
              rationale={live.stage.rationale}
              invalidation={live.stage.invalidation}
              latencyMs={live.stage.latencyMs}
              playKey={live.id}
            />
          </>
        ) : (
          <IllustratedSession />
        )}
      </div>
    </section>
  )
}

function timeAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.round(h / 24)} hari lalu`
}

function IllustratedSession() {
  const ref = useRef<HTMLDivElement>(null)
  // Berapa baris yang sudah tampil, dan apakah baris berikutnya sedang "diketik".
  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)
  const [started, setStarted] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }

  const play = useCallback(() => {
    clearTimers()
    setShown(0)
    setTyping(false)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(SCRIPT.length)
      return
    }

    let at = 300
    SCRIPT.forEach((_, i) => {
      timers.current.push(setTimeout(() => setTyping(true), at))
      at += TYPING_MS
      timers.current.push(
        setTimeout(() => {
          setTyping(false)
          setShown(i + 1)
        }, at),
      )
      at += READ_MS
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Diputar sekali saat bagian ini mulai terbaca; tombol "Putar ulang" untuk
    // yang ingin melihatnya lagi. Sidang yang berulang sendiri terbaca sebagai
    // hiasan, bukan proses.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          play()
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -35% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimers()
    }
  }, [play])

  const done = shown >= SCRIPT.length
  const current = SCRIPT[Math.max(0, shown - 1)]
  const next = SCRIPT[shown]
  const speaking: AgentId | null = typing
    ? next?.kind === 'message'
      ? next.agent
      : next?.kind === 'verdict'
        ? 'ketua'
        : null
    : shown > 0 && current.kind === 'message'
      ? current.agent
      : shown > 0 && current.kind === 'verdict'
        ? 'ketua'
        : null
  const litFacts = new Set(shown > 0 ? factsOf(current) : [])
  const spoken = new Set(
    SCRIPT.slice(0, shown).flatMap((l) =>
      l.kind === 'message' ? [l.agent] : l.kind === 'verdict' ? ['ketua' as const] : [],
    ),
  )

  return (
    <div ref={ref}>

      <div className="dlb-stage">
        {/* --- Kursi komite ------------------------------------------------ */}
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
                  <span className="dlb-seat-turn">putaran {i + 1}</span>
                </p>
                <p className="dlb-seat-duty">{a.duty}</p>
                <p className="dlb-seat-rule">{a.rule}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* --- Transkrip ------------------------------------------------------ */}
        <div className="dlb-window">
          <div className="dlb-window-bar">
            <span className="dlb-window-title">
              <span className={`dlb-rec${started && !done ? ' is-live' : ''}`} aria-hidden="true" />
              Sidang · BBCA.JK
            </span>
            <span className="dlb-window-tag">contoh ilustrasi</span>
          </div>

          <div className="dlb-transcript" aria-live="polite">
            {!started && <p className="dlb-waiting">Sidang dimulai saat bagian ini terbaca…</p>}

            {SCRIPT.slice(0, shown).map((line, i) => (
              <TranscriptLine key={i} line={line} />
            ))}

            {typing && next && (
              <div
                className={`dlb-typing is-${
                  next.kind === 'message' ? next.agent : next.kind === 'verdict' ? 'ketua' : 'system'
                }`}
              >
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <div className="dlb-window-foot">
            <span>Transkrip dan blok fakta dibekukan saat pembacaan ditulis.</span>
            {done && (
              <button type="button" className="dlb-replay" onClick={play}>
                ↻ Putar ulang
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --- Blok fakta ---------------------------------------------------------- */}
      <div className="dlb-facts">
        <p className="dlb-facts-title">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Blok fakta — satu-satunya sumber angka
        </p>
        <ul>
          {FACTS.map((f) => (
            <li key={f.key} className={litFacts.has(f.key) ? 'is-lit' : ''}>
              <span className="k">{f.key}</span>
              <span className="v">{f.value}</span>
            </li>
          ))}
        </ul>
        <p className="dlb-facts-note">
          Dihitung kode dari candle harian. Angka yang tidak ada di sini ditulis agen sebagai
          &ldquo;tidak tersedia&rdquo;.
        </p>
      </div>
    </div>
  )
}

function TranscriptLine({ line }: { line: Line }) {
  if (line.kind === 'system') {
    return <p className="dlb-system">{line.body}</p>
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
            <span className="before">Bukti positif</span>
            <span className="after">Tidak dinilai</span>
          </p>
          <p className="dlb-verdict-why">
            Keberatan risiko tidak terjawab · keyakinan <strong>41</strong>/100
          </p>
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
        <p className="dlb-msg-body">
          {line.body.map((s, i) =>
            typeof s === 'string' ? (
              <Fragment key={i}>{s}</Fragment>
            ) : (
              <mark key={i} title={`dari blok fakta: ${s.fact}`}>
                {s.text}
              </mark>
            ),
          )}
        </p>
        {line.veto && (
          <span className="dlb-stamp" role="img" aria-label="Veto dijatuhkan">
            Veto
          </span>
        )}
      </div>
    </div>
  )
}
