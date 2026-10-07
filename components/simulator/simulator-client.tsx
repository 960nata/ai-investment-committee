'use client'

/**
 * Simulator trading: empat dompet terpisah (binary, harian, bulanan, tahunan),
 * trading manual, dan desk AI yang bisa dijalankan sekali atau dibiarkan
 * berjalan otomatis selama tab terbuka.
 *
 * Semua angka uang datang dari server. Komponen ini hanya mengirim niat —
 * simbol, arah, stake — dan menggambar ulang dari keadaan yang dikembalikan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BINARY_EXPIRIES,
  BINARY_PAYOUT,
  BINARY_SYMBOLS,
  MODE_INFO,
  SIM_MODES,
  STARTING_BALANCE_USD,
  type SimMode,
} from '@/lib/simulator/config'
import type { SimState } from '@/lib/simulator/engine'
import type { DeskDecision, DeskTurn, ExecutedAction } from '@/lib/simulator/desk'
import type { SignalReport } from '@/lib/simulator/signals'
import s from './simulator.module.css'

export interface SimInstrumentOption {
  symbol: string
  name: string
  market: string
  assetClass: string
}

const usd = (v: number | null | undefined, sign = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : `${sign && v > 0 ? '+' : ''}${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

const price = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const digits = v >= 1000 ? 2 : v >= 1 ? 4 : 6
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? s.up : s.down)

const AGENT_LABEL: Record<DeskTurn['agent'], string> = {
  radar: 'Pemburu Sinyal',
  bandar: 'Pelacak Bandar',
  risiko: 'Manajer Risiko',
  kepala: 'Kepala Desk',
}

const REASON_LABEL: Record<string, string> = {
  manual: 'manual',
  ai: 'desk AI',
  stop_loss: 'stop loss',
  take_profit: 'target',
  expired: 'jatuh tempo',
  settled: 'kedaluwarsa',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Permintaan gagal (HTTP ${res.status}).`)
  return body.data as T
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <svg className={s.spark} aria-hidden="true" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * 100).toFixed(2)},${(36 - ((p - min) / span) * 32 - 2).toFixed(2)}`)
    .join(' ')
  const rising = points[points.length - 1] >= points[0]
  return (
    <svg className={s.spark} viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Grafik harga terbaru">
      <path d={d} fill="none" stroke={rising ? 'var(--measured)' : 'var(--halted)'} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ---------------------------------------------------------------------------

export function SimulatorClient({ instruments }: { instruments: SimInstrumentOption[] }) {
  const [mode, setMode] = useState<SimMode>('binary')
  const [state, setState] = useState<SimState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deskNote, setDeskNote] = useState<string | null>(null)
  const [autopilot, setAutopilot] = useState(false)
  const modeRef = useRef<SimMode>('binary')

  const load = useCallback(async (m: SimMode) => {
    try {
      const data = await api<SimState>(`/api/v1/simulator?mode=${m}`)
      if (modeRef.current === m) {
        setState(data)
        setError(null)
      }
    } catch (err) {
      if (modeRef.current === m) setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void load(mode), 0)
    return () => clearTimeout(first)
  }, [mode, load])

  const changeMode = (m: SimMode) => {
    if (m === mode) return
    modeRef.current = m
    setMode(m)
    setState(null)
    setAutopilot(false)
    setDeskNote(null)
    setError(null)
  }

  // Segarkan keadaan: binary dan harian lebih sering karena harganya bergerak per menit.
  useEffect(() => {
    const every = mode === 'binary' ? 10_000 : mode === 'harian' ? 20_000 : 60_000
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load(mode)
    }, every)
    return () => clearInterval(id)
  }, [mode, load])

  const post = useCallback(
    async (label: string, body: unknown) => {
      setBusy(label)
      setError(null)
      try {
        setState(await api<SimState>('/api/v1/simulator', { method: 'POST', body: JSON.stringify(body) }))
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setBusy(null)
      }
    },
    [],
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
      setState(data.state)
      const opened = data.result.executed.filter((e) => e.ok).length
      setDeskNote(
        data.result.decision
          ? `Desk selesai: ${data.result.decision.actions.length} aksi diputuskan, ${opened} tereksekusi.`
          : 'Desk tidak bersidang — tidak ada instrumen dengan data cukup atau pasar tutup.',
      )
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAutopilot(false)
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  // Autopilot: desk berjalan berkala selama tab ini terbuka dan terlihat.
  const autopilotEvery = MODE_INFO[mode].autopilotSeconds
  useEffect(() => {
    if (!autopilot || !autopilotEvery) return
    const first = setTimeout(() => void runDesk(), 0)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void runDesk()
    }, autopilotEvery * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [autopilot, autopilotEvery, runDesk])

  const reset = () => {
    if (!window.confirm(`Reset dompet ${MODE_INFO[mode].label} ke $${STARTING_BALANCE_USD.toLocaleString('en-US')}? Semua riwayat di mode ini dihapus.`)) return
    void post('reset', { action: 'reset', mode })
  }

  const info = MODE_INFO[mode]
  const lastRun = state?.deskRuns[0]

  return (
    <div className={s.root}>
      <div className={s.tabs} role="tablist" aria-label="Mode simulator">
        {SIM_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`${s.tab} ${mode === m ? s.tabActive : ''}`}
            onClick={() => changeMode(m)}
          >
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <p className={s.modeNote}>{info.description} Tiap mode punya dompet $1.000 sendiri.</p>

      {error && <div className={s.error}>{error}</div>}

      <AccountStats state={state} onReset={reset} busy={busy} />

      <div className={s.grid}>
        {mode === 'binary' ? (
          <BinaryTicket
            busy={busy}
            cash={state?.account.cash ?? 0}
            onTrade={(t) => post('open', { action: 'open', trade: { kind: 'binary', ...t } })}
          />
        ) : (
          <InvestTicket
            key={mode}
            mode={mode}
            instruments={instruments}
            busy={busy}
            cash={state?.account.cash ?? 0}
            onTrade={(t) => post('open', { action: 'open', trade: { kind: 'invest', mode, ...t } })}
          />
        )}

        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.cardTitle}>Desk AI</h2>
            <div className={s.deskControls}>
              {autopilotEvery && (
                <label className={s.switch}>
                  <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} />
                  Autopilot tiap {Math.round(autopilotEvery / 60)} menit
                </label>
              )}
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void runDesk()}>
                {busy === 'desk' ? 'Desk bersidang…' : 'Jalankan Desk AI'}
              </button>
            </div>
          </div>
          <div className={s.cardBody}>
            <p className={s.modeNote}>
              Empat AI dari penyedia berbeda bersidang: Pemburu Sinyal membaca radar teknikal, Pelacak Bandar mencari
              jejak akumulasi/distribusi pemain besar, Manajer Risiko memveto dan menetapkan ukuran, Kepala Desk
              memutuskan — lalu trade dieksekusi otomatis di dompet ini.
            </p>
            {deskNote && <div className={s.notice}>{deskNote}</div>}
            {autopilot && <div className={s.notice}>Autopilot aktif selama tab ini terbuka. Tiap sidang memakai satu jatah AI harian.</div>}
            {lastRun ? <DeskRunView run={lastRun} /> : <div className={s.empty}>Belum ada sidang desk di mode ini.</div>}
          </div>
        </section>
      </div>

      <OpenPositions
        state={state}
        mode={mode}
        busy={busy}
        onClose={(id) => post(`close-${id}`, { action: 'close', mode, positionId: id })}
        onSettled={() => void load(mode)}
      />
      <History state={state} />
      <p className={`${s.subtle}`}>
        Simulasi dengan uang virtual untuk belajar dan menguji strategi — bukan saran investasi. Posisi investasi
        memeriksa stop loss/target saat halaman diperbarui, jadi harga keluar bisa sedikit melewati levelnya.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AccountStats({ state, onReset, busy }: { state: SimState | null; onReset: () => void; busy: string | null }) {
  const a = state?.account
  const st = state?.stats
  return (
    <div>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>Ekuitas</span>
          <span className={s.statValue}>{usd(a?.equity)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Kas</span>
          <span className={s.statValue}>{usd(a?.cash)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Imbal hasil</span>
          <span className={`${s.statValue} ${tone(st?.returnPct)}`}>{pct(st?.returnPct)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Laba terealisasi</span>
          <span className={`${s.statValue} ${tone(st?.realizedPnl)}`}>{usd(st?.realizedPnl, true)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Win rate</span>
          <span className={s.statValue}>
            {st?.winRate != null ? `${st.winRate.toFixed(0)}%` : '—'}
            <span className={s.subtle}> {st ? `${st.wins}/${st.trades}` : ''}</span>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {a && <span className={s.subtle}>Reset {a.resetCount}× · sejak {new Date(a.resetAt).toLocaleString('id-ID')}</span>}
        <button type="button" className="btn btn-danger" disabled={busy !== null || !state} onClick={onReset}>
          {busy === 'reset' ? 'Mereset…' : 'Reset $1.000'}
        </button>
      </div>
    </div>
  )
}

function useLivePrice(symbol: string) {
  // Disimpan bersama simbolnya: berganti simbol langsung mengosongkan tampilan
  // tanpa harus mereset state di dalam effect.
  const [data, setData] = useState<{ symbol: string; quote: { price: number; changePct: number }; ticks: number[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/quotes/live?symbols=${encodeURIComponent(symbol)}`)
        const body = await res.json()
        const q = body?.quotes?.[symbol]
        if (!cancelled && q && Number.isFinite(q.price)) {
          setData((prev) => ({
            symbol,
            quote: { price: q.price, changePct: q.changePct },
            ticks: [...(prev?.symbol === symbol ? prev.ticks.slice(-89) : []), q.price],
          }))
        }
      } catch {
        // jaringan putus sesaat; detak berikutnya mencoba lagi
      }
    }
    void tick()
    const id = setInterval(tick, 3_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [symbol])

  return data?.symbol === symbol ? { quote: data.quote, ticks: data.ticks } : { quote: null, ticks: [] as number[] }
}

function BinaryTicket({
  busy,
  cash,
  onTrade,
}: {
  busy: string | null
  cash: number
  onTrade: (t: { symbol: string; direction: 'up' | 'down'; stake: number; expirySeconds: number }) => Promise<boolean>
}) {
  const [symbol, setSymbol] = useState<string>(BINARY_SYMBOLS[0])
  const [stake, setStake] = useState('10')
  const [expiry, setExpiry] = useState<number>(300)
  const { quote, ticks } = useLivePrice(symbol)
  const stakeNum = Number(stake)
  const valid = stakeNum >= 1 && stakeNum <= cash

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Tiket Binary</h2>
        <span className={s.subtle}>Bayaran {Math.round(BINARY_PAYOUT * 100)}%</span>
      </div>
      <div className={s.cardBody}>
        <div className={s.row}>
          <label className={s.field}>
            <span className={s.label}>Aset</span>
            <select className={s.input} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {BINARY_SYMBOLS.map((sym) => (
                <option key={sym} value={sym}>
                  {sym.replace('USDT', '')}/USDT
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Kedaluwarsa</span>
            <select className={s.input} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {BINARY_EXPIRIES.map((sec) => (
                <option key={sec} value={sec}>
                  {sec < 3600 ? `${sec / 60} menit` : '1 jam'}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Stake (USD)</span>
            <input className={s.input} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
        </div>

        <div className={s.ticker}>
          <span className={s.tickerPrice}>{quote ? price(quote.price) : '…'}</span>
          <span className={tone(quote?.changePct)}>{quote ? `${pct(quote.changePct)} 24j` : ''}</span>
        </div>
        <Sparkline points={ticks} />

        <div className={s.dirButtons}>
          <button
            type="button"
            className={s.btnUp}
            disabled={busy !== null || !valid}
            onClick={() => void onTrade({ symbol, direction: 'up', stake: stakeNum, expirySeconds: expiry })}
          >
            ▲ NAIK
          </button>
          <button
            type="button"
            className={s.btnDown}
            disabled={busy !== null || !valid}
            onClick={() => void onTrade({ symbol, direction: 'down', stake: stakeNum, expirySeconds: expiry })}
          >
            ▼ TURUN
          </button>
        </div>
        {!valid && <span className={s.subtle}>Stake harus antara $1 dan kas tersedia ({usd(cash)}).</span>}
        {valid && (
          <span className={s.subtle}>
            Menang: +{usd(stakeNum * BINARY_PAYOUT)} · Kalah: -{usd(stakeNum)}
          </span>
        )}
      </div>
    </section>
  )
}

function InvestTicket({
  mode,
  instruments,
  busy,
  cash,
  onTrade,
}: {
  mode: SimMode
  instruments: SimInstrumentOption[]
  busy: string | null
  cash: number
  onTrade: (t: {
    market: string
    symbol: string
    side: 'long' | 'short'
    stake: number
    stopLossPct: number | null
    takeProfitPct: number | null
  }) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<SimInstrumentOption | null>(instruments.find((i) => i.symbol === 'BTCUSDT') ?? instruments[0] ?? null)
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [stake, setStake] = useState('100')
  const defaults = mode === 'harian' ? ['1.5', '3'] : mode === 'bulanan' ? ['8', '16'] : ['20', '50']
  const [sl, setSl] = useState(defaults[0])
  const [tp, setTp] = useState(defaults[1])
  const { quote, ticks } = useLivePrice(picked?.symbol ?? 'BTCUSDT')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return instruments
      .filter((i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, instruments])

  const stakeNum = Number(stake)
  const valid = picked !== null && stakeNum >= 1 && stakeNum <= cash

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Tiket Investasi</h2>
        <span className={s.subtle}>Tutup otomatis {MODE_INFO[mode].horizonDays} hari</span>
      </div>
      <div className={s.cardBody}>
        <label className={s.field}>
          <span className={s.label}>Cari instrumen</span>
          <input
            className={s.input}
            placeholder="BBCA, AAPL, BTC, emas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {matches.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <tbody>
                {matches.map((m) => (
                  <tr
                    key={`${m.market}:${m.symbol}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setPicked(m)
                      setQuery('')
                    }}
                  >
                    <td className={s.sym}>{m.symbol}</td>
                    <td>{m.name}</td>
                    <td className={s.subtle}>{m.market}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {picked && (
          <div className={s.ticker}>
            <span>
              <span className={s.sym}>{picked.symbol}</span> <span className={s.subtle}>{picked.name}</span>
            </span>
            <span className={s.tickerPrice}>{quote ? price(quote.price) : '…'}</span>
          </div>
        )}
        <Sparkline points={ticks} />
        <div className={s.row}>
          <label className={s.field}>
            <span className={s.label}>Arah</span>
            <select className={s.input} value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
              <option value="long">Long (naik)</option>
              <option value="short">Short (turun)</option>
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Stake (USD)</span>
            <input className={s.input} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
          <label className={s.field}>
            <span className={s.label}>Stop loss %</span>
            <input className={s.input} inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
          </label>
          <label className={s.field}>
            <span className={s.label}>Target %</span>
            <input className={s.input} inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className={side === 'long' ? s.btnUp : s.btnDown}
          disabled={busy !== null || !valid}
          onClick={() =>
            picked &&
            void onTrade({
              market: picked.market,
              symbol: picked.symbol,
              side,
              stake: stakeNum,
              stopLossPct: Number(sl) >= 0.2 ? Number(sl) : null,
              takeProfitPct: Number(tp) >= 0.2 ? Number(tp) : null,
            })
          }
        >
          {busy === 'open' ? 'Membuka…' : `Buka ${side === 'long' ? 'LONG' : 'SHORT'}`}
        </button>
        {!valid && <span className={s.subtle}>Pilih instrumen dan stake antara $1 dan {usd(cash)}.</span>}
      </div>
    </section>
  )
}

function Countdown({ until, onDone }: { until: string; onDone: () => void }) {
  const now = useNow(1_000)
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000))
  const fired = useRef(false)
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true
      // Beri Binance beberapa detik untuk mencatat transaksi pada detik kedaluwarsa.
      setTimeout(onDone, 4_000)
    }
  }, [left, onDone])
  if (left === 0) return <span className={s.subtle}>menyelesaikan…</span>
  const m = Math.floor(left / 60)
  const sec = left % 60
  return <span>{`${m}:${String(sec).padStart(2, '0')}`}</span>
}

function OpenPositions({
  state,
  mode,
  busy,
  onClose,
  onSettled,
}: {
  state: SimState | null
  mode: SimMode
  busy: string | null
  onClose: (id: number) => void
  onSettled: () => void
}) {
  const open = state?.open ?? []
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Posisi terbuka</h2>
        <span className={s.subtle}>{open.length} posisi</span>
      </div>
      {open.length === 0 ? (
        <div className={s.empty}>{state ? 'Tidak ada posisi terbuka.' : 'Memuat…'}</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Instrumen</th>
                <th>Arah</th>
                <th>Stake</th>
                <th>Masuk</th>
                <th>Sekarang</th>
                <th>PnL</th>
                <th>{mode === 'binary' ? 'Sisa' : 'SL / Target'}</th>
                <th>Oleh</th>
                {mode !== 'binary' && <th />}
              </tr>
            </thead>
            <tbody>
              {open.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={s.sym}>{p.symbol}</span>
                    <div className={s.subtle}>{p.name}</div>
                  </td>
                  <td className={p.side === 'long' || p.side === 'up' ? s.up : s.down}>{p.side.toUpperCase()}</td>
                  <td>{usd(p.stakeUsd)}</td>
                  <td>{price(p.entryPrice)}</td>
                  <td>{price(p.markPrice)}</td>
                  <td className={tone(p.pnlUsd)}>
                    {usd(p.pnlUsd, true)}
                    <div className={s.subtle}>{pct(p.pnlPct)}</div>
                  </td>
                  <td>
                    {mode === 'binary' && p.expiresAt ? (
                      <Countdown until={p.expiresAt} onDone={onSettled} />
                    ) : (
                      <>
                        {price(p.stopLoss)} / {price(p.takeProfit)}
                        {p.expiresAt && <div className={s.subtle}>s.d. {new Date(p.expiresAt).toLocaleString('id-ID')}</div>}
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`${s.badge} ${p.openedBy === 'ai' ? s.badgeAi : ''}`} title={p.note ?? undefined}>
                      {p.openedBy === 'ai' ? 'AI' : 'manual'}
                    </span>
                  </td>
                  {mode !== 'binary' && (
                    <td>
                      <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => onClose(p.id)}>
                        Tutup
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function History({ state }: { state: SimState | null }) {
  const closed = state?.closed ?? []
  const curve = useMemo(() => {
    if (!state) return []
    let eq = state.account.startingBalance
    return [eq, ...[...state.closed].reverse().map((c) => (eq += c.pnlUsd))]
  }, [state])

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Riwayat trade</h2>
        <span className={s.subtle}>{state?.stats.trades ?? 0} selesai</span>
      </div>
      {curve.length > 2 && (
        <div style={{ padding: '12px 18px 0' }}>
          <span className={s.label}>Kurva modal terealisasi</span>
          <Sparkline points={curve} />
        </div>
      )}
      {closed.length === 0 ? (
        <div className={s.empty}>Belum ada trade selesai.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Ditutup</th>
                <th>Instrumen</th>
                <th>Arah</th>
                <th>Stake</th>
                <th>Masuk → Keluar</th>
                <th>PnL</th>
                <th>Sebab</th>
                <th>Oleh</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((c) => (
                <tr key={c.id}>
                  <td className={s.subtle}>{c.closedAt ? new Date(c.closedAt).toLocaleString('id-ID') : '—'}</td>
                  <td className={s.sym}>{c.symbol}</td>
                  <td className={c.side === 'long' || c.side === 'up' ? s.up : s.down}>{c.side.toUpperCase()}</td>
                  <td>{usd(c.stakeUsd)}</td>
                  <td>
                    {price(c.entryPrice)} → {price(c.exitPrice)}
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
      )}
    </section>
  )
}

function DeskRunView({ run }: { run: SimState['deskRuns'][number] }) {
  const turns = (Array.isArray(run.turns) ? run.turns : []) as DeskTurn[]
  const decision = run.decision as DeskDecision | null
  const executed = (Array.isArray(run.executed) ? run.executed : []) as ExecutedAction[]
  const signals = (Array.isArray(run.signals) ? run.signals : []) as SignalReport[]
  const [showSignals, setShowSignals] = useState(false)

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
      {signals.length > 0 && (
        <>
          <button type="button" className="btn btn-quiet" style={{ justifySelf: 'start' }} onClick={() => setShowSignals((v) => !v)}>
            {showSignals ? 'Sembunyikan radar & bandar' : `Lihat radar & bandar (${signals.length} instrumen)`}
          </button>
          {showSignals && <SignalTable signals={signals} />}
        </>
      )}
    </div>
  )
}

/** Radar teknikal dan jejak bandar yang dibaca desk pada sidang itu. */
function SignalTable({ signals }: { signals: SignalReport[] }) {
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
            <th>Skor</th>
            <th>Bandar</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((sig) => (
            <tr key={`${sig.market}:${sig.symbol}`}>
              <td className={s.sym}>{sig.symbol}</td>
              <td>{sig.timeframe}</td>
              <td>{price(sig.price)}</td>
              <td>{sig.trend}</td>
              <td>{sig.rsi14 ?? '—'}</td>
              <td className={tone(sig.score)}>{sig.score}</td>
              <td title={sig.bandar.evidence.join('\n')} className={tone(sig.bandar.score)}>
                {sig.bandar.label} ({sig.bandar.score})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
