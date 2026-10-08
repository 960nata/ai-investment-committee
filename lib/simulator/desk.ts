/**
 * Desk trading AI untuk simulator.
 *
 * Empat agen, empat keluarga model, bergiliran di atas satu blok fakta —
 * pola yang sama dengan komite investasi (`lib/agents/committee.ts`):
 *
 *   1. Pemburu Sinyal  — membaca radar teknikal, memilih kandidat.
 *   2. Pelacak Bandar  — menguji kandidat dengan jejak pemain besar
 *                        (arus volume, penyerapan, buku order, KSEI).
 *   3. Manajer Risiko  — menyerang usulan, menimbang posisi dompet.
 *   4. Kepala Desk     — memutuskan dalam JSON; hasilnya DIEKSEKUSI.
 *
 * Bedanya dengan komite: di sini model memang boleh berkata "buka posisi",
 * karena yang dipertaruhkan uang mainan di dompet simulasi milik pengguna
 * Premium sendiri, bukan rekomendasi yang dibaca publik. Aturan angka tetap
 * sama kerasnya: semua harga dan indikator datang dari blok FAKTA, dan
 * eksekusi memakai harga yang dibaca server saat itu juga — bukan angka yang
 * ditulis model.
 */

import { LLM_ADAPTERS } from '@/lib/ai/adapters'
import { AllProvidersFailedError, complete } from '@/lib/ai/registry'
import type { LlmMessage, LlmRequest, LlmResponse } from '@/lib/ai/types'
import { getCandles, getLatestFeature } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { getOrCreateAccount, recordDeskRun, updateDeskRunExecuted } from '@/lib/db/simulator-queries'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { loadMarketView, type MarketRow } from '@/lib/member/market-view'
import {
  BINARY_EXPIRIES,
  BINARY_SYMBOLS,
  MIN_STAKE_USD,
  MODE_INFO,
  type OpenTradeInput,
  type SimMode,
} from './config'
import { closeTradeNow, getSimState, openTrade, type SimState } from './engine'
import { cryptoBars, cryptoOrderBook, isCryptoSymbol, yahooIntradayBars, type Bar } from './prices'
import { computeSignal, signalToPrompt, type SignalReport } from './signals'

export interface DeskTurn {
  agent: 'radar' | 'bandar' | 'risiko' | 'kepala'
  title: string
  content: string
  providerId?: string
  model?: string
  latencyMs?: number
}

export interface DeskAction {
  type: 'open' | 'close'
  symbol?: string
  market?: string
  direction?: 'long' | 'short' | 'up' | 'down'
  stake_pct?: number
  expiry_seconds?: number
  stop_loss_pct?: number | null
  take_profit_pct?: number | null
  position_id?: number
  reason?: string
}

export interface DeskDecision {
  summary: string
  confidence: number
  actions: DeskAction[]
}

export interface ExecutedAction {
  action: DeskAction
  ok: boolean
  message: string
  positionId?: number
}

export interface DeskResult {
  runId: number
  turns: DeskTurn[]
  signals: SignalReport[]
  decision: DeskDecision | null
  executed: ExecutedAction[]
}

const MAX_ACTIONS = 3
const MAX_STAKE_PCT = 25
/** Batas satu percobaan rantai penyedia; yang macet diganti, bukan ditunggu. */
const ATTEMPT_TIMEOUT_MS = 12_000
const NON_FINAL_ATTEMPT_MS = 9_000
/** Waktu yang selalu disisakan untuk Kepala Desk. */
const KEPALA_RESERVE_MS = 12_000

// ---------------------------------------------------------------------------
// Tahap 1: fakta
// ---------------------------------------------------------------------------

function toBars(rows: { date: string; open: string; high: string; low: string; close: string; volume: string }[]): Bar[] {
  return rows.map((r) => ({
    time: Date.parse(`${r.date}T00:00:00Z`),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }))
}

/** Candle harian → mingguan, untuk membaca tren tahunan tanpa ribuan bar. */
function weekly(bars: Bar[]): Bar[] {
  const out: Bar[] = []
  for (const b of bars) {
    const d = new Date(b.time)
    const monday = b.time - ((d.getUTCDay() + 6) % 7) * 86_400_000
    const prev = out[out.length - 1]
    if (prev && prev.time === monday) {
      prev.high = Math.max(prev.high, b.high)
      prev.low = Math.min(prev.low, b.low)
      prev.close = b.close
      prev.volume += b.volume
    } else {
      out.push({ ...b, time: monday })
    }
  }
  return out
}

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

