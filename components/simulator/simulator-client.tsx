'use client'

/**
 * Simulator trading bergaya platform trading: bar akun di atas, daftar pasar
 * | grafik realtime | tiket order, lalu panel tab (posisi, riwayat, desk AI,
 * radar) di bawah.
 *
 * Empat dompet terpisah (binary, harian, bulanan, tahunan). Semua angka uang
 * datang dari server; komponen ini hanya mengirim niat — simbol, arah,
 * stake — dan menggambar ulang dari keadaan yang dikembalikan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BINARY_EXPIRIES,
  BINARY_PAYOUT,
  BINARY_SYMBOLS,
  CHART_INTERVALS,
  DEFAULT_INTERVAL,
  MODE_INFO,
  SIM_MODES,
  STARTING_BALANCE_USD,
  type ChartInterval,
  type SimMode,
} from '@/lib/simulator/config'
import type { MarkedPosition, SimState } from '@/lib/simulator/engine'
import type { DeskDecision, DeskTurn, ExecutedAction } from '@/lib/simulator/desk'
import type { SignalReport } from '@/lib/simulator/signals'
import { PLAYBOOK, playbookRecord, type PlaybookSetup } from '@/lib/simulator/playbook'
import { TradeChart, formatPrice, type ChartLine } from './trade-chart'
import s from './simulator.module.css'

export interface SimInstrumentOption {
  symbol: string
  name: string
  market: string
  assetClass: string
}

interface Selected {
  symbol: string
  market: string
  name: string
}

const CRYPTO_NAMES: Record<string, string> = {
  BTCUSDT: 'Bitcoin',
  ETHUSDT: 'Ethereum',
  BNBUSDT: 'BNB',
  SOLUSDT: 'Solana',
  XRPUSDT: 'XRP',
  DOGEUSDT: 'Dogecoin',
  ADAUSDT: 'Cardano',
  AVAXUSDT: 'Avalanche',
  LINKUSDT: 'Chainlink',
  DOTUSDT: 'Polkadot',
}

const BTC: Selected = { symbol: 'BTCUSDT', market: 'CRYPTO', name: 'Bitcoin' }

const usd = (v: number | null | undefined, sign = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : `${sign && v > 0 ? '+' : ''}${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? s.up : s.down)

const displaySymbol = (sym: string) => (sym.endsWith('USDT') ? `${sym.slice(0, -4)}/USDT` : sym.replace(/\.JK$/, ''))

const isBinarySide = (side: string) => side === 'up' || side === 'down'

const AGENT_LABEL: Record<DeskTurn['agent'], string> = {
  radar: 'Pemburu Sinyal',
  bandar: 'Pelacak Bandar',
  risiko: 'Manajer Risiko',
  kepala: 'Kepala Desk',
}

const REASON_LABEL: Record<string, string> = {
  manual: 'ditutup manual',
  ai: 'ditutup desk AI',
  stop_loss: 'stop loss',
  take_profit: 'target tercapai',
  expired: 'jatuh tempo',
  settled: 'kedaluwarsa',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Permintaan gagal (HTTP ${res.status}).`)
  return body.data as T
}

function useNow(intervalMs: number, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

const countdown = (until: string, now: number) => {
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

/** Harga ringkas untuk daftar pasar, satu permintaan untuk semua simbol yang terlihat. */
function useQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, { price: number; changePct: number }>>({})
  const key = symbols.slice(0, 15).join(',')
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/quotes/live?symbols=${encodeURIComponent(key)}`)
        const body = await res.json()
        if (!cancelled && body?.quotes) setQuotes((prev) => ({ ...prev, ...body.quotes }))
      } catch {
        // detak berikutnya mencoba lagi
      }
    }
    void tick()
    const id = setInterval(tick, 6_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [key])
  return quotes
}

/** Setup binary teruji dari pemindai server (tanpa AI), tiap 30 detik. */
function useSetups(enabled: boolean) {
  const [setups, setSetups] = useState<PlaybookSetup[]>([])
  const [scannedAt, setScannedAt] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const data = await api<{ setups: PlaybookSetup[]; scannedAt: number }>('/api/v1/simulator/scan')
        if (!cancelled) {
          setSetups(data.setups)
          setScannedAt(data.scannedAt)
        }
      } catch {
        // pemindaian berikutnya mencoba lagi
      }
    }
    void tick()
    const id = setInterval(tick, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled])
  return { setups: enabled ? setups : [], scannedAt }
}

interface Toast {
  id: number
  kind: 'win' | 'loss' | 'info'
  text: string
}

// ---------------------------------------------------------------------------

export function SimulatorClient({ instruments }: { instruments: SimInstrumentOption[] }) {
  const [mode, setMode] = useState<SimMode>('binary')
  const [state, setState] = useState<SimState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deskNote, setDeskNote] = useState<string | null>(null)
  const [autopilot, setAutopilot] = useState(false)
  const [selected, setSelected] = useState<Selected>(BTC)
  const [interval, setIntervalId] = useState<ChartInterval>(DEFAULT_INTERVAL.binary)
  const [livePrice, setLivePrice] = useState<{ symbol: string; price: number } | null>(null)
  const [tab, setTab] = useState<'open' | 'history' | 'desk' | 'radar' | 'stats'>('open')
  const [toasts, setToasts] = useState<Toast[]>([])
  const modeRef = useRef<SimMode>('binary')
  const seenClosed = useRef<Set<number> | null>(null)

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6_000)
  }, [])

  /** Terima keadaan baru, dan umumkan trade yang baru selesai seperti platform binary. */
  const accept = useCallback(
    (next: SimState) => {
      const seen = seenClosed.current
      if (seen) {
        for (const c of next.closed) {
          if (seen.has(c.id)) continue
          const label = `${displaySymbol(c.symbol)} ${c.side.toUpperCase()}`
          if (c.pnlUsd > 0) toast('win', `✓ ${label} untung ${usd(c.pnlUsd, true)}`)
          else if (c.pnlUsd < 0) toast('loss', `✗ ${label} rugi ${usd(c.pnlUsd)}`)
          else toast('info', `${label} impas — stake kembali`)
        }
      }
      seenClosed.current = new Set(next.closed.map((c) => c.id))
      setState(next)
    },
    [toast],
  )

  const load = useCallback(
    async (m: SimMode) => {
      try {
        const data = await api<SimState>(`/api/v1/simulator?mode=${m}`)
        if (modeRef.current === m) {
          accept(data)
          setError(null)
        }
      } catch (err) {
        if (modeRef.current === m) setError(err instanceof Error ? err.message : String(err))
      }
    },
    [accept],
  )

  useEffect(() => {
    const first = setTimeout(() => void load(mode), 0)
    const every = mode === 'binary' ? 8_000 : mode === 'harian' ? 20_000 : 60_000
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load(mode)
    }, every)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [mode, load])

  const changeMode = (m: SimMode) => {
    if (m === mode) return
    modeRef.current = m
    seenClosed.current = null
    setMode(m)
    setState(null)
    setAutopilot(false)
    setDeskNote(null)
    setError(null)
    setIntervalId(DEFAULT_INTERVAL[m])
    if (m === 'binary' && !BINARY_SYMBOLS.includes(selected.symbol as (typeof BINARY_SYMBOLS)[number])) setSelected(BTC)
  }

  const post = useCallback(
    async (label: string, body: unknown) => {
      setBusy(label)
      setError(null)
      try {
        accept(await api<SimState>('/api/v1/simulator', { method: 'POST', body: JSON.stringify(body) }))
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setBusy(null)
      }
    },
    [accept],
  )

  const runDesk = useCallback(async () => {
    setBusy('desk')
    setError(null)
    setDeskNote(null)
    try {
      const data = await api<{ result: { decision: DeskDecision | null; executed: ExecutedAction[] }; state: SimState }>(
        '/api/v1/simulator/desk',
        { method: 'POST', body: JSON.stringify({ mode: modeRef.current }) },
      )
      accept(data.state)
      const opened = data.result.executed.filter((e) => e.ok)
      const note = data.result.decision
        ? opened.length > 0
          ? `Desk AI mengeksekusi ${opened.length} trade: ${opened.map((e) => e.message).join(' ')}`
          : `Desk AI memutuskan tidak trade. ${data.result.decision.summary}`
        : 'Desk tidak bersidang — tidak ada instrumen dengan data cukup atau pasar tutup.'
      setDeskNote(note)
      const waiting = modeRef.current === 'binary' && data.result.decision?.summary.startsWith('Tidak ada setup teruji')
      toast(
        'info',
        opened.length > 0
          ? `🤖 Desk AI membuka ${opened.length} posisi`
          : waiting
            ? '🤖 Belum ada sinyal teruji — AI menunggu RSI ekstrem (<25 / >75)'
            : '🤖 Desk AI: tidak ada trade',
      )
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAutopilot(false)
      return false
    } finally {
      setBusy(null)
    }
  }, [accept, toast])

  const autopilotEvery = MODE_INFO[mode].autopilotSeconds
  const { setups, scannedAt } = useSetups(mode === 'binary')
  const heldSymbols = useMemo(() => new Set((state?.open ?? []).map((p) => p.symbol)), [state])
  const freshSetups = useMemo(() => setups.filter((x) => !heldSymbols.has(x.symbol)), [setups, heldSymbols])
  const lastDeskAt = useRef(0)

  // Autopilot investasi: sidang berkala.
  useEffect(() => {
    if (!autopilot || !autopilotEvery || mode === 'binary') return
    const first = setTimeout(() => void runDesk(), 0)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void runDesk()
    }, autopilotEvery * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [autopilot, autopilotEvery, mode, runDesk])

  // Autopilot binary: desk dipanggil hanya saat pemindai menemukan setup teruji
  // yang belum dipegang — tanpa setup, sidang cuma membakar kuota untuk lempar koin.
  useEffect(() => {
    if (!autopilot || mode !== 'binary' || busy !== null || freshSetups.length === 0) return
    if (Date.now() - lastDeskAt.current < 60_000) return
    lastDeskAt.current = Date.now()
    const t = setTimeout(() => void runDesk(), 0)
    return () => clearTimeout(t)
  }, [autopilot, mode, busy, freshSetups, scannedAt, runDesk])

  const reset = () => {
    if (!window.confirm(`Reset dompet ${MODE_INFO[mode].label} ke $${STARTING_BALANCE_USD.toLocaleString('en-US')}? Semua riwayat di mode ini dihapus.`)) return
    seenClosed.current = null
    void post('reset', { action: 'reset', mode })
  }

  // --- garis posisi di grafik --------------------------------------------
  const openHere = useMemo(() => (state?.open ?? []).filter((p) => p.symbol === selected.symbol), [state, selected.symbol])
  const hasBinaryHere = openHere.some((p) => isBinarySide(p.side))
  const now = useNow(1_000, hasBinaryHere)
  const lines = useMemo<ChartLine[]>(() => {
    const out: ChartLine[] = []
    for (const p of openHere) {
      const upish = p.side === 'up' || p.side === 'long'
      const color = upish ? '#4f9d8e' : '#b3564e'
      if (isBinarySide(p.side)) {
        out.push({
          price: p.entryPrice,
          color,
          title: `${p.side === 'up' ? '▲' : '▼'} ${usd(p.stakeUsd)}${p.expiresAt ? ` · ${countdown(p.expiresAt, now)}` : ''}`,
        })
      } else {
        out.push({ price: p.entryPrice, color, title: `${p.side.toUpperCase()} ${usd(p.stakeUsd)}` })
        if (p.stopLoss) out.push({ price: p.stopLoss, color: '#b3564e', title: 'SL', dashed: true })
        if (p.takeProfit) out.push({ price: p.takeProfit, color: '#4f9d8e', title: 'TP', dashed: true })
      }
    }
    return out
  }, [openHere, now])

  const onPrice = useCallback((price: number) => setLivePrice({ symbol: selected.symbol, price }), [selected.symbol])
  const current = livePrice?.symbol === selected.symbol ? livePrice.price : null

  const lastRun = state?.deskRuns[0]
  const lastSignals = (Array.isArray(lastRun?.signals) ? lastRun.signals : []) as SignalReport[]
  const a = state?.account
  const st = state?.stats

  return (
    <div className={s.root}>
      {/* Bar akun */}
      <div className={s.topbar}>
        <div className={s.modes} role="tablist" aria-label="Mode simulator">
          {SIM_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`${s.mode} ${mode === m ? s.modeActive : ''}`}
              onClick={() => changeMode(m)}
            >
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>
        <div className={s.account}>
          <div className={s.pill}>
            <span className={s.pillLabel}>Ekuitas</span>
            <span className={s.pillValue}>{usd(a?.equity)}</span>
          </div>
          <div className={s.pill}>
            <span className={s.pillLabel}>Kas</span>
            <span className={s.pillValue}>{usd(a?.cash)}</span>
          </div>
          <div className={s.pill}>
            <span className={s.pillLabel}>P/L</span>
            <span className={`${s.pillValue} ${tone(st?.returnPct)}`}>{pct(st?.returnPct)}</span>
          </div>
          <div className={s.pill}>
            <span className={s.pillLabel}>Win</span>
            <span className={s.pillValue}>{st?.winRate != null ? `${st.winRate.toFixed(0)}%` : '—'}</span>
          </div>
          <div className={s.topActions}>
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void runDesk()}>
              {busy === 'desk' ? 'Desk bersidang…' : '🤖 Desk AI'}
            </button>
            <button type="button" className="btn" disabled={busy !== null || !state} onClick={reset} title="Reset dompet ke $1.000">
              ⟲ Reset
            </button>
          </div>
        </div>
      </div>

      {error && <div className={s.error}>{error}</div>}
      {deskNote && <div className={s.notice}>{deskNote}</div>}

      <div className={s.workspace}>
        <MarketList mode={mode} instruments={instruments} selected={selected} onSelect={setSelected} />

        <section className={s.panel}>
          <ChartHeader selected={selected} price={current} interval={interval} onInterval={setIntervalId} />
          <TradeChart symbol={selected.symbol} interval={interval} lines={lines} onPrice={onPrice} />
        </section>

        <section className={s.panel}>
          <div className={s.panelHead}>
            <span>{mode === 'binary' ? 'Binary Option' : 'Order'}</span>
            <span>{displaySymbol(selected.symbol)}</span>
          </div>
          {mode === 'binary' ? (
            <BinaryTicket
              busy={busy}
              cash={a?.cash ?? 0}
              price={current}
              setups={freshSetups}
              record={playbookRecord(state?.closed ?? [])}
              selectedSymbol={selected.symbol}
              onPick={(sym) => setSelected({ symbol: sym, market: 'CRYPTO', name: CRYPTO_NAMES[sym] ?? sym })}
              onTrade={(t) => post('open', { action: 'open', trade: { kind: 'binary', symbol: selected.symbol, ...t } })}
            />
          ) : (
            <InvestTicket
              key={mode}
              mode={mode}
              busy={busy}
              cash={a?.cash ?? 0}
              price={current}
              selected={selected}
              onTrade={(t) =>
                post('open', { action: 'open', trade: { kind: 'invest', mode, market: selected.market, symbol: selected.symbol, ...t } })
              }
            />
          )}
        </section>
      </div>

      {/* Panel bawah */}
      <section className={s.panel}>
        <div className={s.bottomTabs} role="tablist">
          {(
            [
              ['open', `Posisi terbuka (${state?.open.length ?? 0})`],
              ['history', `Riwayat (${st?.trades ?? 0})`],
              ['desk', 'Desk AI'],
              ['radar', 'Radar & Bandar'],
              ['stats', 'Statistik'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`${s.bottomTab} ${tab === id ? s.bottomTabActive : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'open' && (
          <OpenPositions
            state={state}
            mode={mode}
            busy={busy}
            onSelect={(p) => setSelected({ symbol: p.symbol, market: p.market, name: p.name })}
            onClose={(id) => post(`close-${id}`, { action: 'close', mode, positionId: id })}
          />
        )}
        {tab === 'history' && <History state={state} />}
        {tab === 'desk' && (
          <div className={s.desk}>
            <div className={s.deskBar}>
              <span className={s.hint}>
                Empat AI dari penyedia berbeda bersidang: Pemburu Sinyal membaca radar teknikal, Pelacak Bandar mencari
                jejak akumulasi/distribusi pemain besar, Manajer Risiko memveto dan menetapkan ukuran, Kepala Desk
                memutuskan — lalu trade dieksekusi otomatis.
              </span>
              {autopilotEvery && (
                <label className={s.switch}>
                  <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} />
                  {mode === 'binary' ? 'Autopilot: entry otomatis saat setup teruji muncul' : `Autopilot tiap ${Math.round(autopilotEvery / 60)} menit`}
                </label>
              )}
            </div>
            {autopilot && (
              <div className={s.notice}>
                {mode === 'binary'
                  ? `Autopilot aktif selama tab ini terbuka. Pasar dipindai tiap 30 detik tanpa AI; desk hanya bersidang (1 jatah AI) saat setup teruji muncul${freshSetups.length ? ` — sekarang: ${freshSetups.map((x) => displaySymbol(x.symbol)).join(', ')}` : ' — sekarang belum ada'}.`
                  : 'Autopilot aktif selama tab ini terbuka. Tiap sidang memakai satu jatah AI harian.'}
              </div>
            )}
            {lastRun ? <DeskRunView run={lastRun} /> : <div className={s.empty}>Belum ada sidang desk di mode ini. Tekan 🤖 Desk AI.</div>}
          </div>
        )}
        {tab === 'radar' &&
          (lastSignals.length > 0 ? (
            <SignalTable
              signals={lastSignals}
              onSelect={(sig) => setSelected({ symbol: sig.symbol, market: sig.market, name: sig.name })}
            />
          ) : (
            <div className={s.empty}>Radar terisi setelah desk AI bersidang.</div>
          ))}
        {tab === 'stats' && <Stats state={state} />}
      </section>

      <p className={s.disclaimer}>
        {MODE_INFO[mode].description} Simulasi dengan uang virtual untuk belajar dan menguji strategi — bukan saran
        investasi. Posisi investasi memeriksa stop loss/target saat data diperbarui, jadi harga keluar bisa sedikit
        melewati levelnya.
      </p>

      <div className={s.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${s.toast} ${t.kind === 'win' ? s.toastWin : t.kind === 'loss' ? s.toastLoss : s.toastInfo}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const POPULAR = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'AAPL', 'NVDA', 'TSLA', 'GC=F']

