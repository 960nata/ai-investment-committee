/**
 * Simulator trading: pengaturan, dompet per mode, posisi, dan catatan desk AI.
 *
 * Tabel dibuat lazy seperti Premium. Uang yang bergerak di sini uang mainan,
 * tetapi tetap dijaga transaksi dan kunci baris: dua klik "buka posisi" yang
 * datang bersamaan tidak boleh sama-sama lolos memakai saldo yang sama, karena
 * papan hasil simulator hanya berguna kalau angkanya jujur.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from './client'
import { simAccount, simDeskRun, simPosition, simSettings, type SimAccountRow, type SimPositionRow } from './simulator-schema'
import { MAX_OPEN_POSITIONS, STARTING_BALANCE_USD, type SimMode } from '@/lib/simulator/config'

declare global {
  var __simTablesReady: boolean | undefined
}

export async function ensureSimulatorTables(): Promise<void> {
  if (globalThis.__simTablesReady) return

  // Jalur hangat: satu kueri, bukan sembilan DDL. Tiap cold start serverless
  // melewati fungsi ini, dan rapat desk punya batas 60 detik.
  // Kolom terbaru sebagai penanda versi: tabel lama tanpa kolom autopilot
  // tetap melewati ALTER di bawah.
  const probe = await db.execute<{ ready: boolean }>(
    sql`SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sim_account' AND column_name = 'last_desk_at'
        ) AS ready`,
  )
  if (probe[0]?.ready) {
    globalThis.__simTablesReady = true
    return
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sim_settings (
      id INTEGER PRIMARY KEY,
      premium_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`INSERT INTO sim_settings (id, premium_enabled) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sim_account (
      id SERIAL PRIMARY KEY,
      owner_key VARCHAR(40) NOT NULL,
      mode VARCHAR(12) NOT NULL,
      cash NUMERIC(18, 6) NOT NULL,
      starting_balance NUMERIC(18, 2) NOT NULL,
      reset_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS sim_account_owner_mode_uq ON sim_account (owner_key, mode)`)
  await db.execute(sql`ALTER TABLE sim_account ADD COLUMN IF NOT EXISTS autopilot BOOLEAN NOT NULL DEFAULT FALSE`)
  await db.execute(sql`ALTER TABLE sim_account ADD COLUMN IF NOT EXISTS last_desk_at TIMESTAMPTZ`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sim_position (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES sim_account(id) ON DELETE CASCADE,
      market VARCHAR(8) NOT NULL,
      symbol VARCHAR(24) NOT NULL,
      name VARCHAR(120) NOT NULL,
      currency VARCHAR(8) NOT NULL,
      side VARCHAR(8) NOT NULL,
      stake_usd NUMERIC(18, 6) NOT NULL,
      fx_to_usd NUMERIC(20, 10) NOT NULL,
      entry_price NUMERIC(24, 10) NOT NULL,
      stop_loss NUMERIC(24, 10),
      take_profit NUMERIC(24, 10),
      payout NUMERIC(6, 4),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      status VARCHAR(8) NOT NULL DEFAULT 'open',
      exit_price NUMERIC(24, 10),
      pnl_usd NUMERIC(18, 6),
      closed_at TIMESTAMPTZ,
      close_reason VARCHAR(16),
      opened_by VARCHAR(8) NOT NULL,
      desk_run_id INTEGER,
      note VARCHAR(400)
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sim_position_account_idx ON sim_position (account_id, status)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sim_position_closed_idx ON sim_position (account_id, closed_at)`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sim_desk_run (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES sim_account(id) ON DELETE CASCADE,
      status VARCHAR(8) NOT NULL,
      turns JSONB NOT NULL DEFAULT '[]'::jsonb,
      signals JSONB NOT NULL DEFAULT '[]'::jsonb,
      decision JSONB,
      executed JSONB NOT NULL DEFAULT '[]'::jsonb,
      error VARCHAR(600),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sim_desk_run_account_idx ON sim_desk_run (account_id, created_at)`)
  globalThis.__simTablesReady = true
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

export async function getSimSettings(): Promise<{ premiumEnabled: boolean }> {
  await ensureSimulatorTables()
  const [row] = await db.select().from(simSettings).where(eq(simSettings.id, 1))
  return { premiumEnabled: row?.premiumEnabled ?? false }
}

export async function setSimPremiumEnabled(enabled: boolean): Promise<{ premiumEnabled: boolean }> {
  await ensureSimulatorTables()
  await db.update(simSettings).set({ premiumEnabled: enabled, updatedAt: new Date() }).where(eq(simSettings.id, 1))
  return { premiumEnabled: enabled }
}

// ---------------------------------------------------------------------------
// Dompet
// ---------------------------------------------------------------------------

export async function getOrCreateAccount(ownerKey: string, mode: SimMode): Promise<SimAccountRow> {
  await ensureSimulatorTables()
  const [existing] = await db
    .select()
    .from(simAccount)
    .where(and(eq(simAccount.ownerKey, ownerKey), eq(simAccount.mode, mode)))
  if (existing) return existing

  await db
    .insert(simAccount)
    .values({ ownerKey, mode, cash: String(STARTING_BALANCE_USD), startingBalance: String(STARTING_BALANCE_USD) })
    .onConflictDoNothing()
  const [row] = await db
    .select()
    .from(simAccount)
    .where(and(eq(simAccount.ownerKey, ownerKey), eq(simAccount.mode, mode)))
  if (!row) throw new Error('Dompet simulator gagal dibuat.')
  return row
}

/** Kembalikan dompet ke $1.000 dan hapus seluruh riwayatnya. */
export async function resetAccount(ownerKey: string, mode: SimMode): Promise<SimAccountRow> {
  const account = await getOrCreateAccount(ownerKey, mode)
  return db.transaction(async (tx) => {
    await tx.delete(simPosition).where(eq(simPosition.accountId, account.id))
    await tx.delete(simDeskRun).where(eq(simDeskRun.accountId, account.id))
    const [row] = await tx
      .update(simAccount)
      .set({
        cash: String(STARTING_BALANCE_USD),
        startingBalance: String(STARTING_BALANCE_USD),
        resetCount: sql`${simAccount.resetCount} + 1`,
        resetAt: new Date(),
      })
      .where(eq(simAccount.id, account.id))
      .returning()
    return row
  })
}