async function cryptoSignal(symbol: string, name: string, interval: '1m' | '15m'): Promise<SignalReport | null> {
  const [bars, book] = await Promise.all([cryptoBars(symbol, interval, 150), cryptoOrderBook(symbol)])
  return computeSignal({ market: 'CRYPTO', symbol, name, timeframe: interval }, bars, { orderBook: book })
}

async function dailySignal(row: MarketRow, mode: 'bulanan' | 'tahunan'): Promise<SignalReport | null> {
  const market = row.market.toUpperCase() as MarketCode
  const days = mode === 'tahunan' ? 3 * 365 : 400
  const rows = await getCandles(row.id, isoDaysAgo(days), isoDaysAgo(-1))
  let bars = toBars(rows)
  if (mode === 'tahunan') bars = weekly(bars)

  const context: string[] = []
  const horizon = MODE_INFO[mode].scoreHorizon!
  const sc = row.scores[horizon]
  if (sc) context.push(`Skor sistem ${horizon} ${sc.score} dari skala −10..+10 (keyakinan ${sc.confidence}, per ${sc.date}).`)
  if (row.verdict) context.push(`Putusan komite terakhir: ${row.verdict.verdict} (keyakinan ${row.verdict.confidence ?? '-'}).`)

  let f1: number | null = null
  let f3: number | null = null
  if (market === 'IDX') {
    const feature = await getLatestFeature(row.id, FEATURE_SET_VERSION).catch(() => null)
    const v = (feature?.values ?? {}) as Record<string, number | null>
    f1 = v.asing_chg_1b ?? null
    f3 = v.asing_chg_3b ?? null
    if (typeof v.asing_pct === 'number') context.push(`Porsi asing KSEI ${v.asing_pct.toFixed(2)}%.`)
  }
  if (bars.length === 0) return null
  const ageDays = Math.floor((Date.now() - bars[bars.length - 1].time) / 86_400_000)
  // Instrumen yang datanya berhenti (delisting, sumber mati) tidak layak masuk radar.
  if (ageDays > 10) return null
  if (ageDays > 5) context.push(`PERINGATAN: candle terakhir ${ageDays} hari lalu.`)

  return computeSignal(
    { market, symbol: row.symbol, name: row.name, timeframe: mode === 'tahunan' ? '1W' : '1D' },
    bars,
    { foreignChange1m: f1, foreignChange3m: f3, context },
  )
}

async function intradaySignal(row: MarketRow): Promise<SignalReport | null> {
  const bars = await yahooIntradayBars(row.symbol)
  const lastBar = bars[bars.length - 1]
  // Bursa tutup: candle terakhir dari sesi kemarin. Desk harian tidak boleh membuka posisi di sana.
  if (!lastBar || Date.now() - lastBar.time > 45 * 60_000) return null
  const sc = row.scores.pendek
  return computeSignal(
    { market: row.market.toUpperCase(), symbol: row.symbol, name: row.name, timeframe: '15m' },
    bars,
    { context: sc ? [`Skor sistem pendek ${sc.score} dari skala −10..+10 (${sc.confidence}).`] : [] },
  )
}

const TRADABLE = new Set(['crypto', 'memecoin', 'saham', 'emas', 'komoditi'])

