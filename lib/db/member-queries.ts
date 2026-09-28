/**
 * Kueri alat investor (Beta): pengumuman, watchlist, portofolio, alert, dan
 * notifikasi pengguna.
 *
 * Tabelnya didefinisikan di `schema.ts` dan dibuat oleh migrasi 0010, tetapi
 * juga dipastikan ada secara lazy di sini — pola yang sama dengan
 * `ensureNewsTable()` dan `ensureVisitTable()`. Basis data produksi yang belum
 * sempat menjalankan `db:setup` tetap bisa langsung memakai fitur ini.
 *
 * Nama constraint FK disamakan persis dengan buatan drizzle-kit, supaya migrasi
 * 0010 yang dijalankan belakangan mengenalinya sebagai sudah ada dan tidak
 * menambahkan FK kembar.
 *
 * Setiap fungsi yang menyentuh data milik pengguna menerima `userId` dan
 * menyaringnya di klausa WHERE. Pemeriksaan kepemilikan tidak diserahkan ke
 * route handler: satu handler yang lupa memeriksa sudah cukup untuk membuka
 * portofolio orang lain.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from './client'
import {
  announcement,
  announcementDismissal,
  watchlistItem,
  portfolioPosition,
  priceAlert,
  userNotification,
  type AnnouncementRow,
  type PriceAlertRow,
  type UserNotificationRow,
} from './schema'

let tablesReady = false

export async function ensureMemberTables(): Promise<void> {
  if (tablesReady) return

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS announcement (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      tone VARCHAR(16) NOT NULL DEFAULT 'info',
      link_url TEXT,
      link_label VARCHAR(64),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS announcement_active_idx ON announcement (is_active, starts_at);

    CREATE TABLE IF NOT EXISTS announcement_dismissal (
      user_id INTEGER NOT NULL,
      announcement_id INTEGER NOT NULL,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT announcement_dismissal_user_id_announcement_id_pk PRIMARY KEY (user_id, announcement_id),
      CONSTRAINT announcement_dismissal_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
      CONSTRAINT announcement_dismissal_announcement_id_announcement_id_fk
        FOREIGN KEY (announcement_id) REFERENCES announcement(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watchlist_item (
      user_id INTEGER NOT NULL,
      instrument_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT watchlist_item_user_id_instrument_id_pk PRIMARY KEY (user_id, instrument_id),
      CONSTRAINT watchlist_item_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
      CONSTRAINT watchlist_item_instrument_id_instrument_id_fk
        FOREIGN KEY (instrument_id) REFERENCES instrument(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS portfolio_position (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      instrument_id INTEGER NOT NULL,
      quantity NUMERIC(24, 8) NOT NULL,
      avg_price NUMERIC(24, 8) NOT NULL,
      opened_at DATE,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT portfolio_position_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
      CONSTRAINT portfolio_position_instrument_id_instrument_id_fk
        FOREIGN KEY (instrument_id) REFERENCES instrument(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS portfolio_position_user_idx ON portfolio_position (user_id);

    CREATE TABLE IF NOT EXISTS price_alert (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      instrument_id INTEGER NOT NULL,
      kind VARCHAR(24) NOT NULL,
      threshold NUMERIC(24, 8),
      horizon horizon,
      last_verdict VARCHAR(16),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      triggered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT price_alert_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
      CONSTRAINT price_alert_instrument_id_instrument_id_fk
        FOREIGN KEY (instrument_id) REFERENCES instrument(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS price_alert_user_idx ON price_alert (user_id);
    CREATE INDEX IF NOT EXISTS price_alert_active_idx ON price_alert (is_active);

    CREATE TABLE IF NOT EXISTS user_notification (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      link_url TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_notification_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS user_notification_user_idx ON user_notification (user_id, created_at);
  `)

  tablesReady = true
}

// ---------------------------------------------------------------------------
// Pengumuman
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_TONES = ['info', 'beta', 'penting'] as const
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number]

export interface AnnouncementInput {
  title: string
  body: string
  tone: AnnouncementTone
  linkUrl: string | null
  linkLabel: string | null
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
}

/** Semua pengumuman, terbaru dulu. Untuk portal admin. */
export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  await ensureMemberTables()
  return db.select().from(announcement).orderBy(desc(announcement.createdAt))
}

