/**
 * Penyimpanan rapat project: laporan berkala, peringatan mendesak, dan buku kas.
 *
 * Tiga tabel baru, dibuat saat pertama dibutuhkan dengan DDL `IF NOT EXISTS`
 * seperti `visit_log` dan `market_news` — tidak ada tabel lama yang diubah,
 * jadi tidak ada kueri lain yang bisa ikut rusak.
 *
 * Buku kas sengaja menyimpan rupiah sebagai bilangan bulat (BIGINT), bukan
 * desimal: tidak ada sen di rupiah, dan pecahan pada uang adalah sumber selisih
 * yang paling sulit dilacak.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { LlmFailover } from '@/lib/ai/types'
import { createIfMissing, ensureColumn } from '@/lib/db/create-if-missing'
import type { VoteResult } from './voting'

export type ReportPeriod = 'harian' | 'mingguan' | 'bulanan' | 'tahunan'
export const REPORT_PERIODS: readonly ReportPeriod[] = ['harian', 'mingguan', 'bulanan', 'tahunan']

/** Panjang rentang rapat dadakan (hari), berakhir saat rapat dibuka. */
export const MANUAL_PERIOD_DAYS: Record<ReportPeriod, number> = { harian: 1, mingguan: 7, bulanan: 30, tahunan: 365 }

export type IssueSeverity = 'mendesak' | 'perhatian'

export interface ProjectIssue {
  /** Kunci stabil, mis. "job-gagal:ingest-idx-daily". Peringatan yang sama tidak digandakan. */
  key: string
  severity: IssueSeverity
  title: string
  detail: string
}

export interface MeetingMinute {
  role: string
  title: string
  providerId: string
  model: string
  latencyMs: number
  failovers: LlmFailover[]
  content: string
}

export interface ProjectReportRow {
  id: number
  period: ReportPeriod
  trigger: 'jadwal' | 'manual'
  periodStart: string
  periodEnd: string
  status: 'selesai' | 'tanpa-rapat'
  metrics: Record<string, unknown>
  issues: ProjectIssue[]
  minutes: MeetingMinute[]
  actionItems: string[]
  note: string | null
  /** Daftar hadir anggota dan hasil voting usulan. Null untuk rapat tanpa usulan baru. */
  votes: VoteResult | null
  createdAt: string
}

let ready: Promise<void> | null = null

export function ensureProjectTables(): Promise<void> {
  ready ??= createIfMissing(['project_report', 'project_alert', 'project_ledger'], sql`
      CREATE TABLE IF NOT EXISTS project_report (
        id SERIAL PRIMARY KEY,
        period VARCHAR(16) NOT NULL,
        trigger VARCHAR(16) NOT NULL DEFAULT 'jadwal',
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        status VARCHAR(16) NOT NULL,
        metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        issues JSONB NOT NULL DEFAULT '[]'::jsonb,
        minutes JSONB NOT NULL DEFAULT '[]'::jsonb,
        action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
        note TEXT,
        votes JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS project_report_period_idx ON project_report (period, period_start DESC);

      CREATE TABLE IF NOT EXISTS project_alert (
        id SERIAL PRIMARY KEY,
        alert_key VARCHAR(128) NOT NULL,
        severity VARCHAR(16) NOT NULL,
        title VARCHAR(200) NOT NULL,
        detail TEXT NOT NULL,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        acknowledged_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS project_alert_open_uq ON project_alert (alert_key) WHERE resolved_at IS NULL;

      CREATE TABLE IF NOT EXISTS project_ledger (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        kind VARCHAR(8) NOT NULL,
        category VARCHAR(48) NOT NULL,
        amount BIGINT NOT NULL CHECK (amount > 0),
        description VARCHAR(255) NOT NULL DEFAULT '',
        source VARCHAR(16) NOT NULL DEFAULT 'manual',
        ref VARCHAR(96),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS project_ledger_ref_uq ON project_ledger (ref) WHERE ref IS NOT NULL;
      CREATE INDEX IF NOT EXISTS project_ledger_date_idx ON project_ledger (entry_date);
    `)
    .then(ensureAlertAckColumn)
    .then(() => ensureColumn('project_report', 'votes', 'JSONB'))
    .catch((err) => {
      ready = null
      throw err
    })
  return ready
}

