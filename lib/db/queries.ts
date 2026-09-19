/**
 * Query database
 *
 * Satu-satunya tempat kode aplikasi menyentuh Drizzle. Semua penulisan memakai
 * INSERT ... ON CONFLICT DO UPDATE supaya worker boleh dijalankan ulang tanpa
 * menggandakan baris — aturan keandalan nomor satu di blueprint.
 *
 * Nilai numerik (harga, volume) keluar dari driver sebagai string. Itu disengaja:
 * `numeric` Postgres tidak muat di float64 tanpa galat pembulatan, jadi konversi
 * ke number hanya dilakukan di lapisan tampilan, tidak di sini.
 */

import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from './client'
import {
  agentMessage,
  agentSession,
  candleDaily,
  dataSourceHealth,
  featureDaily,
  fromDbMarket,
  ingestQuarantine,
  instrument,
  jobRun,
  jobSchedule,
  symbolAlias,
  toDbMarket,
  type AgentVerdict,
  type DbMarket,
  type MarketCode,
} from './schema'

// ---------------------------------------------------------------------------
// Instrument
// ---------------------------------------------------------------------------

export interface InstrumentView {
  id: number
  symbol: string
  name: string
  market: MarketCode
  currency: string
  sector: string | null
  isActive: boolean
  listedAt: string | null
  delistedAt: string | null
}

function toInstrumentView(row: typeof instrument.$inferSelect): InstrumentView {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    market: fromDbMarket(row.market),
    currency: row.currency,
    sector: row.sector,
    isActive: row.isActive,
    listedAt: row.listedAt,
    delistedAt: row.delistedAt,
  }
}

export async function getInstrumentBySymbol(
  market: MarketCode,
  symbol: string,
): Promise<InstrumentView | null> {
  const rows = await db
    .select()
    .from(instrument)
    .where(and(eq(instrument.market, toDbMarket(market)), eq(instrument.symbol, symbol)))
    .limit(1)
  return rows[0] ? toInstrumentView(rows[0]) : null
}

export async function getInstrumentById(id: number): Promise<InstrumentView | null> {
  if (!Number.isInteger(id)) return null
  const rows = await db.select().from(instrument).where(eq(instrument.id, id)).limit(1)
  return rows[0] ? toInstrumentView(rows[0]) : null
}

/**
 * Instrumen delisting sengaja tetap ikut terdaftar saat `includeDelisted` true —
 * backtest yang hanya melihat emiten yang masih tercatat hari ini kena
 * survivorship bias.
 */
export async function listInstruments(
  market?: MarketCode,
  options: { includeDelisted?: boolean } = {},
): Promise<InstrumentView[]> {
  const filters = []
  if (market) filters.push(eq(instrument.market, toDbMarket(market)))
  if (!options.includeDelisted) filters.push(eq(instrument.isActive, true))

  const rows = await db
    .select()
    .from(instrument)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(instrument.symbol)

  return rows.map(toInstrumentView)
}

export async function upsertInstrument(data: {
  symbol: string
  name: string
  market: MarketCode
  currency: string
  sector?: string | null
  listedAt?: string | null
}): Promise<InstrumentView> {
  const rows = await db
    .insert(instrument)
    .values({
      symbol: data.symbol,
      name: data.name,
      market: toDbMarket(data.market),
      currency: data.currency,
      sector: data.sector ?? null,
      listedAt: data.listedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [instrument.market, instrument.symbol],
      set: {
        name: sql`excluded.name`,
        currency: sql`excluded.currency`,
        sector: sql`excluded.sector`,
      },
    })
    .returning()

  return toInstrumentView(rows[0])
}

// ---------------------------------------------------------------------------
// Symbol alias
// ---------------------------------------------------------------------------

export async function upsertSymbolAlias(data: {
  instrumentId: number
  sourceId: string
  alias: string
}): Promise<void> {
  await db
    .insert(symbolAlias)
    .values(data)
    .onConflictDoUpdate({
      target: [symbolAlias.instrumentId, symbolAlias.sourceId],
      set: { alias: sql`excluded.alias` },
    })
}