/**
 * Pengumuman yang sedang berlaku dan belum ditutup pengguna ini.
 *
 * "Berlaku" dihitung di Postgres dengan jam Postgres, bukan jam server aplikasi,
 * supaya jadwal tayang tidak bergeser karena zona waktu function.
 */
export async function listActiveAnnouncementsForUser(userId: number): Promise<AnnouncementRow[]> {
  await ensureMemberTables()
  return db
    .select()
    .from(announcement)
    .where(
      and(
        eq(announcement.isActive, true),
        sql`${announcement.startsAt} <= now()`,
        sql`(${announcement.endsAt} is null or ${announcement.endsAt} > now())`,
        sql`not exists (
          select 1 from announcement_dismissal d
          where d.announcement_id = ${announcement.id} and d.user_id = ${userId}
        )`,
      ),
    )
    .orderBy(desc(announcement.startsAt))
    .limit(5)
}

export async function createAnnouncement(input: AnnouncementInput): Promise<AnnouncementRow> {
  await ensureMemberTables()
  const [row] = await db
    .insert(announcement)
    .values({
      title: input.title,
      body: input.body,
      tone: input.tone,
      linkUrl: input.linkUrl,
      linkLabel: input.linkLabel,
      isActive: input.isActive,
      startsAt: input.startsAt ?? new Date(),
      endsAt: input.endsAt,
    })
    .returning()
  return row
}

export async function updateAnnouncement(
  id: number,
  patch: Partial<AnnouncementInput>,
): Promise<AnnouncementRow | null> {
  await ensureMemberTables()
  const values: Partial<typeof announcement.$inferInsert> = {}
  if (patch.title !== undefined) values.title = patch.title
  if (patch.body !== undefined) values.body = patch.body
  if (patch.tone !== undefined) values.tone = patch.tone
  if (patch.linkUrl !== undefined) values.linkUrl = patch.linkUrl
  if (patch.linkLabel !== undefined) values.linkLabel = patch.linkLabel
  if (patch.isActive !== undefined) values.isActive = patch.isActive
  if (patch.startsAt !== undefined && patch.startsAt !== null) values.startsAt = patch.startsAt
  if (patch.endsAt !== undefined) values.endsAt = patch.endsAt
  if (Object.keys(values).length === 0) {
    const [row] = await db.select().from(announcement).where(eq(announcement.id, id))
    return row ?? null
  }
  const [row] = await db.update(announcement).set(values).where(eq(announcement.id, id)).returning()
  return row ?? null
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  await ensureMemberTables()
  const rows = await db.delete(announcement).where(eq(announcement.id, id)).returning({ id: announcement.id })
  return rows.length > 0
}

export async function dismissAnnouncement(userId: number, announcementId: number): Promise<void> {
  await ensureMemberTables()
  // Disaring lewat SELECT supaya id yang sudah dihapus admin tidak berujung
  // galat FK — pengguna yang menutup pengumuman basi tidak melakukan kesalahan.
  await db.execute(sql`
    insert into announcement_dismissal (user_id, announcement_id)
    select ${userId}, id from announcement where id = ${announcementId}
    on conflict do nothing
  `)
}