/** Kandidat terkuat per mode, plus instrumen yang sedang dipegang. */
async function gatherSignals(mode: SimMode, state: SimState, gatherDeadline: number): Promise<SignalReport[]> {
  const held = new Set(state.open.map((p) => p.symbol))
  // Instrumen yang datanya belum datang sebelum tenggat dilewati, bukan ditunggu:
  // sidang dengan lima instrumen lebih berguna daripada sidang yang tidak pernah selesai.
  const settled = async (tasks: Promise<SignalReport | null>[]): Promise<SignalReport[]> => {
    const cap = new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, gatherDeadline - Date.now())))
    const results = await Promise.all(tasks.map((t) => Promise.race([t.catch(() => null), cap])))
    return results.filter((r): r is SignalReport => r !== null)
  }

  if (mode === 'binary') {
    const reports = await settled(BINARY_SYMBOLS.map((s) => cryptoSignal(s, s.replace('USDT', ''), '1m')))
    return rank(reports, held, 5)
  }

  // `candleCount` di market view hanya menghitung dua candle terakhir (untuk
  // perubahan harian); kecukupan riwayat diperiksa `computeSignal` (≥ 30 bar).
  const view = (await loadMarketView()).filter((r) => TRADABLE.has(r.assetClass) && r.candleCount > 0)
  const horizon = MODE_INFO[mode].scoreHorizon!
  const byScore = [...view].sort(
    (a, b) => Math.abs(b.scores[horizon]?.score ?? 0) - Math.abs(a.scores[horizon]?.score ?? 0),
  )
  const heldRows = view.filter((r) => held.has(r.symbol))

  if (mode === 'harian') {
    const crypto = BINARY_SYMBOLS.slice(0, 5).map((s) => cryptoSignal(s, s.replace('USDT', ''), '15m'))
    const stocks = [...heldRows, ...byScore.filter((r) => !isCryptoSymbol(r.symbol)).slice(0, 6)]
      .filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i)
      .filter((r) => !isCryptoSymbol(r.symbol))
      .map(intradaySignal)
    return rank(await settled([...crypto, ...stocks]), held, 7)
  }

  const picks = [...heldRows, ...byScore.slice(0, 8)].filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i)
  return rank(await settled(picks.map((r) => dailySignal(r, mode))), held, 7)
}

function rank(reports: SignalReport[], held: Set<string>, keep: number): SignalReport[] {
  const sorted = [...reports].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
  const heldReports = sorted.filter((r) => held.has(r.symbol))
  const others = sorted.filter((r) => !held.has(r.symbol))
  return [...heldReports, ...others.slice(0, Math.max(0, keep - heldReports.length))]
}