/**
 * `acknowledged_at` datang sesudah tabelnya sudah terpasang di produksi, jadi
 * DDL pembuatan di atas tidak lagi dijalankan di sana. Kolomnya ditambahkan
 * terpisah, didahului cek katalog yang murah.
 */
async function ensureAlertAckColumn(): Promise<void> {
  const [state] = await db.execute<{ ready: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'project_alert' AND column_name = 'acknowledged_at'
    ) AS ready
  `)
  if (!state?.ready) await db.execute(sql`ALTER TABLE project_alert ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`)
}

// --- Laporan ---------------------------------------------------------------

type ReportDbRow = {
  id: number
  period: ReportPeriod
  trigger: 'jadwal' | 'manual'
  period_start: Date | string
  period_end: Date | string
  status: 'selesai' | 'tanpa-rapat'
  metrics: Record<string, unknown>
  issues: ProjectIssue[]
  minutes: MeetingMinute[]
  action_items: string[]
  note: string | null
  votes: VoteResult | null
  created_at: Date | string
}

function toReport(r: ReportDbRow): ProjectReportRow {
  return {
    id: r.id,
    period: r.period,
    trigger: r.trigger,
    periodStart: new Date(r.period_start).toISOString(),
    periodEnd: new Date(r.period_end).toISOString(),
    status: r.status,
    metrics: r.metrics ?? {},
    issues: r.issues ?? [],
    minutes: r.minutes ?? [],
    actionItems: r.action_items ?? [],
    note: r.note,
    votes: r.votes ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  }
}

export async function saveReport(report: Omit<ProjectReportRow, 'id' | 'createdAt'>): Promise<number> {
  await ensureProjectTables()
  const [row] = await db.execute<{ id: number }>(sql`
    INSERT INTO project_report
      (period, trigger, period_start, period_end, status, metrics, issues, minutes, action_items, note, votes)
    VALUES (
      ${report.period}, ${report.trigger}, ${report.periodStart}::timestamptz, ${report.periodEnd}::timestamptz,
      ${report.status}, ${JSON.stringify(report.metrics)}::jsonb, ${JSON.stringify(report.issues)}::jsonb,
      ${JSON.stringify(report.minutes)}::jsonb, ${JSON.stringify(report.actionItems)}::jsonb, ${report.note},
      ${report.votes ? JSON.stringify(report.votes) : null}::jsonb
    )
    RETURNING id
  `)
  return row.id
}

/** Laporan terjadwal untuk periode yang sama sudah ada — job yang dikirim ulang tidak menggelar rapat kedua. */
export async function scheduledReportExists(period: ReportPeriod, periodStart: Date): Promise<boolean> {
  await ensureProjectTables()
  const [row] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM project_report
      WHERE period = ${period} AND trigger = 'jadwal' AND period_start = ${periodStart.toISOString()}::timestamptz
    ) AS exists
  `)
  return !!row?.exists
}

