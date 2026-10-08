/**
 * Mesin simulator: membuka posisi, menyelesaikan yang jatuh tempo, dan
 * menyusun keadaan satu dompet.
 *
 * Penyelesaian berjalan saat dompet dibaca, bukan oleh cron. Binary yang
 * kedaluwarsa pukul 10:05 dan baru dibuka lagi pukul 14:00 tetap diselesaikan
 * dengan harga pukul 10:05 — harga itu dicari ulang dari riwayat transaksi
 * Binance, jadi menunda membaca tidak mengubah hasil. Posisi investasi
 * memeriksa stop dan target memakai harga saat dibaca; itu batas yang jujur
 * dari simulator tanpa pekerja latar, dan disebutkan di antarmuka.
 */

import { catalogueEntry } from '@/lib/adapters/catalogue'
import { getInstrumentBySymbol } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import {
  SimRejectError,
  closePosition,
  getAccountStats,
  getOrCreateAccount,
  listClosedPositions,
  listDeskRuns,
  listOpenPositions,
  openPosition,
  positionPnl,
} from '@/lib/db/simulator-queries'
import type { SimAccountRow, SimPositionRow } from '@/lib/db/simulator-schema'
import { BINARY_PAYOUT, MODE_INFO, type OpenTradeInput, type SimMode } from './config'
import { cryptoPriceAt, liveQuote, liveQuotes, usdPerUnit } from './prices'

const DAY_MS = 86_400_000

export { SimRejectError }

export async function openTrade(
  ownerKey: string,
  input: OpenTradeInput,
  meta: { openedBy: 'manual' | 'ai'; deskRunId?: number | null; note?: string | null } = { openedBy: 'manual' },
): Promise<SimPositionRow> {
  if (input.kind === 'binary') {
    const account = await getOrCreateAccount(ownerKey, 'binary')
    const quote = await liveQuote(input.symbol)
    const entry = catalogueEntry('CRYPTO', input.symbol)
    return openPosition(account.id, {
      market: 'CRYPTO',
      symbol: input.symbol,
      name: entry?.name ?? input.symbol,
      currency: 'USD',
      side: input.direction,
      stakeUsd: round2(input.stake),
      fxToUsd: 1,
      entryPrice: quote.price,
      payout: BINARY_PAYOUT,
      expiresAt: new Date(Date.now() + input.expirySeconds * 1000),
      ...meta,
    })
  }

  const instrument = await getInstrumentBySymbol(input.market as MarketCode, input.symbol)
  if (!instrument || !instrument.isActive) throw new SimRejectError(`${input.symbol} tidak terdaftar di pasar ${input.market}.`)
  if (instrument.assetClass === 'indeks') throw new SimRejectError('Indeks tidak bisa diperdagangkan langsung.')

  const quote = await liveQuote(instrument.symbol)
  if (input.mode === 'harian' && !quote.fresh) {
    throw new SimRejectError(`Pasar ${instrument.symbol} sedang tutup — simulasi harian butuh harga berjalan.`)
  }
  const currency = quote.currency || instrument.currency
  const fx = await usdPerUnit(currency)
  const entry = quote.price
  const sign = input.side === 'long' ? 1 : -1
  const sl = input.stopLossPct ? entry * (1 - (sign * input.stopLossPct) / 100) : null
  const tp = input.takeProfitPct ? entry * (1 + (sign * input.takeProfitPct) / 100) : null
  const horizon = MODE_INFO[input.mode].horizonDays ?? 1

  const account = await getOrCreateAccount(ownerKey, input.mode)
  return openPosition(account.id, {
    market: instrument.market,
    symbol: instrument.symbol,
    name: instrument.name,
    currency,
    side: input.side,
    stakeUsd: round2(input.stake),
    fxToUsd: fx,
    entryPrice: entry,
    stopLoss: sl && sl > 0 ? sl : null,
    takeProfit: tp && tp > 0 ? tp : null,
    expiresAt: new Date(Date.now() + horizon * DAY_MS),
    ...meta,
  })
}

/** Tutup satu posisi investasi di harga sekarang. Binary tidak bisa ditutup sebelum waktunya. */
export async function closeTradeNow(ownerKey: string, mode: SimMode, positionId: number, reason = 'manual') {
  if (mode === 'binary') throw new SimRejectError('Binary option berjalan sampai kedaluwarsa.')
  const account = await getOrCreateAccount(ownerKey, mode)
  const open = await listOpenPositions(account.id)
  const pos = open.find((p) => p.id === positionId)
  if (!pos) throw new SimRejectError('Posisi tidak ditemukan atau sudah ditutup.')
  const quote = await liveQuote(pos.symbol)
  return closePosition(account.id, pos.id, quote.price, reason)
}

export interface MarkedPosition {
  id: number
  market: string
  symbol: string
  name: string
  currency: string
  side: string
  stakeUsd: number
  entryPrice: number
  markPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  payout: number | null
  pnlUsd: number | null
  pnlPct: number | null
  openedAt: string
  expiresAt: string | null
  openedBy: string
  note: string | null
}

export interface ClosedTrade {
  id: number
  symbol: string
  name: string
  side: string
  stakeUsd: number
  entryPrice: number
  exitPrice: number | null
  pnlUsd: number
  openedAt: string
  closedAt: string | null
  closeReason: string | null
  openedBy: string
  note: string | null
}