function portfolioBlock(state: SimState): string {
  const a = state.account
  const lines = [
    `Kas $${a.cash.toFixed(2)} | ekuitas $${a.equity.toFixed(2)} | modal awal $${a.startingBalance.toFixed(2)} | imbal hasil ${state.stats.returnPct.toFixed(2)}%`,
    `Riwayat: ${state.stats.trades} trade selesai, menang ${state.stats.wins}, kalah ${state.stats.losses}.`,
  ]
  if (state.open.length === 0) lines.push('Posisi terbuka: tidak ada.')
  for (const p of state.open) {
    lines.push(
      `Posisi #${p.id}: ${p.side} ${p.market}:${p.symbol} stake $${p.stakeUsd.toFixed(2)} masuk ${p.entryPrice} sekarang ${p.markPrice ?? '-'} PnL ${p.pnlUsd?.toFixed(2) ?? '-'} USD${p.expiresAt ? ` jatuh tempo ${p.expiresAt}` : ''}`,
    )
  }
  const recent = state.closed.slice(0, 5)
  if (recent.length > 0) {
    lines.push('5 trade terakhir: ' + recent.map((c) => `${c.symbol} ${c.side} ${c.pnlUsd >= 0 ? '+' : ''}${c.pnlUsd.toFixed(2)}`).join(', '))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Tahap 2: rapat desk
// ---------------------------------------------------------------------------

const RULES = [
  'ATURAN:',
  '- Ini SIMULASI dengan uang virtual. Tugas desk adalah mengambil keputusan trading terbaik di dompet simulasi ini.',
  '- ANGKA: hanya dari blok FAKTA. Jangan mengarang harga, level, atau berita.',
  '- "Bandar" = jejak pemain besar yang terbaca di data (arus volume, penyerapan, buku order, KSEI). Jangan menuduh manipulasi.',
  '- SIMULATOR LATIHAN: tujuan desk adalah berlatih trading dan mengumpulkan rekam jejak, jadi desk harus aktif. Kandidat dengan |skor radar| ≥ 35 layak ditradingkan dengan stake kecil; diam hanya bila semua kandidat lemah (|skor| < 35) atau bandar berlawanan kuat.',
  '- FORMAT: maksimum 10 baris "LABEL: isi", Bahasa Indonesia lugas, tanpa markdown.',
].join('\n')

interface DeskRole {
  agent: DeskTurn['agent']
  title: string
  prefer: string[]
  temperature: number
  maxOutputTokens: number
  json?: boolean
  system: (mode: SimMode) => string
}

const modeBrief = (mode: SimMode) =>
  mode === 'binary'
    ? 'MODE: binary option kripto. Pilihan arah "up" atau "down", kedaluwarsa 60/300/900/1800/3600 detik, bayaran 85% bila benar, stake hangus bila salah. Sinyal dari candle 1 menit dan buku order.'
    : `MODE: ${MODE_INFO[mode].label}. Posisi "long" atau "short", ditutup otomatis setelah ${MODE_INFO[mode].horizonDays} hari. ${MODE_INFO[mode].description}`

const ROLES: DeskRole[] = [
  {
    agent: 'radar',
    title: 'Pemburu Sinyal',
    prefer: ['groq', 'cerebras'],
    temperature: 0.3,
    maxOutputTokens: 380,
    system: (mode) =>
      [
        'Kamu Pemburu Sinyal di desk trading. Baca radar teknikal di FAKTA dan pilih maksimal 3 peluang terbaik.',
        'Untuk tiap peluang: simbol, arah, alasan dengan angka (tren, RSI, MACD, volume, skor radar), dan apa yang membatalkannya.',
        'Sebut juga instrumen yang sebaiknya DIHINDARI dan kenapa.',
        modeBrief(mode),
        RULES,
      ].join('\n'),
  },
  {
    agent: 'bandar',
    title: 'Pelacak Bandar',
    prefer: ['gemini', 'cerebras', 'mistral'],
    temperature: 0.3,
    maxOutputTokens: 380,
    system: (mode) =>
      [
        'Kamu Pelacak Bandar. Uji usulan Pemburu Sinyal dengan jejak pemain besar di FAKTA: akumulasi/distribusi, penyerapan volume, ketimpangan buku order, dinding order, perubahan porsi asing KSEI.',
        'Untuk tiap usulan: KONFIRMASI, BERTENTANGAN, atau NETRAL, dengan angkanya. Tambahkan instrumen lain bila jejak bandarnya kuat tapi terlewat.',
        modeBrief(mode),
        RULES,
      ].join('\n'),
  },
  {
    agent: 'risiko',
    title: 'Manajer Risiko',
    prefer: ['cloudflare', 'deepseek', 'nvidia'],
    temperature: 0.2,
    maxOutputTokens: 380,
    system: (mode) =>
      [
        'Kamu Manajer Risiko. Serang usulan dua agen sebelumnya dan tetapkan batasnya berdasarkan DOMPET di FAKTA.',
        'Hasilkan: usulan yang kamu veto dan alasannya; ukuran stake maksimum per usulan (persen kas, total semua posisi baru ≤ 40% kas); stop loss dan target dalam persen dari ATR; posisi terbuka yang sebaiknya ditutup.',
        'Bila dompet sedang rugi beruntun, perkecil ukuran. Pertentangan kecil antara sinyal dan bandar BUKAN alasan veto — kecilkan stake (2–5% kas). Veto HANYA bila skor bandar berlawanan arah dengan selisih ≥ 25 poin, atau |skor radar| < 35.',
        'Sebut minimal satu usulan yang LOLOS beserta stake-nya, kecuali semua kandidat memenuhi syarat veto.',
        modeBrief(mode),
        RULES,
      ].join('\n'),
  },
  {
    agent: 'kepala',
    title: 'Kepala Desk',
    prefer: ['openai', 'gemini', 'groq'],
    temperature: 0.1,
    maxOutputTokens: 900,
    json: true,
    system: (mode) =>
      [
        'Kamu Kepala Desk. Timbang tiga laporan, lalu putuskan. Keputusanmu langsung dieksekusi di dompet simulasi.',
        'Balas HANYA satu objek JSON tanpa teks lain:',
        mode === 'binary'
          ? '{"summary":"<2 kalimat>","confidence":<0-100>,"actions":[{"type":"open","symbol":"<simbol dari FAKTA>","market":"CRYPTO","direction":"up"|"down","stake_pct":<1-25>,"expiry_seconds":60|300|900|1800|3600,"reason":"<1 kalimat>"}]}'
          : '{"summary":"<2 kalimat>","confidence":<0-100>,"actions":[{"type":"open","symbol":"<simbol dari FAKTA>","market":"<market dari FAKTA>","direction":"long"|"short","stake_pct":<1-25>,"stop_loss_pct":<angka>,"take_profit_pct":<angka>,"reason":"<1 kalimat>"},{"type":"close","position_id":<id>,"reason":"<1 kalimat>"}]}',
        `Maksimal ${MAX_ACTIONS} aksi. "actions": [] bila tidak ada peluang yang lolos risiko. stake_pct adalah persen dari KAS.`,
        'summary maksimal 2 kalimat pendek; tiap reason maksimal 15 kata.',
        'Hormati veto Manajer Risiko kecuali kamu menjelaskan di reason kenapa veto itu keliru.',
        'Bila ada kandidat dengan |skor radar| ≥ 35 yang tidak diveto karena bandar berlawanan kuat, WAJIB buka minimal satu posisi (stake 2–10% kas) di kandidat terkuat. "actions": [] hanya bila tidak ada kandidat seperti itu.',
        'Tulis "symbol" persis seperti di FAKTA tanpa awalan pasar, contoh "ETHUSDT" atau "BBCA.JK" (bukan "CRYPTO:ETHUSDT").',
        modeBrief(mode),
      ].join('\n'),
  },
]

function buildMessages(role: DeskRole, mode: SimMode, facts: string, turns: DeskTurn[]): LlmMessage[] {
  const parts = [facts, ...turns.map((t) => `[${t.title.toUpperCase()}]\n${t.content.trim().slice(0, 1400)}`)]
  parts.push(role.json ? `[GILIRANMU: ${role.title.toUpperCase()} — BALAS HANYA OBJEK JSON]` : `[GILIRANMU: ${role.title.toUpperCase()}]`)
  return [
    { role: 'system', content: role.system(mode) },
    { role: 'user', content: parts.join('\n\n') },
  ]
}

function normaliseDecision(obj: Partial<DeskDecision>, actions: unknown[]): DeskDecision {
  return {
    summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 600) : '',
    confidence: Math.max(0, Math.min(100, Math.round(Number(obj.confidence) || 0))),
    actions: actions
      .filter((a): a is DeskAction => {
        const t = (a as DeskAction | null)?.type
        return t === 'open' || t === 'close'
      })
      .slice(0, MAX_ACTIONS),
  }
}

/**
 * Urai putusan Kepala Desk.
 *
 * Bila JSON-nya terpotong batas token, aksi yang sudah tertulis utuh tetap
 * diselamatkan satu per satu; aksi yang terpotong dibuang. Lebih baik
 * mengeksekusi dua aksi yang lengkap daripada membuang seluruh sidang karena
 * kurung kurawal terakhir tidak sempat ditulis.
 */
export function parseDecision(raw: string | null): DeskDecision | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  if (start < 0) return null
  const end = raw.lastIndexOf('}')
  if (end > start) {
    try {
      const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<DeskDecision>
      return normaliseDecision(obj, Array.isArray(obj.actions) ? obj.actions : [])
    } catch {
      // jatuh ke penyelamatan di bawah
    }
  }

  const text = raw.slice(start)
  const summary = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1]
  const confidence = /"confidence"\s*:\s*(\d+)/.exec(text)?.[1]
  const actionsAt = text.indexOf('"actions"')
  const actions: unknown[] = []
  if (actionsAt >= 0) {
    let depth = 0
    let from = -1
    let inString = false
    for (let i = text.indexOf('[', actionsAt) + 1; i > 0 && i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (ch === '\\') i++
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') {
        if (depth === 0) from = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && from >= 0) {
          try {
            actions.push(JSON.parse(text.slice(from, i + 1)))
          } catch {
            // aksi rusak dibuang
          }
          from = -1
        }
      } else if (ch === ']' && depth === 0) break
    }
  }
  if (summary === undefined && confidence === undefined && actions.length === 0) return null
  return normaliseDecision(
    { summary: summary ? JSON.parse(`"${summary}"`) : 'Putusan terpotong; hanya aksi yang tertulis utuh yang dipakai.', confidence: Number(confidence ?? 0) },
    actions,
  )
}