export async function setAutopilot(ownerKey: string, mode: SimMode, enabled: boolean): Promise<void> {
  const account = await getOrCreateAccount(ownerKey, mode)
  await db.update(simAccount).set({ autopilot: enabled }).where(eq(simAccount.id, account.id))
}

/** Dompet yang autopilotnya menyala, yang paling lama tidak bersidang lebih dulu. */
export async function listAutopilotAccounts(limit = 50): Promise<SimAccountRow[]> {
  await ensureSimulatorTables()
  return db
    .select()
    .from(simAccount)
    .where(eq(simAccount.autopilot, true))
    .orderBy(sql`${simAccount.lastDeskAt} ASC NULLS FIRST`)
    .limit(limit)
}

/**
 * Klaim slot sidang secara atomik. Mengembalikan false bila dompet ini baru
 * bersidang kurang dari `minGapSeconds` lalu — termasuk oleh cron lain yang
 * berjalan bersamaan.
 */
export async function claimDeskSlot(accountId: number, minGapSeconds: number): Promise<boolean> {
  const rows = await db.execute<{ id: number }>(sql`
    UPDATE sim_account SET last_desk_at = NOW()
    WHERE id = ${accountId}
      AND (last_desk_at IS NULL OR last_desk_at < NOW() - make_interval(secs => ${minGapSeconds}))
    RETURNING id
  `)
  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Posisi
// ---------------------------------------------------------------------------

export interface NewPosition {
  market: string
  symbol: string
  name: string
  currency: string
  side: 'long' | 'short' | 'up' | 'down'
  stakeUsd: number
  fxToUsd: number
  entryPrice: number
  stopLoss?: number | null
  takeProfit?: number | null
  payout?: number | null
  expiresAt?: Date | null
  openedBy: 'manual' | 'ai'
  deskRunId?: number | null
  note?: string | null
}

export class SimRejectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SimRejectError'
  }
}

export async function openPosition(accountId: number, p: NewPosition): Promise<SimPositionRow> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ cash: string }>(
      sql`SELECT cash FROM sim_account WHERE id = ${accountId} FOR UPDATE`,
    )
    const cash = Number(locked[0]?.cash ?? 0)
    if (p.stakeUsd > cash + 1e-9) {
      throw new SimRejectError(`Saldo tidak cukup: tersedia $${cash.toFixed(2)}, diminta $${p.stakeUsd.toFixed(2)}.`)
    }
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(simPosition)
      .where(and(eq(simPosition.accountId, accountId), eq(simPosition.status, 'open')))
    if (open >= MAX_OPEN_POSITIONS) {
      throw new SimRejectError(`Maksimal ${MAX_OPEN_POSITIONS} posisi terbuka per dompet.`)
    }

    const [row] = await tx
      .insert(simPosition)
      .values({
        accountId,
        market: p.market,
        symbol: p.symbol,
        name: p.name.slice(0, 120),
        currency: p.currency,
        side: p.side,
        stakeUsd: String(p.stakeUsd),
        fxToUsd: String(p.fxToUsd),
        entryPrice: String(p.entryPrice),
        stopLoss: p.stopLoss != null ? String(p.stopLoss) : null,
        takeProfit: p.takeProfit != null ? String(p.takeProfit) : null,
        payout: p.payout != null ? String(p.payout) : null,
        expiresAt: p.expiresAt ?? null,
        openedBy: p.openedBy,
        deskRunId: p.deskRunId ?? null,
        note: p.note ? p.note.slice(0, 400) : null,
      })
      .returning()
    await tx
      .update(simAccount)
      .set({ cash: sql`${simAccount.cash} - ${String(p.stakeUsd)}` })
      .where(eq(simAccount.id, accountId))
    return row
  })
}