/** Berapa pengguna yang sudah menutup tiap pengumuman — tanda pengumuman itu terbaca. */
export async function countDismissals(): Promise<Map<number, number>> {
  await ensureMemberTables()
  const rows = await db
    .select({ id: announcementDismissal.announcementId, n: sql<number>`count(*)::int` })
    .from(announcementDismissal)
    .groupBy(announcementDismissal.announcementId)
  return new Map(rows.map((r) => [r.id, r.n]))
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/** Batas wajar. Watchlist berisi ratusan instrumen sudah bukan watchlist. */
export const WATCHLIST_LIMIT = 50

export async function listWatchlistIds(userId: number): Promise<number[]> {
  await ensureMemberTables()
  const rows = await db
    .select({ id: watchlistItem.instrumentId })
    .from(watchlistItem)
    .where(eq(watchlistItem.userId, userId))
    .orderBy(watchlistItem.createdAt)
  return rows.map((r) => r.id)
}

export async function addToWatchlist(
  userId: number,
  instrumentId: number,
  limit = WATCHLIST_LIMIT,
): Promise<'added' | 'exists' | 'full'> {
  await ensureMemberTables()
  const current = await listWatchlistIds(userId)
  if (current.includes(instrumentId)) return 'exists'
  if (current.length >= limit) return 'full'
  await db.insert(watchlistItem).values({ userId, instrumentId }).onConflictDoNothing()
  return 'added'
}

export async function removeFromWatchlist(userId: number, instrumentId: number): Promise<void> {
  await ensureMemberTables()
  await db
    .delete(watchlistItem)
    .where(and(eq(watchlistItem.userId, userId), eq(watchlistItem.instrumentId, instrumentId)))
}

// ---------------------------------------------------------------------------
// Portofolio
// ---------------------------------------------------------------------------

export const PORTFOLIO_LIMIT = 100

export interface PositionView {
  id: number
  instrumentId: number
  quantity: number
  avgPrice: number
  openedAt: string | null
  note: string | null
}

export async function listPositions(userId: number): Promise<PositionView[]> {
  await ensureMemberTables()
  const rows = await db
    .select()
    .from(portfolioPosition)
    .where(eq(portfolioPosition.userId, userId))
    .orderBy(portfolioPosition.createdAt)
  return rows.map((r) => ({
    id: r.id,
    instrumentId: r.instrumentId,
    quantity: Number(r.quantity),
    avgPrice: Number(r.avgPrice),
    openedAt: r.openedAt,
    note: r.note,
  }))
}

export interface PositionInput {
  instrumentId: number
  quantity: number
  avgPrice: number
  openedAt: string | null
  note: string | null
}

export async function createPosition(userId: number, input: PositionInput): Promise<'ok' | 'full'> {
  await ensureMemberTables()
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(portfolioPosition)
    .where(eq(portfolioPosition.userId, userId))
  if (n >= PORTFOLIO_LIMIT) return 'full'
  await db.insert(portfolioPosition).values({
    userId,
    instrumentId: input.instrumentId,
    quantity: String(input.quantity),
    avgPrice: String(input.avgPrice),
    openedAt: input.openedAt,
    note: input.note,
  })
  return 'ok'
}

export async function updatePosition(
  userId: number,
  id: number,
  input: Omit<PositionInput, 'instrumentId'>,
): Promise<boolean> {
  await ensureMemberTables()
  const rows = await db
    .update(portfolioPosition)
    .set({
      quantity: String(input.quantity),
      avgPrice: String(input.avgPrice),
      openedAt: input.openedAt,
      note: input.note,
    })
    .where(and(eq(portfolioPosition.id, id), eq(portfolioPosition.userId, userId)))
    .returning({ id: portfolioPosition.id })
  return rows.length > 0
}

export async function deletePosition(userId: number, id: number): Promise<boolean> {
  await ensureMemberTables()
  const rows = await db
    .delete(portfolioPosition)
    .where(and(eq(portfolioPosition.id, id), eq(portfolioPosition.userId, userId)))
    .returning({ id: portfolioPosition.id })
  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export const ALERT_KINDS = [
  'harga_di_atas',
  'harga_di_bawah',
  'skor_di_atas',
  'skor_di_bawah',
  'putusan_berubah',
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

export const ALERT_LIMIT = 30

export async function listAlerts(userId: number): Promise<PriceAlertRow[]> {
  await ensureMemberTables()
  return db
    .select()
    .from(priceAlert)
    .where(eq(priceAlert.userId, userId))
    .orderBy(desc(priceAlert.createdAt))
}

/** Seluruh alert aktif, bisa dibatasi ke satu pengguna. Untuk evaluator. */
export async function listActiveAlerts(userId?: number): Promise<PriceAlertRow[]> {
  await ensureMemberTables()
  return db
    .select()
    .from(priceAlert)
    .where(
      userId === undefined
        ? eq(priceAlert.isActive, true)
        : and(eq(priceAlert.isActive, true), eq(priceAlert.userId, userId)),
    )
}

export interface AlertInput {
  instrumentId: number
  kind: AlertKind
  threshold: number | null
  horizon: 'pendek' | 'menengah' | 'panjang' | null
  lastVerdict: string | null
}

export async function createAlert(
  userId: number,
  input: AlertInput,
  limit = ALERT_LIMIT,
): Promise<'ok' | 'full'> {
  await ensureMemberTables()
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(priceAlert)
    .where(eq(priceAlert.userId, userId))
  if (n >= limit) return 'full'
  await db.insert(priceAlert).values({
    userId,
    instrumentId: input.instrumentId,
    kind: input.kind,
    threshold: input.threshold === null ? null : String(input.threshold),
    horizon: input.horizon,
    lastVerdict: input.lastVerdict,
  })
  return 'ok'
}

export async function setAlertActive(userId: number, id: number, isActive: boolean): Promise<boolean> {
  await ensureMemberTables()
  const rows = await db
    .update(priceAlert)
    // Menghidupkan ulang alert sekali-picu berarti mulai menunggu dari awal.
    .set(isActive ? { isActive, triggeredAt: null } : { isActive })
    .where(and(eq(priceAlert.id, id), eq(priceAlert.userId, userId)))
    .returning({ id: priceAlert.id })
  return rows.length > 0
}

export async function deleteAlert(userId: number, id: number): Promise<boolean> {
  await ensureMemberTables()
  const rows = await db
    .delete(priceAlert)
    .where(and(eq(priceAlert.id, id), eq(priceAlert.userId, userId)))
    .returning({ id: priceAlert.id })
  return rows.length > 0
}

/**
 * Tandai alert terpicu dan tulis notifikasinya dalam satu transaksi.
 *
 * Syarat `is_active = true` di WHERE menjaga dari dua evaluator yang berjalan
 * bersamaan (job terjadwal dan polling pengguna): hanya satu yang berhasil
 * memperbarui baris, dan hanya yang berhasil itu yang menulis notifikasi.
 */
export async function fireAlert(
  alert: PriceAlertRow,
  notification: { title: string; body: string; linkUrl: string | null },
  next: { isActive: boolean; lastVerdict?: string | null },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(priceAlert)
      .set({
        isActive: next.isActive,
        triggeredAt: new Date(),
        ...(next.lastVerdict !== undefined ? { lastVerdict: next.lastVerdict } : {}),
      })
      .where(
        and(
          eq(priceAlert.id, alert.id),
          eq(priceAlert.isActive, true),
          // Untuk alert putusan: pastikan putusan lama yang kita bandingkan
          // masih yang tersimpan, supaya perubahan yang sama tidak dilaporkan dua kali.
          alert.lastVerdict === null
            ? isNull(priceAlert.lastVerdict)
            : eq(priceAlert.lastVerdict, alert.lastVerdict),
        ),
      )
      .returning({ id: priceAlert.id })
    if (updated.length === 0) return false

    await tx.insert(userNotification).values({
      userId: alert.userId,
      title: notification.title,
      body: notification.body,
      linkUrl: notification.linkUrl,
    })
    return true
  })
}

/** Simpan putusan awal tanpa memicu notifikasi — dipakai saat alert baru dibuat tanpa putusan. */
export async function primeAlertVerdict(alertId: number, verdict: string): Promise<void> {
  await db
    .update(priceAlert)
    .set({ lastVerdict: verdict })
    .where(and(eq(priceAlert.id, alertId), isNull(priceAlert.lastVerdict)))
}

// ---------------------------------------------------------------------------
// Notifikasi pengguna
// ---------------------------------------------------------------------------

export async function listNotifications(userId: number, limit = 30): Promise<UserNotificationRow[]> {
  await ensureMemberTables()
  return db
    .select()
    .from(userNotification)
    .where(eq(userNotification.userId, userId))
    .orderBy(desc(userNotification.createdAt))
    .limit(limit)
}

export async function countUnreadNotifications(userId: number): Promise<number> {
  await ensureMemberTables()
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userNotification)
    .where(and(eq(userNotification.userId, userId), isNull(userNotification.readAt)))
  return n
}