export async function resolveAlias(sourceId: string, alias: string) {
  const rows = await db
    .select()
    .from(symbolAlias)
    .where(and(eq(symbolAlias.sourceId, sourceId), eq(symbolAlias.alias, alias)))
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Candle harian
// ---------------------------------------------------------------------------

export interface CandleInput {
  instrumentId: number
  date: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  adjClose?: string | null
  sourceId: string
}

/**
 * Kunci konflik (instrument_id, date) sesuai primary key tabel. `source_id` ikut
 * ditimpa supaya ketahuan adaptor mana yang terakhir mengisi baris itu — tanpa
 * kolom ini, pergantian sumber diam-diam mengubah hasil backtest.
 */
export async function upsertCandles(candles: CandleInput[]): Promise<number> {
  if (candles.length === 0) return 0

  const rows = await db
    .insert(candleDaily)
    .values(
      candles.map((c) => ({
        instrumentId: c.instrumentId,
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        adjClose: c.adjClose ?? null,
        sourceId: c.sourceId,
        fetchedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [candleDaily.instrumentId, candleDaily.date],
      set: {
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        volume: sql`excluded.volume`,
        adjClose: sql`excluded.adj_close`,
        sourceId: sql`excluded.source_id`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    })
    .returning({ date: candleDaily.date })

  return rows.length
}

export async function getCandles(instrumentId: number, from: string, to: string) {
  return db
    .select()
    .from(candleDaily)
    .where(
      and(
        eq(candleDaily.instrumentId, instrumentId),
        gte(candleDaily.date, from),
        lte(candleDaily.date, to),
      ),
    )
    .orderBy(candleDaily.date)
}

export async function getLatestCandle(instrumentId: number) {
  const rows = await db
    .select()
    .from(candleDaily)
    .where(eq(candleDaily.instrumentId, instrumentId))
    .orderBy(desc(candleDaily.date))
    .limit(1)
  return rows[0] ?? null
}

export async function getCandleCount(instrumentId?: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candleDaily)
    .where(instrumentId === undefined ? undefined : eq(candleDaily.instrumentId, instrumentId))
  return rows[0]?.count ?? 0
}

/** Jumlah candle per instrumen, untuk tabel daftar instrumen. */
export async function getCandleCountsByInstrument(
  instrumentIds: number[],
): Promise<Map<number, { count: number; latestDate: string | null }>> {
  const result = new Map<number, { count: number; latestDate: string | null }>()
  if (instrumentIds.length === 0) return result

  const rows = await db
    .select({
      instrumentId: candleDaily.instrumentId,
      count: sql<number>`count(*)::int`,
      latestDate: sql<string | null>`max(${candleDaily.date})`,
    })
    .from(candleDaily)
    .where(inArray(candleDaily.instrumentId, instrumentIds))
    .groupBy(candleDaily.instrumentId)

  for (const row of rows) {
    result.set(row.instrumentId, { count: row.count, latestDate: row.latestDate })
  }
  return result
}

// ---------------------------------------------------------------------------
// Kesehatan sumber data
// ---------------------------------------------------------------------------

/** Registry memakai 'down'; kolom menyimpannya sebagai 'dead'. */
export type AdapterHealthStatus = 'healthy' | 'degraded' | 'down'

export async function recordAdapterHealth(data: {
  sourceId: string
  status: AdapterHealthStatus
  consecutiveFailures: number
  lastError?: string | null
}): Promise<void> {
  const status = data.status === 'down' ? 'dead' : data.status
  const now = new Date()

  await db
    .insert(dataSourceHealth)
    .values({
      sourceId: data.sourceId,
      status,
      consecutiveFailures: data.consecutiveFailures,
      lastError: data.lastError ?? null,
      lastSuccessAt: status === 'healthy' ? now : null,
      checkedAt: now,
    })
    .onConflictDoUpdate({
      target: dataSourceHealth.sourceId,
      set: {
        status: sql`excluded.status`,
        consecutiveFailures: sql`excluded.consecutive_failures`,
        lastError: sql`excluded.last_error`,
        // Sukses terakhir tidak boleh hilang saat baris ini ditimpa oleh kegagalan.
        lastSuccessAt: sql`coalesce(excluded.last_success_at, ${dataSourceHealth.lastSuccessAt})`,
        checkedAt: sql`excluded.checked_at`,
      },
    })
}

export async function listAdapterHealth() {
  return db.select().from(dataSourceHealth).orderBy(dataSourceHealth.sourceId)
}

// ---------------------------------------------------------------------------
// Jadwal & jalannya job
// ---------------------------------------------------------------------------

export type JobScheduleRow = typeof jobSchedule.$inferSelect

export async function listEnabledSchedules(): Promise<JobScheduleRow[]> {
  return db.select().from(jobSchedule).where(eq(jobSchedule.enabled, true))
}

export async function listSchedules(): Promise<JobScheduleRow[]> {
  return db.select().from(jobSchedule).orderBy(jobSchedule.jobName)
}

export async function markScheduleRan(jobName: string, at: Date): Promise<void> {
  await db.update(jobSchedule).set({ lastRunAt: at }).where(eq(jobSchedule.jobName, jobName))
}

export async function upsertSchedule(data: {
  jobName: string
  hoursOfDay: number[]
  timezone: string
  tradingDaysOnly?: boolean
  market?: MarketCode | null
  enabled?: boolean
}): Promise<void> {
  await db
    .insert(jobSchedule)
    .values({
      jobName: data.jobName,
      hoursOfDay: data.hoursOfDay,
      timezone: data.timezone,
      tradingDaysOnly: data.tradingDaysOnly ?? false,
      market: data.market ? toDbMarket(data.market) : null,
      enabled: data.enabled ?? true,
    })
    .onConflictDoUpdate({
      target: jobSchedule.jobName,
      set: {
        hoursOfDay: sql`excluded.hours_of_day`,
        timezone: sql`excluded.timezone`,
        tradingDaysOnly: sql`excluded.trading_days_only`,
        market: sql`excluded.market`,
        enabled: sql`excluded.enabled`,
      },
    })
}

export type JobRunStatus = 'running' | 'success' | 'failed' | 'partial'

/**
 * Satu baris per (job, batch). QStash boleh mengirim ulang batch yang sama
 * berkali-kali; yang bertambah cuma pembaruan pada baris itu, bukan baris baru.
 */
export async function upsertJobRun(data: {
  jobName: string
  batchKey: string
  status: JobRunStatus
  itemsProcessed?: number
  itemsFailed?: number
  cursor?: Record<string, unknown> | null
  stats?: Record<string, unknown> | null
  error?: string | null
}): Promise<number> {
  const finished = data.status !== 'running' ? new Date() : null

  const rows = await db
    .insert(jobRun)
    .values({
      jobName: data.jobName,
      batchKey: data.batchKey,
      status: data.status,
      itemsProcessed: data.itemsProcessed ?? 0,
      itemsFailed: data.itemsFailed ?? 0,
      cursor: data.cursor ?? null,
      stats: data.stats ?? null,
      error: data.error ?? null,
      startedAt: new Date(),
      finishedAt: finished,
    })
    .onConflictDoUpdate({
      target: [jobRun.jobName, jobRun.batchKey],
      set: {
        status: sql`excluded.status`,
        itemsProcessed: sql`excluded.items_processed`,
        itemsFailed: sql`excluded.items_failed`,
        cursor: sql`excluded.cursor`,
        stats: sql`excluded.stats`,
        error: sql`excluded.error`,
        finishedAt: sql`excluded.finished_at`,
      },
    })
    .returning({ id: jobRun.id })

  return rows[0].id
}

export async function listRecentJobRuns(limit = 20) {
  return db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(limit)
}

// ---------------------------------------------------------------------------
// Karantina
// ---------------------------------------------------------------------------

/**
 * Baris yang gagal uji kualitas disimpan utuh, bukan dibuang — sebagian besar
 * anomali harga ternyata aksi korporasi yang belum terekam.
 */
export async function quarantineRow(data: {
  instrumentId?: number | null
  sourceId: string
  payload: unknown
  reason: string
}): Promise<void> {
  await db.insert(ingestQuarantine).values({
    instrumentId: data.instrumentId ?? null,
    sourceId: data.sourceId,
    payload: data.payload as Record<string, unknown>,
    reason: data.reason,
  })
}

export async function countQuarantined(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ingestQuarantine)
  return rows[0]?.count ?? 0
}

export async function listQuarantined(limit = 20) {
  return db
    .select()
    .from(ingestQuarantine)
    .orderBy(desc(ingestQuarantine.createdAt))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Ringkasan dashboard
// ---------------------------------------------------------------------------

/** Ingest crypto jalan tiap jam; lewat tiga jam berarti ada yang berhenti. */
export const STALE_AFTER_MINUTES = 180

export type Freshness = 'fresh' | 'stale' | 'empty'

export interface DashboardStats {
  instrumentCount: number
  candleCount: number
  quarantinedCount: number
  latestCandleDate: string | null
  latestFetchedAt: string | null
  /** Umur data dalam menit, dihitung di sini supaya komponen tidak perlu jam. */
  ageMinutes: number | null
  freshness: Freshness
  perMarket: { market: MarketCode; instruments: number }[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [instrumentRows, candleRows, quarantinedCount] = await Promise.all([
    db
      .select({ market: instrument.market, count: sql<number>`count(*)::int` })
      .from(instrument)
      .where(eq(instrument.isActive, true))
      .groupBy(instrument.market),
    db
      .select({
        count: sql<number>`count(*)::int`,
        maxDate: sql<string | null>`max(${candleDaily.date})`,
        maxFetchedAt: sql<string | null>`max(${candleDaily.fetchedAt})`,
      })
      .from(candleDaily),
    countQuarantined(),
  ])

  const latestFetchedAt = candleRows[0]?.maxFetchedAt ?? null

  // Umur data dihitung di lapisan query, bukan saat render. Komponen yang
  // memanggil jam sendiri menghasilkan keluaran yang berubah tiap render.
  const ageMinutes = latestFetchedAt
    ? Math.floor((Date.now() - new Date(latestFetchedAt).getTime()) / 60_000)
    : null

  return {
    instrumentCount: instrumentRows.reduce((sum, r) => sum + r.count, 0),
    candleCount: candleRows[0]?.count ?? 0,
    quarantinedCount,
    latestCandleDate: candleRows[0]?.maxDate ?? null,
    latestFetchedAt,
    ageMinutes,
    freshness:
      ageMinutes === null ? 'empty' : ageMinutes > STALE_AFTER_MINUTES ? 'stale' : 'fresh',
    perMarket: instrumentRows.map((r) => ({
      market: fromDbMarket(r.market as DbMarket),
      instruments: r.count,
    })),
  }
}

export interface DataFreshness {
  latestCandleDate: string | null
  ageMinutes: number | null
  freshness: Freshness
}

/**
 * Kesegaran data saja, satu kueri.
 *
 * Bar atas muncul di tiap halaman, jadi ia tidak boleh ikut menarik seluruh
 * ringkasan dashboard hanya untuk menampilkan satu stempel waktu.
 */
export async function getDataFreshness(): Promise<DataFreshness> {
  const rows = await db
    .select({
      maxDate: sql<string | null>`max(${candleDaily.date})`,
      maxFetchedAt: sql<string | null>`max(${candleDaily.fetchedAt})`,
    })
    .from(candleDaily)

  const latestFetchedAt = rows[0]?.maxFetchedAt ?? null
  const ageMinutes = latestFetchedAt
    ? Math.floor((Date.now() - new Date(latestFetchedAt).getTime()) / 60_000)
    : null

  return {
    latestCandleDate: rows[0]?.maxDate ?? null,
    ageMinutes,
    freshness:
      ageMinutes === null ? 'empty' : ageMinutes > STALE_AFTER_MINUTES ? 'stale' : 'fresh',
  }
}

/** Ubah umur data jadi kalimat pendek untuk ditampilkan. */
export function describeAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'belum ada data'
  if (ageMinutes < 1) return 'baru saja'
  if (ageMinutes < 60) return `${ageMinutes} menit lalu`

  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours} jam lalu`

  return `${Math.floor(hours / 24)} hari lalu`
}

// ---------------------------------------------------------------------------
// Komite agen
// ---------------------------------------------------------------------------

/**
 * Buka rapat, atau ambil kembali rapat dengan kunci yang sama.
 *
 * `onConflictDoUpdate` pada `session_key` yang menjadikan seluruh rapat
 * idempoten: QStash yang mengirim ulang batch akan menemukan rapat lamanya,
 * bukan membuat rapat kedua dengan putusan yang mungkin berbeda.
 */
export async function openAgentSession(data: {
  sessionKey: string
  instrumentId: number | null
  market: MarketCode
  symbol: string
}): Promise<{ id: number; status: 'running' | 'done' | 'failed' }> {
  const rows = await db
    .insert(agentSession)
    .values({
      sessionKey: data.sessionKey,
      instrumentId: data.instrumentId,
      market: toDbMarket(data.market),
      symbol: data.symbol,
      status: 'running',
    })
    .onConflictDoUpdate({
      target: agentSession.sessionKey,
      // Kolom putusan sengaja tidak disentuh: rapat yang sudah selesai tetap
      // memegang hasilnya meski batch-nya dikirim ulang.
      set: { symbol: sql`excluded.symbol` },
    })
    .returning({ id: agentSession.id, status: agentSession.status })

  return rows[0]
}

export async function closeAgentSession(data: {
  sessionId: number
  status: 'done' | 'failed'
  verdict?: AgentVerdict | null
  confidence?: number | null
  rationale?: string | null
  factsSnapshot?: Record<string, unknown> | null
  error?: string | null
}): Promise<void> {
  await db
    .update(agentSession)
    .set({
      status: data.status,
      verdict: data.verdict ?? null,
      confidence: data.confidence ?? null,
      rationale: data.rationale ?? null,
      factsSnapshot: data.factsSnapshot ?? null,
      error: data.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(agentSession.id, data.sessionId))
}

/** Giliran yang sudah tercatat diperbarui, bukan digandakan, saat batch diulang. */
export async function recordAgentMessage(data: {
  sessionId: number
  seq: number
  agent: string
  content: string
  providerId?: string | null
  model?: string | null
  keyIndex?: number | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
}): Promise<void> {
  await db
    .insert(agentMessage)
    .values({
      sessionId: data.sessionId,
      seq: data.seq,
      agent: data.agent,
      content: data.content,
      providerId: data.providerId ?? null,
      model: data.model ?? null,
      keyIndex: data.keyIndex ?? null,
      latencyMs: data.latencyMs ?? null,
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
    })
    .onConflictDoUpdate({
      target: [agentMessage.sessionId, agentMessage.seq],
      set: {
        content: sql`excluded.content`,
        agent: sql`excluded.agent`,
        providerId: sql`excluded.provider_id`,
        model: sql`excluded.model`,
        keyIndex: sql`excluded.key_index`,
        latencyMs: sql`excluded.latency_ms`,
        inputTokens: sql`excluded.input_tokens`,
        outputTokens: sql`excluded.output_tokens`,
      },
    })
}

export async function getAgentTranscript(sessionId: number) {
  return db
    .select()
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, sessionId))
    .orderBy(agentMessage.seq)
}

export async function listAgentSessions(limit = 20) {
  return db
    .select()
    .from(agentSession)
    .orderBy(desc(agentSession.startedAt))
    .limit(limit)
}

export async function getAgentSessionByKey(sessionKey: string) {
  const rows = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.sessionKey, sessionKey))
    .limit(1)
  return rows[0] ?? null
}

/** Putusan terakhir per instrumen, untuk kartu ringkasan di dashboard. */
export async function listLatestVerdicts(limit = 20) {
  return db
    .select({
      symbol: agentSession.symbol,
      market: agentSession.market,
      verdict: agentSession.verdict,
      confidence: agentSession.confidence,
      rationale: agentSession.rationale,
      finishedAt: agentSession.finishedAt,
    })
    .from(agentSession)
    .where(eq(agentSession.status, 'done'))
    .orderBy(desc(agentSession.finishedAt))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Fitur harian
// ---------------------------------------------------------------------------

export interface FeatureInput {
  instrumentId: number
  date: string
  featureSetVersion: string
  values: Record<string, number | null>
}

/**
 * Tulis ulang baris fitur.
 *
 * Idempoten atas (instrumen, tanggal, versi). Menjalankan ulang job fitur atas
 * rentang yang sama menghasilkan isi yang sama persis, bukan baris kedua —
 * itulah yang membuat job ini aman diulang QStash berapa kali pun.
 *
 * Ditulis per potongan karena satu instrumen bisa membawa ribuan hari sekaligus,
 * dan satu pernyataan INSERT raksasa akan melewati batas parameter driver.
 */
export async function upsertFeatures(rows: FeatureInput[], chunkSize = 500): Promise<number> {
  if (rows.length === 0) return 0

  let written = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    const inserted = await db
      .insert(featureDaily)
      .values(
        slice.map((r) => ({
          instrumentId: r.instrumentId,
          date: r.date,
          featureSetVersion: r.featureSetVersion,
          values: r.values,
          computedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [featureDaily.instrumentId, featureDaily.date, featureDaily.featureSetVersion],
        set: {
          values: sql`excluded.values`,
          computedAt: sql`excluded.computed_at`,
        },
      })
      .returning({ date: featureDaily.date })

    written += inserted.length
  }

  return written
}

export async function getFeatures(
  instrumentId: number,
  featureSetVersion: string,
  from: string,
  to: string,
) {
  return db
    .select()
    .from(featureDaily)
    .where(
      and(
        eq(featureDaily.instrumentId, instrumentId),
        eq(featureDaily.featureSetVersion, featureSetVersion),
        gte(featureDaily.date, from),
        lte(featureDaily.date, to),
      ),
    )
    .orderBy(featureDaily.date)
}

export async function getLatestFeature(instrumentId: number, featureSetVersion: string) {
  const rows = await db
    .select()
    .from(featureDaily)
    .where(
      and(
        eq(featureDaily.instrumentId, instrumentId),
        eq(featureDaily.featureSetVersion, featureSetVersion),
      ),
    )
    .orderBy(desc(featureDaily.date))
    .limit(1)
  return rows[0] ?? null
}

export interface FeatureCoverage {
  featureSetVersion: string
  rows: number
  instruments: number
  latestDate: string | null
}

/** Dipakai halaman Pipeline untuk menunjukkan versi mana yang benar-benar terisi. */
export async function getFeatureCoverage(): Promise<FeatureCoverage[]> {
  const rows = await db
    .select({
      featureSetVersion: featureDaily.featureSetVersion,
      rows: sql<number>`count(*)::int`,
      instruments: sql<number>`count(distinct ${featureDaily.instrumentId})::int`,
      latestDate: sql<string | null>`max(${featureDaily.date})`,
    })
    .from(featureDaily)
    .groupBy(featureDaily.featureSetVersion)
    .orderBy(featureDaily.featureSetVersion)

  return rows
}
