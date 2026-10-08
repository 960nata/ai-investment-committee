/**
 * Tabel simulator trading.
 *
 * Sengaja di luar `schema.ts`: tabel ini dibuat lazy oleh
 * `ensureSimulatorTables()` (pola yang sama dengan Premium dan Donasi), dan
 * berkas ini hanya memberi kueri drizzle bentuk bertipe. Uang di sini uang
 * mainan — tidak ada satu kolom pun yang tersambung ke pembayaran.
 *
 * Pemilik dompet disimpan sebagai `owner_key`, bukan id pengguna: admin yang
 * masuk lewat PIN tidak punya baris `app_user`, tetapi tetap butuh dompetnya
 * sendiri. `u:<id>` untuk akun, `admin` untuk sesi PIN.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

export const simSettings = pgTable('sim_settings', {
  id: integer('id').primaryKey(),
  premiumEnabled: boolean('premium_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const simAccount = pgTable(
  'sim_account',
  {
    id: serial('id').primaryKey(),
    ownerKey: varchar('owner_key', { length: 40 }).notNull(),
    mode: varchar('mode', { length: 12 }).notNull(),
    cash: numeric('cash', { precision: 18, scale: 6 }).notNull(),
    startingBalance: numeric('starting_balance', { precision: 18, scale: 2 }).notNull(),
    resetCount: integer('reset_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull().defaultNow(),
    /** Autopilot server: desk dijalankan cron walau halaman tidak dibuka. */
    autopilot: boolean('autopilot').notNull().default(false),
    /** Kunci sidang: dua cron yang tumpang-tindih tidak bersidang di dompet yang sama. */
    lastDeskAt: timestamp('last_desk_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('sim_account_owner_mode_uq').on(t.ownerKey, t.mode)],
)

export const simPosition = pgTable(
  'sim_position',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id').notNull(),
    market: varchar('market', { length: 8 }).notNull(),
    symbol: varchar('symbol', { length: 24 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    /** 'long' | 'short' untuk investasi, 'up' | 'down' untuk binary. */
    side: varchar('side', { length: 8 }).notNull(),
    stakeUsd: numeric('stake_usd', { precision: 18, scale: 6 }).notNull(),
    /** Kurs USD per satu unit mata uang instrumen saat posisi dibuka. */
    fxToUsd: numeric('fx_to_usd', { precision: 20, scale: 10 }).notNull(),
    entryPrice: numeric('entry_price', { precision: 24, scale: 10 }).notNull(),
    stopLoss: numeric('stop_loss', { precision: 24, scale: 10 }),
    takeProfit: numeric('take_profit', { precision: 24, scale: 10 }),
    payout: numeric('payout', { precision: 6, scale: 4 }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** 'open' | 'closed' */
    status: varchar('status', { length: 8 }).notNull().default('open'),
    exitPrice: numeric('exit_price', { precision: 24, scale: 10 }),
    pnlUsd: numeric('pnl_usd', { precision: 18, scale: 6 }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** 'manual' | 'stop_loss' | 'take_profit' | 'expired' | 'ai' | 'settled' */
    closeReason: varchar('close_reason', { length: 16 }),
    /** 'manual' | 'ai' */
    openedBy: varchar('opened_by', { length: 8 }).notNull(),
    deskRunId: integer('desk_run_id'),
    note: varchar('note', { length: 400 }),
  },
  (t) => [
    index('sim_position_account_idx').on(t.accountId, t.status),
    index('sim_position_closed_idx').on(t.accountId, t.closedAt),
  ],
)

export const simDeskRun = pgTable(
  'sim_desk_run',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id').notNull(),
    /** 'done' | 'failed' */
    status: varchar('status', { length: 8 }).notNull(),
    turns: jsonb('turns').notNull().default([]),
    signals: jsonb('signals').notNull().default([]),
    decision: jsonb('decision'),
    executed: jsonb('executed').notNull().default([]),
    error: varchar('error', { length: 600 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sim_desk_run_account_idx').on(t.accountId, t.createdAt)],
)

export type SimAccountRow = typeof simAccount.$inferSelect
export type SimPositionRow = typeof simPosition.$inferSelect
export type SimDeskRunRow = typeof simDeskRun.$inferSelect