/**
 * Laba-rugi satu posisi pada harga tertentu, dalam USD.
 *
 * Investasi memakai imbal hasil harga dikali stake; pergerakan kurs selama
 * posisi terbuka sengaja diabaikan supaya hasilnya membaca keputusan trading,
 * bukan kebetulan rupiah melemah. Kerugian dibatasi sebesar stake — posisi
 * short yang rugi lebih dari 100% dianggap terlikuidasi.
 */
export function positionPnl(p: Pick<SimPositionRow, 'side' | 'stakeUsd' | 'entryPrice' | 'payout'>, price: number): number {
  const stake = Number(p.stakeUsd)
  const entry = Number(p.entryPrice)
  if (p.side === 'up' || p.side === 'down') {
    if (price === entry) return 0
    const won = p.side === 'up' ? price > entry : price < entry
    return won ? stake * Number(p.payout ?? 0) : -stake
  }
  const ret = p.side === 'long' ? price / entry - 1 : 1 - price / entry
  return Math.max(-stake, stake * ret)
}

export async function closePosition(
  accountId: number,
  positionId: number,
  exitPrice: number,
  reason: string,
): Promise<SimPositionRow | null> {
  return db.transaction(async (tx) => {
    const [pos] = await tx
      .select()
      .from(simPosition)
      .where(and(eq(simPosition.id, positionId), eq(simPosition.accountId, accountId), eq(simPosition.status, 'open')))
      .for('update')
    if (!pos) return null

    const pnl = positionPnl(pos, exitPrice)
    const [row] = await tx
      .update(simPosition)
      .set({
        status: 'closed',
        exitPrice: String(exitPrice),
        pnlUsd: String(pnl),
        closedAt: new Date(),
        closeReason: reason.slice(0, 16),
      })
      .where(eq(simPosition.id, pos.id))
      .returning()
    const credit = Math.max(0, Number(pos.stakeUsd) + pnl)
    await tx
      .update(simAccount)
      .set({ cash: sql`${simAccount.cash} + ${String(credit)}` })
      .where(eq(simAccount.id, accountId))
    return row
  })
}

export async function listOpenPositions(accountId: number): Promise<SimPositionRow[]> {
  return db
    .select()
    .from(simPosition)
    .where(and(eq(simPosition.accountId, accountId), eq(simPosition.status, 'open')))
    .orderBy(desc(simPosition.openedAt))
}

export async function listClosedPositions(accountId: number, limit = 60): Promise<SimPositionRow[]> {
  return db
    .select()
    .from(simPosition)
    .where(and(eq(simPosition.accountId, accountId), eq(simPosition.status, 'closed')))
    .orderBy(desc(simPosition.closedAt))
    .limit(limit)
}

export interface SimStats {
  trades: number
  wins: number
  losses: number
  realizedPnl: number
  bestTrade: number | null
  worstTrade: number | null
}

export async function getAccountStats(accountId: number): Promise<SimStats> {
  const rows = await db.execute<{
    trades: number
    wins: number
    losses: number
    realized: string | null
    best: string | null
    worst: string | null
  }>(sql`
    SELECT count(*)::int AS trades,
           count(*) FILTER (WHERE pnl_usd > 0)::int AS wins,
           count(*) FILTER (WHERE pnl_usd < 0)::int AS losses,
           sum(pnl_usd) AS realized,
           max(pnl_usd) AS best,
           min(pnl_usd) AS worst
    FROM sim_position
    WHERE account_id = ${accountId} AND status = 'closed'
  `)
  const r = rows[0]
  return {
    trades: r?.trades ?? 0,
    wins: r?.wins ?? 0,
    losses: r?.losses ?? 0,
    realizedPnl: Number(r?.realized ?? 0),
    bestTrade: r?.best != null ? Number(r.best) : null,
    worstTrade: r?.worst != null ? Number(r.worst) : null,
  }
}

// ---------------------------------------------------------------------------
// Desk AI
// ---------------------------------------------------------------------------

export async function recordDeskRun(input: {
  accountId: number
  status: 'done' | 'failed'
  turns: unknown
  signals: unknown
  decision?: unknown
  executed?: unknown
  error?: string | null
}): Promise<number> {
  const [row] = await db
    .insert(simDeskRun)
    .values({
      accountId: input.accountId,
      status: input.status,
      turns: input.turns ?? [],
      signals: input.signals ?? [],
      decision: input.decision ?? null,
      executed: input.executed ?? [],
      error: input.error ? input.error.slice(0, 600) : null,
    })
    .returning({ id: simDeskRun.id })
  return row.id
}

export async function updateDeskRunExecuted(runId: number, executed: unknown): Promise<void> {
  await db.update(simDeskRun).set({ executed }).where(eq(simDeskRun.id, runId))
}

export async function listDeskRuns(accountId: number, limit = 6) {
  return db
    .select()
    .from(simDeskRun)
    .where(eq(simDeskRun.accountId, accountId))
    .orderBy(desc(simDeskRun.createdAt))
    .limit(limit)
}