export interface SimState {
  mode: SimMode
  account: {
    cash: number
    startingBalance: number
    equity: number
    resetCount: number
    autopilot: boolean
    resetAt: string
  }
  open: MarkedPosition[]
  closed: ClosedTrade[]
  stats: Awaited<ReturnType<typeof getAccountStats>> & { winRate: number | null; returnPct: number }
  deskRuns: {
    id: number
    status: string
    createdAt: string
    turns: unknown
    signals: unknown
    decision: unknown
    executed: unknown
    error: string | null
  }[]
}

/**
 * Selesaikan posisi yang jatuh tempo atau menyentuh stop/target, lalu
 * kembalikan harga tanda untuk posisi yang masih terbuka.
 */
async function settle(
  account: SimAccountRow,
  open: SimPositionRow[],
): Promise<{ marks: Map<number, number>; closedAny: boolean }> {
  const marks = new Map<number, number>()
  let closedAny = false
  if (open.length === 0) return { marks, closedAny }
  const now = Date.now()

  const binaryDue = open.filter((p) => (p.side === 'up' || p.side === 'down') && p.expiresAt && p.expiresAt.getTime() <= now)
  for (const p of binaryDue) {
    const at = p.expiresAt!.getTime()
    let price = await cryptoPriceAt(p.symbol, at)
    // Riwayat transaksi belum tersedia di detik yang sama; tunggu baca berikutnya.
    if (price === null && now - at > 10 * 60_000) price = (await liveQuote(p.symbol).catch(() => null))?.price ?? null
    if (price !== null) {
      await closePosition(account.id, p.id, price, 'settled')
      closedAny = true
    }
  }

  const rest = open.filter((p) => !binaryDue.includes(p))
  const quotes = await liveQuotes(rest.map((p) => p.symbol))
  for (const p of rest) {
    const q = quotes.get(p.symbol)
    if (!q) continue
    marks.set(p.id, q.price)
    if (p.side === 'up' || p.side === 'down') continue

    const sl = p.stopLoss != null ? Number(p.stopLoss) : null
    const tp = p.takeProfit != null ? Number(p.takeProfit) : null
    const long = p.side === 'long'
    let reason: string | null = null
    if (sl !== null && (long ? q.price <= sl : q.price >= sl)) reason = 'stop_loss'
    else if (tp !== null && (long ? q.price >= tp : q.price <= tp)) reason = 'take_profit'
    else if (p.expiresAt && p.expiresAt.getTime() <= now) reason = 'expired'
    if (reason) {
      await closePosition(account.id, p.id, q.price, reason)
      marks.delete(p.id)
      closedAny = true
    }
  }
  return { marks, closedAny }
}

export async function getSimState(ownerKey: string, mode: SimMode): Promise<SimState> {
  let account = await getOrCreateAccount(ownerKey, mode)
  const { marks, closedAny } = await settle(account, await listOpenPositions(account.id))
  // Kas hanya berubah bila ada posisi yang baru diselesaikan.
  if (closedAny) account = await getOrCreateAccount(ownerKey, mode)

  const [open, closed, stats, runs] = await Promise.all([
    listOpenPositions(account.id),
    listClosedPositions(account.id),
    getAccountStats(account.id),
    listDeskRuns(account.id),
  ])

  const marked: MarkedPosition[] = open.map((p) => {
    const mark = marks.get(p.id) ?? null
    // Untuk binary yang masih berjalan ini hasil "kalau selesai sekarang", bukan hasil akhir.
    const pnl = mark === null ? null : positionPnl(p, mark)
    return {
      id: p.id,
      market: p.market,
      symbol: p.symbol,
      name: p.name,
      currency: p.currency,
      side: p.side,
      stakeUsd: Number(p.stakeUsd),
      entryPrice: Number(p.entryPrice),
      markPrice: mark,
      stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
      takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
      payout: p.payout != null ? Number(p.payout) : null,
      pnlUsd: pnl,
      pnlPct: pnl !== null ? (pnl / Number(p.stakeUsd)) * 100 : null,
      openedAt: p.openedAt.toISOString(),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      openedBy: p.openedBy,
      note: p.note,
    }
  })

  const cash = Number(account.cash)
  const starting = Number(account.startingBalance)
  const openValue = marked.reduce((sum, p) => {
    // Binary yang masih berjalan dinilai sebesar stake-nya: belum menang, belum kalah.
    const binary = p.side === 'up' || p.side === 'down'
    return sum + p.stakeUsd + (binary ? 0 : (p.pnlUsd ?? 0))
  }, 0)
  const equity = cash + openValue

  return {
    mode,
    account: {
      cash,
      startingBalance: starting,
      equity,
      resetCount: account.resetCount,
      autopilot: account.autopilot,
      resetAt: account.resetAt.toISOString(),
    },
    open: marked,
    closed: closed.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      name: p.name,
      side: p.side,
      stakeUsd: Number(p.stakeUsd),
      entryPrice: Number(p.entryPrice),
      exitPrice: p.exitPrice != null ? Number(p.exitPrice) : null,
      pnlUsd: Number(p.pnlUsd ?? 0),
      openedAt: p.openedAt.toISOString(),
      closedAt: p.closedAt?.toISOString() ?? null,
      closeReason: p.closeReason,
      openedBy: p.openedBy,
      note: p.note,
    })),
    stats: {
      ...stats,
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : null,
      returnPct: starting > 0 ? ((equity - starting) / starting) * 100 : 0,
    },
    deskRuns: runs.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      turns: r.turns,
      signals: r.signals,
      decision: r.decision,
      executed: r.executed,
      error: r.error,
    })),
  }
}

const round2 = (v: number) => Math.floor(v * 100) / 100