function MarketList({
  mode,
  instruments,
  selected,
  onSelect,
}: {
  mode: SimMode
  instruments: SimInstrumentOption[]
  selected: Selected
  onSelect: (s: Selected) => void
}) {
  const [query, setQuery] = useState('')
  const rows = useMemo<Selected[]>(() => {
    if (mode === 'binary') return BINARY_SYMBOLS.map((sym) => ({ symbol: sym, market: 'CRYPTO', name: CRYPTO_NAMES[sym] ?? sym }))
    const q = query.trim().toLowerCase()
    const list = q
      ? instruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      : [
          ...POPULAR.map((sym) => instruments.find((i) => i.symbol === sym)).filter((i): i is SimInstrumentOption => Boolean(i)),
          ...instruments.filter((i) => !POPULAR.includes(i.symbol)),
        ]
    return list.slice(0, 40).map((i) => ({ symbol: i.symbol, market: i.market, name: i.name }))
  }, [mode, instruments, query])

  const quotes = useQuotes(rows.slice(0, 15).map((r) => r.symbol))

  return (
    <section className={`${s.panel} ${s.markets}`}>
      <div className={s.panelHead}>
        <span>Pasar</span>
        <span>{mode === 'binary' ? 'Kripto 24/7' : `${instruments.length} instrumen`}</span>
      </div>
      {mode !== 'binary' && (
        <input className={s.search} placeholder="Cari BBCA, AAPL, BTC, emas…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className={s.marketList}>
        {rows.map((r) => {
          const q = quotes[r.symbol]
          return (
            <button
              key={`${r.market}:${r.symbol}`}
              type="button"
              className={`${s.marketRow} ${r.symbol === selected.symbol ? s.marketRowActive : ''}`}
              onClick={() => onSelect(r)}
            >
              <span className={s.marketSym}>{displaySymbol(r.symbol)}</span>
              <span className={s.marketPrice}>{q ? formatPrice(q.price) : ''}</span>
              <span className={s.marketName}>{r.name}</span>
              <span className={`${s.marketChg} ${tone(q?.changePct)}`}>{q ? pct(q.changePct) : ''}</span>
            </button>
          )
        })}
        {rows.length === 0 && <div className={s.empty}>Tidak ada instrumen yang cocok.</div>}
      </div>
    </section>
  )
}

function ChartHeader({
  selected,
  price,
  interval,
  onInterval,
}: {
  selected: Selected
  price: number | null
  interval: ChartInterval
  onInterval: (i: ChartInterval) => void
}) {
  const quotes = useQuotes([selected.symbol])
  const q = quotes[selected.symbol]
  const shown = price ?? q?.price ?? null
  return (
    <div className={s.chartHead}>
      <div className={s.chartSymbol}>
        <strong>{displaySymbol(selected.symbol)}</strong>
        <span className={s.subtle}>
          {selected.name} · {selected.market}
        </span>
      </div>
      <span className={`${s.chartPrice} ${tone(q?.changePct)}`}>{formatPrice(shown)}</span>
      <div className={s.chartStats}>
        <div className={s.chartStat}>
          <span className={s.subtle}>Perubahan 24j</span>
          <b className={tone(q?.changePct)}>{q ? pct(q.changePct) : '—'}</b>
        </div>
      </div>
      <div className={s.intervals}>
        {CHART_INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            className={`${s.interval} ${i === interval ? s.intervalActive : ''}`}
            onClick={() => onInterval(i)}
          >
            {i === '1d' ? '1D' : i === '1w' ? '1W' : i}
          </button>
        ))}
      </div>
    </div>
  )
}