/**
 * Satu giliran dengan cadangan berlapis.
 *
 * Batas waktu registry berlaku untuk seluruh rantainya: satu penyedia yang
 * macet sampai batas itu membuat penyedia sesudahnya tidak pernah ditanya.
 * Karena itu tiap percobaan diberi jatah pendek, dan penyedia yang gagal
 * didorong ke belakang pada percobaan berikutnya.
 */
async function completeWithFallback(
  request: Omit<LlmRequest, 'timeoutMs' | 'prefer'>,
  prefer: string[],
  deadline: number,
  attemptMs: number,
): Promise<LlmResponse> {
  const failed = new Set<string>()
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining < 3_000) break
    const order = [...prefer, ...LLM_ADAPTERS.map((a) => a.id)].filter((id, i, a) => a.indexOf(id) === i && !failed.has(id))
    try {
      return await complete({ ...request, prefer: order, timeoutMs: Math.min(attemptMs, remaining) })
    } catch (err) {
      lastError = err
      if (!(err instanceof AllProvidersFailedError)) throw err
      for (const a of err.attempts) failed.add(a.providerId)
      console.warn(`[desk] percobaan ${attempt + 1} gagal, sisa ${deadline - Date.now()}ms: ${err.message}`)
    }
  }
  throw lastError ?? new Error('Waktu rapat desk habis.')
}