/** Rapat dadakan yang sudah digelar hari ini (WIB). */
export async function countManualReportsToday(): Promise<number> {
  await ensureProjectTables()
  const [r] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM project_report
    WHERE trigger = 'manual'
      AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
  `)
  return Number(r?.n ?? 0)
}

/** Laporan terjadwal terakhir periode ini tidak berisi masalah apa pun. */
export async function previousScheduledWasQuiet(period: ReportPeriod): Promise<boolean> {
  await ensureProjectTables()
  const [r] = await db.execute<{ quiet: boolean }>(sql`
    SELECT jsonb_array_length(issues) = 0 AS quiet FROM project_report
    WHERE period = ${period} AND trigger = 'jadwal'
    ORDER BY period_start DESC LIMIT 1
  `)
  return !!r?.quiet
}

export async function listReports(period: ReportPeriod | null, limit = 30): Promise<ProjectReportRow[]> {
  await ensureProjectTables()
  const rows = await db.execute<ReportDbRow>(sql`
    SELECT * FROM project_report
    ${period ? sql`WHERE period = ${period}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)
  return rows.map(toReport)
}

export async function getReport(id: number): Promise<ProjectReportRow | null> {
  await ensureProjectTables()
  const [row] = await db.execute<ReportDbRow>(sql`SELECT * FROM project_report WHERE id = ${id}`)
  return row ? toReport(row) : null
}

// --- Peringatan --------------------------------------------------------------

export interface ProjectAlertRow {
  id: number
  key: string
  severity: IssueSeverity
  title: string
  detail: string
  firstSeen: string
  lastSeen: string
  resolvedAt: string | null
  /** Kapan admin menandainya sudah dilihat. Berlaku untuk semua admin sekaligus. */
  acknowledgedAt: string | null
}

/**
 * Samakan peringatan terbuka dengan temuan terbaru: yang masih ada diperbarui,
 * yang baru dibuka, yang sudah tidak muncul ditutup. Mengembalikan peringatan
 * yang BARU dibuka pada putaran ini.
 */
export async function syncAlerts(issues: ProjectIssue[]): Promise<ProjectIssue[]> {
  await ensureProjectTables()
  const open = await db.execute<{ alert_key: string }>(sql`SELECT alert_key FROM project_alert WHERE resolved_at IS NULL`)
  const openKeys = new Set(open.map((r) => r.alert_key))
  const currentKeys = new Set(issues.map((i) => i.key))

  const fresh: ProjectIssue[] = []
  for (const issue of issues) {
    if (openKeys.has(issue.key)) {
      await db.execute(sql`
        UPDATE project_alert SET last_seen = NOW(), title = ${issue.title}, detail = ${issue.detail},
          -- Naik dari "perhatian" ke "mendesak" berarti kabar baru: lonceng menyala lagi.
          acknowledged_at = CASE WHEN severity <> 'mendesak' AND ${issue.severity} = 'mendesak' THEN NULL ELSE acknowledged_at END,
          severity = ${issue.severity}
        WHERE alert_key = ${issue.key} AND resolved_at IS NULL
      `)
    } else {
      await db.execute(sql`
        INSERT INTO project_alert (alert_key, severity, title, detail)
        VALUES (${issue.key.slice(0, 128)}, ${issue.severity}, ${issue.title.slice(0, 200)}, ${issue.detail})
        ON CONFLICT DO NOTHING
      `)
      fresh.push(issue)
    }
  }

  const cleared = [...openKeys].filter((k) => !currentKeys.has(k))
  if (cleared.length) {
    await db.execute(sql`
      UPDATE project_alert SET resolved_at = NOW()
      WHERE resolved_at IS NULL AND alert_key IN (${sql.join(cleared.map((k) => sql`${k}`), sql`, `)})
    `)
  }
  return fresh
}

export async function listAlerts(includeResolved = false, limit = 50): Promise<ProjectAlertRow[]> {
  await ensureProjectTables()
  const rows = await db.execute<{
    id: number
    alert_key: string
    severity: IssueSeverity
    title: string
    detail: string
    first_seen: Date | string
    last_seen: Date | string
    resolved_at: Date | string | null
    acknowledged_at: Date | string | null
  }>(sql`
    SELECT * FROM project_alert
    ${includeResolved ? sql`` : sql`WHERE resolved_at IS NULL`}
    ORDER BY (resolved_at IS NULL) DESC, (severity = 'mendesak') DESC, last_seen DESC
    LIMIT ${limit}
  `)
  return rows.map((r) => ({
    id: r.id,
    key: r.alert_key,
    severity: r.severity,
    title: r.title,
    detail: r.detail,
    firstSeen: new Date(r.first_seen).toISOString(),
    lastSeen: new Date(r.last_seen).toISOString(),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
  }))
}

export interface AlertSummary {
  /** Masalah mendesak yang masih terbuka. */
  urgent: number
  open: number
  /** Terbuka dan belum ditandai dilihat — angka di lonceng. */
  unseen: number
  alerts: ProjectAlertRow[]
  /** Usulan rapat yang menunggu keputusan owner (diisi rute API, bukan `alertSummary`). */
  pendingProposals?: number
}

/** Ringkasan untuk lonceng, lencana sidebar, dan spanduk Ringkasan Admin. */
export async function alertSummary(): Promise<AlertSummary> {
  const alerts = await listAlerts(false, 30)
  return {
    urgent: alerts.filter((a) => a.severity === 'mendesak').length,
    open: alerts.length,
    unseen: alerts.filter((a) => !a.acknowledgedAt).length,
    alerts,
  }
}

/** Tandai peringatan terbuka sudah dilihat; tanpa `ids`, semuanya. */
export async function acknowledgeAlerts(ids?: number[]): Promise<number> {
  await ensureProjectTables()
  if (ids && ids.length === 0) return 0
  const rows = await db.execute<{ id: number }>(sql`
    UPDATE project_alert SET acknowledged_at = NOW()
    WHERE resolved_at IS NULL AND acknowledged_at IS NULL
      ${ids ? sql`AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})` : sql``}
    RETURNING id
  `)
  return rows.length
}

// --- Buku kas ----------------------------------------------------------------

export type LedgerKind = 'masuk' | 'keluar'

export const LEDGER_CATEGORIES: Record<LedgerKind, string[]> = {
  masuk: ['premium', 'donasi', 'iklan', 'modal', 'lainnya'],
  keluar: ['hosting', 'domain', 'api-ai', 'api-data', 'database', 'email', 'iklan', 'gaji', 'lainnya'],
}

export interface LedgerEntry {
  id: number
  entryDate: string
  kind: LedgerKind
  category: string
  amount: number
  description: string
  source: 'manual' | 'premium'
  ref: string | null
  createdAt: string
}

export async function addLedgerEntry(entry: {
  entryDate: string
  kind: LedgerKind
  category: string
  amount: number
  description: string
}): Promise<number> {
  await ensureProjectTables()
  const [row] = await db.execute<{ id: number }>(sql`
    INSERT INTO project_ledger (entry_date, kind, category, amount, description, source)
    VALUES (${entry.entryDate}::date, ${entry.kind}, ${entry.category}, ${Math.round(entry.amount)}, ${entry.description.slice(0, 255)}, 'manual')
    RETURNING id
  `)
  return row.id
}

/** Hanya catatan manual yang boleh dihapus; pemasukan Premium mengikuti data pembayaran. */
export async function deleteLedgerEntry(id: number): Promise<boolean> {
  await ensureProjectTables()
  const rows = await db.execute<{ id: number }>(sql`
    DELETE FROM project_ledger WHERE id = ${id} AND source = 'manual' RETURNING id
  `)
  return rows.length > 0
}

/**
 * Salin pembayaran Premium yang lunas ke buku kas sebagai pemasukan. Idempoten
 * lewat `ref`, jadi aman dipanggil setiap kali halaman atau laporan dibuka.
 */
export async function syncPremiumIncome(): Promise<number> {
  await ensureProjectTables()
  try {
    const rows = await db.execute<{ id: number }>(sql`
      INSERT INTO project_ledger (entry_date, kind, category, amount, description, source, ref)
      SELECT (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'Asia/Jakarta')::date, 'masuk', 'premium', o.amount,
             LEFT('Premium ' || o.plan_label || ' (' || o.merchant_ref || ')', 255), 'premium', 'premium:' || o.merchant_ref
      FROM premium_order o
      WHERE o.status = 'PAID' AND o.amount > 0
      ON CONFLICT (ref) WHERE ref IS NOT NULL DO NOTHING
      RETURNING id
    `)
    return rows.length
  } catch (err) {
    // Tabel premium_order belum ada di basis data yang belum pernah menjual apa pun.
    console.warn('[Ledger] sinkron Premium dilewati:', err instanceof Error ? err.message : err)
    return 0
  }
}

export async function listLedger(options: { from?: string; to?: string; limit?: number } = {}): Promise<LedgerEntry[]> {
  await ensureProjectTables()
  const rows = await db.execute<{
    id: number
    entry_date: string | Date
    kind: LedgerKind
    category: string
    amount: string | number
    description: string
    source: 'manual' | 'premium'
    ref: string | null
    created_at: Date | string
  }>(sql`
    SELECT * FROM project_ledger
    WHERE TRUE
      ${options.from ? sql`AND entry_date >= ${options.from}::date` : sql``}
      ${options.to ? sql`AND entry_date <= ${options.to}::date` : sql``}
    ORDER BY entry_date DESC, id DESC
    LIMIT ${options.limit ?? 500}
  `)
  return rows.map((r) => ({
    id: r.id,
    entryDate: typeof r.entry_date === 'string' ? r.entry_date.slice(0, 10) : r.entry_date.toISOString().slice(0, 10),
    kind: r.kind,
    category: r.category,
    amount: Number(r.amount),
    description: r.description,
    source: r.source,
    ref: r.ref,
    createdAt: new Date(r.created_at).toISOString(),
  }))
}

export interface LedgerMonth {
  month: string
  masuk: number
  keluar: number
}

/** Ringkasan per bulan (WIB), terbaru dulu. */
export async function ledgerByMonth(months = 24): Promise<LedgerMonth[]> {
  await ensureProjectTables()
  const rows = await db.execute<{ month: string; masuk: string | number; keluar: string | number }>(sql`
    SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS month,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'masuk'), 0) AS masuk,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'keluar'), 0) AS keluar
    FROM project_ledger
    WHERE entry_date >= (date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - (${months - 1} || ' months')::interval)::date
    GROUP BY 1 ORDER BY 1 DESC
  `)
  return rows.map((r) => ({ month: r.month, masuk: Number(r.masuk), keluar: Number(r.keluar) }))
}

/** Tanggal kalender WIB (YYYY-MM-DD) dari sebuah instan. */
export function wibDate(at: Date): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

/** Rentang [from, to) dalam tanggal WIB inklusif. */
export async function ledgerTotals(from: Date, to: Date) {
  await ensureProjectTables()
  const rows = await db.execute<{ kind: LedgerKind; category: string; total: string | number }>(sql`
    SELECT kind, category, SUM(amount) AS total
    FROM project_ledger
    WHERE entry_date >= ${wibDate(from)}::date AND entry_date <= ${wibDate(new Date(to.getTime() - 1))}::date
    GROUP BY 1, 2 ORDER BY 3 DESC
  `)
  const [balance] = await db.execute<{ saldo: string | number }>(sql`
    SELECT COALESCE(SUM(CASE WHEN kind = 'masuk' THEN amount ELSE -amount END), 0) AS saldo FROM project_ledger
  `)
  const byKind = (k: LedgerKind) => rows.filter((r) => r.kind === k).reduce((n, r) => n + Number(r.total), 0)
  return {
    masuk: byKind('masuk'),
    keluar: byKind('keluar'),
    saldoKeseluruhan: Number(balance?.saldo ?? 0),
    rincian: rows.map((r) => ({ jenis: r.kind, kategori: r.category, jumlah: Number(r.total) })),
  }
}