function AmountInput({ value, onChange, step }: { value: string; onChange: (v: string) => void; step: number }) {
  const n = Number(value) || 0
  return (
    <div className={s.amount}>
      <button type="button" aria-label="Kurangi" onClick={() => onChange(String(Math.max(1, +(n - step).toFixed(2))))}>
        −
      </button>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Jumlah USD" />
      <button type="button" aria-label="Tambah" onClick={() => onChange(String(+(n + step).toFixed(2)))}>
        +
      </button>
    </div>
  )
}

function BinaryTicket({
  busy,
  cash,
  price,
  setups,
  record,
  selectedSymbol,
  onPick,
  onTrade,
}: {
  busy: string | null
  cash: number
  price: number | null
  setups: PlaybookSetup[]
  record: ReturnType<typeof playbookRecord>
  selectedSymbol: string
  onPick: (symbol: string) => void
  onTrade: (t: { direction: 'up' | 'down'; stake: number; expirySeconds: number }) => Promise<boolean>
}) {
  const [stake, setStake] = useState('10')
  const [expiry, setExpiry] = useState<number>(PLAYBOOK.expirySeconds)
  const stakeNum = Number(stake)
  const valid = stakeNum >= 1 && stakeNum <= cash
  const here = setups.find((x) => x.symbol === selectedSymbol)

  return (
    <div className={s.ticket}>
      <div className={s.setupBox}>
        <div className={s.fieldLabel}>
          <span>Sinyal teruji</span>
          <span>
            uji {PLAYBOOK.backtestWinRate}% · impas {PLAYBOOK.breakevenWinRate}%
          </span>
        </div>
        {setups.length === 0 ? (
          <span className={s.hint}>
            Belum ada. Menunggu RSI 1m &lt; {PLAYBOOK.rsiLow} (NAIK) atau &gt; {PLAYBOOK.rsiHigh} (TURUN). Di luar itu
            arah 1–15 menit ±50% — lempar koin.
          </span>
        ) : (
          setups.map((x) => (
            <button
              key={x.symbol}
              type="button"
              className={`${s.setupRow} ${x.symbol === selectedSymbol ? s.setupRowActive : ''}`}
              onClick={() => {
                onPick(x.symbol)
                setExpiry(PLAYBOOK.expirySeconds)
              }}
            >
              <span className={s.sym}>{displaySymbol(x.symbol)}</span>
              <span className={x.direction === 'up' ? s.up : s.down}>{x.direction === 'up' ? '▲ NAIK' : '▼ TURUN'}</span>
              <span className={s.subtle}>RSI {x.rsi}</span>
            </button>
          ))
        )}
        {record.trades > 0 && (
          <span className={s.hint}>
            Rekam jejak playbook AI-mu: {record.wins}/{record.trades} menang ({record.winRate?.toFixed(0)}%)
            {record.paused ? ' — rem otomatis aktif.' : '.'}
          </span>
        )}
      </div>

      <div className={s.field}>
        <span className={s.fieldLabel}>
          <span>Waktu</span>
          <span>{expiry < 3600 ? `${expiry / 60} menit` : '1 jam'}</span>
        </span>
        <div className={s.chips}>
          {BINARY_EXPIRIES.map((sec) => (
            <button key={sec} type="button" className={`${s.chip} ${sec === expiry ? s.chipActive : ''}`} onClick={() => setExpiry(sec)}>
              {sec < 3600 ? `${sec / 60}m` : '1j'}
            </button>
          ))}
        </div>
      </div>

      <div className={s.field}>
        <span className={s.fieldLabel}>
          <span>Jumlah</span>
          <span>Kas {usd(cash)}</span>
        </span>
        <AmountInput value={stake} onChange={setStake} step={5} />
        <div className={s.chips}>
          {[5, 10, 25, 50, 100].map((v) => (
            <button key={v} type="button" className={`${s.chip} ${stakeNum === v ? s.chipActive : ''}`} onClick={() => setStake(String(v))}>
              ${v}
            </button>
          ))}
        </div>
      </div>

      <div className={s.payout}>
        <span className={s.subtle}>Pembayaran {Math.round(BINARY_PAYOUT * 100)}%</span>
        <span className={s.payoutValue}>{valid ? usd(stakeNum * BINARY_PAYOUT, true) : '—'}</span>
        <span className={s.subtle}>Harga masuk ≈ {formatPrice(price)}</span>
      </div>

      <div className={s.binaryButtons}>
        <button
          type="button"
          className={s.bigUp}
          disabled={busy !== null || !valid}
          onClick={() => void onTrade({ direction: 'up', stake: stakeNum, expirySeconds: expiry })}
        >
          ▲ NAIK{here?.direction === 'up' ? ' · sesuai sinyal' : ''}
        </button>
        <button
          type="button"
          className={s.bigDown}
          disabled={busy !== null || !valid}
          onClick={() => void onTrade({ direction: 'down', stake: stakeNum, expirySeconds: expiry })}
        >
          ▼ TURUN{here?.direction === 'down' ? ' · sesuai sinyal' : ''}
        </button>
      </div>
      <span className={s.hint}>
        {valid
          ? `Benar: dapat ${usd(stakeNum * (1 + BINARY_PAYOUT))}. Salah: kehilangan ${usd(stakeNum)}. Harga penutupan = transaksi Binance pada detik kedaluwarsa.`
          : `Jumlah harus antara $1 dan ${usd(cash)}.`}
      </span>
    </div>
  )
}