// ---------------------------------------------------------------------------
// Tahap 3: eksekusi
// ---------------------------------------------------------------------------

const nearestExpiry = (s: number | undefined) =>
  BINARY_EXPIRIES.reduce((best, v) => (Math.abs(v - (s ?? 300)) < Math.abs(best - (s ?? 300)) ? v : best), 300 as number)

async function execute(
  ownerKey: string,
  mode: SimMode,
  decision: DeskDecision,
  signals: SignalReport[],
  state: SimState,
  runId: number,
): Promise<ExecutedAction[]> {
  const results: ExecutedAction[] = []
  let cash = state.account.cash

  for (const action of decision.actions) {
    try {
      if (action.type === 'close') {
        if (mode === 'binary') throw new Error('Binary tidak bisa ditutup lebih awal.')
        const id = Number(action.position_id)
        if (!state.open.some((p) => p.id === id)) throw new Error(`Posisi #${id} tidak ada di dompet.`)
        const closed = await closeTradeNow(ownerKey, mode, id, 'ai')
        if (closed) cash += Number(closed.stakeUsd) + Number(closed.pnlUsd ?? 0)
        results.push({ action, ok: true, message: `Posisi #${id} ditutup.`, positionId: id })
        continue
      }

      // Simbol harus berasal dari blok fakta — desk tidak boleh membuka instrumen yang tidak ia baca.
      // Model kadang menyalin format judul FAKTA ("CRYPTO:ETHUSDT") atau menulis "ETH/USDT".
      const wanted = String(action.symbol ?? '')
        .toUpperCase()
        .replace(/^(CRYPTO|IDX|US|GLOBAL):/, '')
        .replace('/', '')
        .trim()
      const sig = signals.find((s) => s.symbol.toUpperCase() === wanted)
      if (!sig) throw new Error(`${action.symbol} tidak ada di radar desk.`)
      const pct = Math.max(1, Math.min(MAX_STAKE_PCT, Number(action.stake_pct) || 5))
      const stake = Math.floor(cash * (pct / 100) * 100) / 100
      if (stake < MIN_STAKE_USD) throw new Error('Kas tidak cukup untuk stake minimum.')

      let input: OpenTradeInput
      if (mode === 'binary') {
        input = {
          kind: 'binary',
          symbol: sig.symbol as (typeof BINARY_SYMBOLS)[number],
          direction: action.direction === 'down' || action.direction === 'short' ? 'down' : 'up',
          stake,
          expirySeconds: nearestExpiry(action.expiry_seconds),
        }
      } else {
        const sl = Number(action.stop_loss_pct)
        const tp = Number(action.take_profit_pct)
        input = {
          kind: 'invest',
          mode,
          market: sig.market as 'CRYPTO' | 'IDX' | 'US' | 'GLOBAL',
          symbol: sig.symbol,
          side: action.direction === 'short' || action.direction === 'down' ? 'short' : 'long',
          stake,
          stopLossPct: Number.isFinite(sl) && sl >= 0.2 ? Math.min(sl, 90) : (sig.suggestedStopPct ?? null),
          takeProfitPct: Number.isFinite(tp) && tp >= 0.2 ? Math.min(tp, 1000) : (sig.suggestedTakePct ?? null),
        }
      }

      const pos = await openTrade(ownerKey, input, {
        openedBy: 'ai',
        deskRunId: runId,
        note: action.reason ?? decision.summary,
      })
      cash -= stake
      results.push({ action, ok: true, message: `Dibuka: ${sig.symbol} $${stake.toFixed(2)}.`, positionId: pos.id })
    } catch (err) {
      results.push({ action, ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Pintu masuk
// ---------------------------------------------------------------------------

export async function runDesk(ownerKey: string, mode: SimMode): Promise<DeskResult> {
  // Batas fungsi 60 detik: pengumpulan data + empat giliran harus selesai
  // dengan sisa waktu untuk eksekusi dan membaca ulang dompet.
  const deadline = Date.now() + 48_000
  const [account, state] = await Promise.all([getOrCreateAccount(ownerKey, mode), getSimState(ownerKey, mode)])
  const signals = await gatherSignals(mode, state, Date.now() + 14_000)

  if (signals.length === 0) {
    const runId = await recordDeskRun({
      accountId: account.id,
      status: 'done',
      turns: [],
      signals: [],
      decision: { summary: 'Tidak ada instrumen dengan data cukup atau pasar sedang tutup. Desk tidak bersidang.', confidence: 0, actions: [] },
    })
    return { runId, turns: [], signals: [], decision: null, executed: [] }
  }

  const facts = [
    'FAKTA (satu-satunya sumber angka):',
    `Waktu server: ${new Date().toISOString()}`,
    '',
    '## DOMPET',
    portfolioBlock(state),
    '',
    '## RADAR',
    ...signals.map(signalToPrompt),
  ].join('\n')

  const turns: DeskTurn[] = []
  let raw: string | null = null

  try {
    for (const role of ROLES) {
      // Giliran sebelum Kepala Desk menyisakan waktu untuknya: rapat tanpa putusan
      // adalah biaya empat panggilan tanpa hasil apa pun.
      const turnDeadline = role.json ? deadline : deadline - KEPALA_RESERVE_MS
      if (!role.json && turnDeadline - Date.now() < 3_000) {
        turns.push({ agent: role.agent, title: role.title, content: 'DILEWATI: waktu sidang menipis; giliran ini diberikan ke Kepala Desk.' })
        continue
      }
      const res = await completeWithFallback(
        {
          feature: 'simulator-desk',
          messages: buildMessages(role, mode, facts, turns),
          temperature: role.temperature,
          maxOutputTokens: role.maxOutputTokens,
          json: role.json,
          // Simulator hanya untuk Premium: putusan akhirnya layak model berbayar terkuat bila terpasang.
          tier: role.json ? 'premium' : 'standard',
        },
        role.prefer,
        turnDeadline,
        role.json ? ATTEMPT_TIMEOUT_MS : NON_FINAL_ATTEMPT_MS,
      )
      turns.push({
        agent: role.agent,
        title: role.title,
        content: res.text,
        providerId: res.providerId,
        model: res.model,
        latencyMs: res.latencyMs,
      })
      if (role.json) raw = res.text
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await recordDeskRun({ accountId: account.id, status: 'failed', turns, signals, error: message })
    throw err
  }

  const decision = parseDecision(raw)
  const runId = await recordDeskRun({
    accountId: account.id,
    status: 'done',
    turns,
    signals,
    decision: decision ?? { summary: 'Putusan Kepala Desk tidak bisa diurai; tidak ada trade.', confidence: 0, actions: [] },
  })

  const executed = decision ? await execute(ownerKey, mode, decision, signals, state, runId) : []
  if (executed.length > 0) await updateDeskRunExecuted(runId, executed)

  return { runId, turns, signals, decision, executed }
}