export async function markNotificationsRead(userId: number, ids?: number[]): Promise<void> {
  await ensureMemberTables()
  await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(userNotification.userId, userId),
        isNull(userNotification.readAt),
        ids && ids.length > 0 ? inArray(userNotification.id, ids) : undefined,
      ),
    )
}

// ---------------------------------------------------------------------------
// Putusan komite terbaru per instrumen
// ---------------------------------------------------------------------------

export interface LatestVerdict {
  instrumentId: number
  verdict: 'beli' | 'tahan' | 'jual' | 'abstain'
  confidence: number | null
  finishedAt: string
  sessionId: number
}

/**
 * Putusan selesai terakhir tiap instrumen, satu kueri `distinct on`.
 * Rapat yang gagal atau masih berjalan tidak dihitung sebagai putusan.
 */
export async function listLatestVerdictByInstrument(instrumentIds?: number[]): Promise<Map<number, LatestVerdict>> {
  if (instrumentIds && instrumentIds.length === 0) return new Map()
  const filter =
    instrumentIds && instrumentIds.length > 0
      ? sql`and instrument_id in (${sql.join(instrumentIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``
  const rows = await db.execute<{
    instrument_id: number
    verdict: LatestVerdict['verdict']
    confidence: number | null
    finished_at: string
    id: number
  }>(sql`
    select distinct on (instrument_id)
      instrument_id, verdict, confidence, finished_at::text, id
    from agent_session
    where status = 'done' and verdict is not null and instrument_id is not null ${filter}
    order by instrument_id, finished_at desc nulls last
  `)
  return new Map(
    rows.map((r) => [
      r.instrument_id,
      {
        instrumentId: r.instrument_id,
        verdict: r.verdict,
        confidence: r.confidence,
        finishedAt: r.finished_at,
        sessionId: r.id,
      },
    ]),
  )
}

export interface VerdictHistoryRow {
  sessionId: number
  instrumentId: number | null
  symbol: string
  market: string
  verdict: LatestVerdict['verdict']
  confidence: number | null
  rationale: string | null
  finishedAt: string
  /** Harga penutupan yang dilihat komite saat memutuskan, dari `facts_snapshot`. */
  priceAtDecision: number | null
  asOf: string | null
}

/** Riwayat putusan selesai, terbaru dulu. */
export async function listVerdictHistory(limit = 200): Promise<VerdictHistoryRow[]> {
  const rows = await db.execute<{
    id: number
    instrument_id: number | null
    symbol: string
    market: string
    verdict: LatestVerdict['verdict']
    confidence: number | null
    rationale: string | null
    finished_at: string
    last_close: string | null
    as_of: string | null
  }>(sql`
    select id, instrument_id, symbol, market::text, verdict, confidence, rationale,
           finished_at::text,
           facts_snapshot->>'lastClose' as last_close,
           facts_snapshot->>'asOf' as as_of
    from agent_session
    where status = 'done' and verdict is not null
    order by finished_at desc nulls last
    limit ${limit}
  `)
  return rows.map((r) => {
    const price = r.last_close === null ? null : Number(r.last_close)
    return {
      sessionId: r.id,
      instrumentId: r.instrument_id,
      symbol: r.symbol,
      market: r.market,
      verdict: r.verdict,
      confidence: r.confidence,
      rationale: r.rationale,
      finishedAt: r.finished_at,
      priceAtDecision: price !== null && Number.isFinite(price) ? price : null,
      asOf: r.as_of,
    }
  })
}

// ---------------------------------------------------------------------------
// Kepemilikan KSEI: pergerakan porsi asing
// ---------------------------------------------------------------------------

export interface OwnershipMover {
  instrumentId: number
  symbol: string
  name: string
  asOf: string
  prevAsOf: string
  foreignPct: number
  prevForeignPct: number
  /** Selisih porsi asing dalam poin persen. */
  deltaPct: number
}

/**
 * Porsi kepemilikan asing dua bulan terakhir tiap saham, dan selisihnya.
 * Porsi dihitung terhadap total lembar tercatat di KSEI (lokal + asing).
 */
export async function listOwnershipMovers(): Promise<OwnershipMover[]> {
  const rows = await db.execute<{
    instrument_id: number
    symbol: string
    name: string
    as_of: string
    prev_as_of: string
    foreign_pct: number
    prev_foreign_pct: number
  }>(sql`
    with ranked as (
      select o.instrument_id, o.as_of,
             o.foreign_total::float8 / nullif(o.local_total + o.foreign_total, 0) * 100 as foreign_pct,
             row_number() over (partition by o.instrument_id order by o.as_of desc) as rn
      from ownership_monthly o
    )
    select a.instrument_id, i.symbol, i.name,
           a.as_of::text, b.as_of::text as prev_as_of,
           a.foreign_pct, b.foreign_pct as prev_foreign_pct
    from ranked a
    join ranked b on b.instrument_id = a.instrument_id and b.rn = 2
    join instrument i on i.id = a.instrument_id
    where a.rn = 1 and a.foreign_pct is not null and b.foreign_pct is not null
  `)
  return rows.map((r) => ({
    instrumentId: r.instrument_id,
    symbol: r.symbol,
    name: r.name,
    asOf: r.as_of,
    prevAsOf: r.prev_as_of,
    foreignPct: Number(r.foreign_pct),
    prevForeignPct: Number(r.prev_foreign_pct),
    deltaPct: Number(r.foreign_pct) - Number(r.prev_foreign_pct),
  }))
}