const SLTP_DEFAULTS: Record<Exclude<SimMode, 'binary'>, [string, string]> = {
  harian: ['1.5', '3'],
  bulanan: ['8', '16'],
  tahunan: ['20', '50'],
}

function InvestTicket({
  mode,
  busy,
  cash,
  price,
  selected,
  onTrade,
}: {
  mode: Exclude<SimMode, 'binary'>
  busy: string | null
  cash: number
  price: number | null
  selected: Selected
  onTrade: (t: { side: 'long' | 'short'; stake: number; stopLossPct: number | null; takeProfitPct: number | null }) => Promise<boolean>
}) {
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [stake, setStake] = useState('100')
  const [sl, setSl] = useState(SLTP_DEFAULTS[mode][0])
  const [tp, setTp] = useState(SLTP_DEFAULTS[mode][1])
  const stakeNum = Number(stake)
  const valid = stakeNum >= 1 && stakeNum <= cash
  const sign = side === 'long' ? 1 : -1
  const slNum = Number(sl)
  const tpNum = Number(tp)
  const slPrice = price && slNum >= 0.2 ? price * (1 - (sign * slNum) / 100) : null
  const tpPrice = price && tpNum >= 0.2 ? price * (1 + (sign * tpNum) / 100) : null

  return (
    <div className={s.ticket}>
      <div className={s.sideTabs}>
        <button type="button" className={`${s.sideTab} ${side === 'long' ? s.sideLong : ''}`} onClick={() => setSide('long')}>
          LONG ▲
        </button>
        <button type="button" className={`${s.sideTab} ${side === 'short' ? s.sideShort : ''}`} onClick={() => setSide('short')}>
          SHORT ▼
        </button>
      </div>

      <div className={s.field}>
        <span className={s.fieldLabel}>
          <span>Jumlah (USD)</span>
          <span>Kas {usd(cash)}</span>
        </span>
        <AmountInput value={stake} onChange={setStake} step={10} />
        <div className={s.chips}>
          {[10, 25, 50, 100].map((p) => (
            <button key={p} type="button" className={s.chip} onClick={() => setStake(String(Math.floor((cash * p) / 100)))}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div className={s.inputRow}>
        <label className={s.field}>
          <span className={s.fieldLabel}>Stop loss %</span>
          <input className={s.input} inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Target %</span>
          <input className={s.input} inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} />
        </label>
      </div>

      <div className={s.summary}>
        <div>
          <span>Harga masuk</span>
          <b>{formatPrice(price)}</b>
        </div>
        <div>
          <span>Stop loss</span>
          <b className={s.down}>{formatPrice(slPrice)}</b>
        </div>
        <div>
          <span>Target</span>
          <b className={s.up}>{formatPrice(tpPrice)}</b>
        </div>
        <div>
          <span>Risiko / potensi</span>
          <b>
            {valid && slNum >= 0.2 ? usd(-(stakeNum * slNum) / 100) : '—'} / {valid && tpNum >= 0.2 ? usd((stakeNum * tpNum) / 100, true) : '—'}
          </b>
        </div>
        <div>
          <span>Tutup otomatis</span>
          <b>{MODE_INFO[mode].horizonDays} hari</b>
        </div>
      </div>

      <button
        type="button"
        className={side === 'long' ? s.bigUp : s.bigDown}
        disabled={busy !== null || !valid}
        onClick={() =>
          void onTrade({
            side,
            stake: stakeNum,
            stopLossPct: slNum >= 0.2 ? slNum : null,
            takeProfitPct: tpNum >= 0.2 ? tpNum : null,
          })
        }
      >
        {busy === 'open' ? 'Membuka…' : `${side === 'long' ? 'LONG' : 'SHORT'} ${displaySymbol(selected.symbol)}`}
      </button>
      {!valid && <span className={s.hint}>Jumlah harus antara $1 dan {usd(cash)}.</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function OpenPositions({
  state,
  mode,
  busy,
  onSelect,
  onClose,
}: {
  state: SimState | null
  mode: SimMode
  busy: string | null
  onSelect: (p: MarkedPosition) => void
  onClose: (id: number) => void
}) {
  const open = state?.open ?? []
  const now = useNow(1_000, mode === 'binary' && open.length > 0)
  if (open.length === 0) return <div className={s.empty}>{state ? 'Tidak ada posisi terbuka.' : 'Memuat…'}</div>
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Instrumen</th>
            <th>Arah</th>
            <th>Jumlah</th>
            <th>Masuk</th>
            <th>Sekarang</th>
            <th>P/L</th>
            <th>{mode === 'binary' ? 'Sisa waktu' : 'SL / TP'}</th>
            <th>Oleh</th>
            {mode !== 'binary' && <th />}
          </tr>
        </thead>
        <tbody>
          {open.map((p) => (
            <tr key={p.id} className={s.clickable} onClick={() => onSelect(p)}>
              <td>
                <span className={s.sym}>{displaySymbol(p.symbol)}</span> <span className={s.subtle}>{p.name}</span>
              </td>
              <td className={p.side === 'long' || p.side === 'up' ? s.up : s.down}>
                {p.side === 'up' ? '▲ NAIK' : p.side === 'down' ? '▼ TURUN' : p.side.toUpperCase()}
              </td>
              <td>{usd(p.stakeUsd)}</td>
              <td>{formatPrice(p.entryPrice)}</td>
              <td>{formatPrice(p.markPrice)}</td>
              <td className={tone(p.pnlUsd)}>
                {usd(p.pnlUsd, true)} <span className={s.subtle}>{pct(p.pnlPct)}</span>
              </td>
              <td>
                {mode === 'binary' && p.expiresAt ? (
                  Date.parse(p.expiresAt) > now ? (
                    countdown(p.expiresAt, now)
                  ) : (
                    <span className={s.subtle}>menyelesaikan…</span>
                  )
                ) : (
                  `${formatPrice(p.stopLoss)} / ${formatPrice(p.takeProfit)}`
                )}
              </td>
              <td>
                <span className={`${s.badge} ${p.openedBy === 'ai' ? s.badgeAi : ''}`} title={p.note ?? undefined}>
                  {p.openedBy === 'ai' ? 'AI' : 'manual'}
                </span>
              </td>
              {mode !== 'binary' && (
                <td>
                  <button
                    type="button"
                    className={s.closeBtn}
                    disabled={busy !== null}
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose(p.id)
                    }}
                  >
                    Tutup
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function History({ state }: { state: SimState | null }) {
  const closed = state?.closed ?? []
  if (closed.length === 0) return <div className={s.empty}>Belum ada trade selesai.</div>
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Ditutup</th>
            <th>Instrumen</th>
            <th>Arah</th>
            <th>Jumlah</th>
            <th>Masuk → Keluar</th>
            <th>P/L</th>
            <th>Sebab</th>
            <th>Oleh</th>
          </tr>
        </thead>
        <tbody>
          {closed.map((c) => (
            <tr key={c.id}>
              <td className={s.subtle}>{c.closedAt ? new Date(c.closedAt).toLocaleString('id-ID') : '—'}</td>
              <td className={s.sym}>{displaySymbol(c.symbol)}</td>
              <td className={c.side === 'long' || c.side === 'up' ? s.up : s.down}>{c.side.toUpperCase()}</td>
              <td>{usd(c.stakeUsd)}</td>
              <td>
                {formatPrice(c.entryPrice)} → {formatPrice(c.exitPrice)}
              </td>
              <td className={tone(c.pnlUsd)}>{usd(c.pnlUsd, true)}</td>
              <td>{REASON_LABEL[c.closeReason ?? ''] ?? c.closeReason ?? '—'}</td>
              <td>
                <span className={`${s.badge} ${c.openedBy === 'ai' ? s.badgeAi : ''}`} title={c.note ?? undefined}>
                  {c.openedBy === 'ai' ? 'AI' : 'manual'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stats({ state }: { state: SimState | null }) {
  const curve = useMemo(() => {
    if (!state) return []
    let eq = state.account.startingBalance
    return [eq, ...[...state.closed].reverse().map((c) => (eq += c.pnlUsd))]
  }, [state])
  if (!state) return <div className={s.empty}>Memuat…</div>
  const st = state.stats
  const min = Math.min(...curve)
  const max = Math.max(...curve)
  const span = max - min || 1
  const path = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, curve.length - 1)) * 100).toFixed(2)},${(38 - ((p - min) / span) * 34 - 2).toFixed(2)}`)
    .join(' ')
  return (
    <>
      <div className={s.statsGrid}>
        <div className={s.statCell}>
          <span className={s.subtle}>Modal awal</span>
          <b>{usd(state.account.startingBalance)}</b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Ekuitas</span>
          <b>{usd(state.account.equity)}</b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Laba terealisasi</span>
          <b className={tone(st.realizedPnl)}>{usd(st.realizedPnl, true)}</b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Menang / kalah</span>
          <b>
            {st.wins} / {st.losses}
          </b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Trade terbaik</span>
          <b className={s.up}>{usd(st.bestTrade, true)}</b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Trade terburuk</span>
          <b className={s.down}>{usd(st.worstTrade, true)}</b>
        </div>
        <div className={s.statCell}>
          <span className={s.subtle}>Direset</span>
          <b>{state.account.resetCount}×</b>
        </div>
      </div>
      {curve.length > 2 && (
        <div style={{ padding: '12px 16px' }}>
          <span className={s.subtle}>Kurva modal terealisasi</span>
          <svg className={s.curve} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Kurva modal">
            <path
              d={path}
              fill="none"
              stroke={curve[curve.length - 1] >= curve[0] ? 'var(--measured)' : 'var(--halted)'}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}
    </>
  )
}

function DeskRunView({ run }: { run: SimState['deskRuns'][number] }) {
  const turns = (Array.isArray(run.turns) ? run.turns : []) as DeskTurn[]
  const decision = run.decision as DeskDecision | null
  const executed = (Array.isArray(run.executed) ? run.executed : []) as ExecutedAction[]

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <span className={s.subtle}>
        Sidang #{run.id} · {new Date(run.createdAt).toLocaleString('id-ID')} · {run.status === 'done' ? 'selesai' : 'gagal'}
      </span>
      {run.error && <div className={s.error}>{run.error}</div>}
      {decision && (
        <div className={s.decision}>
          <strong>Putusan ({decision.confidence}% yakin):</strong> {decision.summary || 'Tanpa ringkasan.'}
          {decision.actions.length === 0 && ' Tidak ada trade.'}
        </div>
      )}
      {executed.length > 0 && (
        <ul className={s.execList}>
          {executed.map((e, i) => (
            <li key={i} className={e.ok ? '' : s.down}>
              {e.ok ? '✓' : '✗'} {e.message}
              {e.action.reason ? ` — ${e.action.reason}` : ''}
            </li>
          ))}
        </ul>
      )}
      {turns.length > 0 && (
        <div className={s.agents}>
          {turns.map((t, i) => (
            <article key={i} className={s.agent}>
              <div className={s.agentHead}>
                <span className={s.agentName}>{AGENT_LABEL[t.agent] ?? t.title}</span>
                <span className={s.subtle}>
                  {t.providerId ?? ''}
                  {t.latencyMs ? ` · ${(t.latencyMs / 1000).toFixed(1)}s` : ''}
                </span>
              </div>
              <p className={s.agentText}>{t.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function SignalTable({ signals, onSelect }: { signals: SignalReport[]; onSelect: (s: SignalReport) => void }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Instrumen</th>
            <th>TF</th>
            <th>Harga</th>
            <th>Tren</th>
            <th>RSI</th>
            <th>Skor radar</th>
            <th>Bandar</th>
            <th>Jejak</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((sig) => (
            <tr key={`${sig.market}:${sig.symbol}`} className={s.clickable} onClick={() => onSelect(sig)}>
              <td className={s.sym}>{displaySymbol(sig.symbol)}</td>
              <td>{sig.timeframe}</td>
              <td>{formatPrice(sig.price)}</td>
              <td>{sig.trend}</td>
              <td>{sig.rsi14 ?? '—'}</td>
              <td className={tone(sig.score)}>{sig.score}</td>
              <td className={tone(sig.bandar.score)}>
                {sig.bandar.label} ({sig.bandar.score})
              </td>
              <td style={{ whiteSpace: 'normal', minWidth: 280 }} className={s.subtle}>
                {sig.bandar.evidence.join(' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
