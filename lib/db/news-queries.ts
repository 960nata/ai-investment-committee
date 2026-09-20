/**
 * Kueri dan penyimpanan Berita & Intelijen Pasar AI, Iklan Strategis, dan Manajemen Pengguna.
 */

import { db } from './client'
import {
  marketNews,
  adSettings,
  appUser,
  type MarketNewsRow,
  type NewMarketNews,
  type AdSettingsRow,
  type NewAdSettings,
  type AppUserRow,
  type NewAppUser,
} from './schema'
import { desc, eq, and, sql, type SQL } from 'drizzle-orm'

let tablesInitialized = false

/**
 * Pastikan tabel market_news, ad_settings, dan app_user ada di Postgres.
 * Berjalan sekali secara lazy tanpa memblokir runtime aplikasi.
 */
export async function ensureNewsTable(): Promise<void> {
  if (tablesInitialized) return

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_news (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(180) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL,
      category VARCHAR(48) NOT NULL DEFAULT 'ekonomi-makro',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      mentioned_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
      sentiment VARCHAR(16) NOT NULL DEFAULT 'neutral',
      impact_score INTEGER NOT NULL DEFAULT 5,
      featured_image JSONB,
      youtube_video JSONB,
      key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_markdown TEXT NOT NULL,
      author VARCHAR(64) NOT NULL DEFAULT 'AI Intelligence Desk',
      reading_time_minutes INTEGER NOT NULL DEFAULT 3,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS market_news_category_idx ON market_news (category);
    CREATE INDEX IF NOT EXISTS market_news_published_at_idx ON market_news (published_at DESC);

    CREATE TABLE IF NOT EXISTS ad_settings (
      id SERIAL PRIMARY KEY,
      slot_name VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(128) NOT NULL,
      description TEXT,
      is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ad_code_html TEXT,
      target_url TEXT,
      image_url TEXT,
      sponsor_name VARCHAR(128),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_user (
      id SERIAL PRIMARY KEY,
      email VARCHAR(128) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL DEFAULT 'Analis Komite',
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS app_user_role_idx ON app_user (role);

    -- Seed 4 slot iklan strategis jika belum ada (default is_enabled = false)
    INSERT INTO ad_settings (slot_name, title, description, is_enabled)
    VALUES
      ('header_leaderboard', 'Header Leaderboard Banner', 'Slot iklan utama di atas judul warta berita & header artikel', FALSE),
      ('in_article_mid', 'In-Article Mid-Stream', 'Slot iklan di tengah narasi artikel sesudah poin-poin utama', FALSE),
      ('sidebar_widget', 'Sidebar Sponsor Card', 'Slot iklan kartu sponsor di kolom samping kanan artikel', FALSE),
      ('footer_banner', 'Footer Anchor Banner', 'Slot banner penutup sebelum navigasi kaki artikel', FALSE)
    ON CONFLICT (slot_name) DO NOTHING;

    -- Seed akun demo admin dan demo user ke database
    INSERT INTO app_user (email, name, role, is_active)
    VALUES
      ('admin@komite.id', 'Kepala Komite (Super Admin)', 'admin', TRUE),
      ('analis.demo@komite.id', 'Analis Kuantitatif (Demo User)', 'user', TRUE),
      ('strateg.demo@komite.id', 'Strateg Portofolio (Demo User)', 'user', TRUE),
      ('risiko.demo@komite.id', 'Pengawas Risiko (Demo User)', 'user', TRUE)
    ON CONFLICT (email) DO NOTHING;
  `)

  tablesInitialized = true
}

export interface NewsFilter {
  category?: string
  symbol?: string
  sentiment?: string
  minImpact?: number
  limit?: number
  offset?: number
}

/**
 * Ambil daftar artikel berita dengan filter.
 */
export async function getMarketNewsList(filter: NewsFilter = {}): Promise<MarketNewsRow[]> {
  await ensureNewsTable()
  const limit = Math.min(filter.limit ?? 20, 100)
  const offset = filter.offset ?? 0

  const conditions: SQL[] = []
  if (filter.category && filter.category !== 'semua') {
    conditions.push(eq(marketNews.category, filter.category))
  }
  if (filter.sentiment && filter.sentiment !== 'semua') {
    conditions.push(eq(marketNews.sentiment, filter.sentiment))
  }
  if (filter.minImpact && filter.minImpact > 0) {
    conditions.push(sql`${marketNews.impactScore} >= ${filter.minImpact}`)
  }

  let query = db
    .select()
    .from(marketNews)
    .orderBy(desc(marketNews.publishedAt))
    .limit(limit)
    .offset(offset)

  if (conditions.length > 0) {
    // @ts-expect-error Drizzle dynamic query chaining
    query = query.where(and(...conditions))
  }

  const rows: MarketNewsRow[] = await query

  // Filter in-memory jika mencari symbol spesifik
  if (filter.symbol) {
    const sym = filter.symbol.toUpperCase()
    return rows.filter((r: MarketNewsRow) =>
      r.mentionedSymbols.some((s: string) => s.toUpperCase() === sym),
    )
  }

  return rows
}

/**
 * Ambil satu artikel berita berdasarkan slug.
 */
export async function getMarketNewsBySlug(slug: string): Promise<MarketNewsRow | null> {
  await ensureNewsTable()

  const rows = await db
    .select()
    .from(marketNews)
    .where(eq(marketNews.slug, slug))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Ambil satu artikel berita berdasarkan ID numerik.
 */
export async function getMarketNewsById(id: number): Promise<MarketNewsRow | null> {
  await ensureNewsTable()

  const rows = await db
    .select()
    .from(marketNews)
    .where(eq(marketNews.id, id))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Hapus artikel berita berdasarkan ID.
 */
export async function deleteMarketNews(id: number): Promise<boolean> {
  await ensureNewsTable()

  const res = await db.delete(marketNews).where(eq(marketNews.id, id)).returning({ id: marketNews.id })
  return res.length > 0
}

/**
 * Perbarui artikel berita berdasarkan ID.
 */
export async function updateMarketNews(
  id: number,
  data: Partial<NewMarketNews>,
): Promise<MarketNewsRow | null> {
  await ensureNewsTable()

  const res = await db
    .update(marketNews)
    .set({
      ...data,
    })
    .where(eq(marketNews.id, id))
    .returning()

  return res[0] ?? null
}

/**
 * Simpan atau perbarui artikel berita.
 */
export async function saveMarketNews(article: NewMarketNews): Promise<MarketNewsRow> {
  await ensureNewsTable()

  const inserted = await db
    .insert(marketNews)
    .values(article)
    .onConflictDoUpdate({
      target: marketNews.slug,
      set: {
        title: article.title,
        summary: article.summary,
        category: article.category,
        tags: article.tags,
        mentionedSymbols: article.mentionedSymbols,
        sentiment: article.sentiment,
        impactScore: article.impactScore,
        featuredImage: article.featuredImage,
        youtubeVideo: article.youtubeVideo,
        keyTakeaways: article.keyTakeaways,
        contentMarkdown: article.contentMarkdown,
        author: article.author,
        readingTimeMinutes: article.readingTimeMinutes,
        publishedAt: article.publishedAt,
      },
    })
    .returning()

  return inserted[0]
}

// ---------------------------------------------------------------------------
// Kueri Pengaturan Iklan (AdSense & Banner)
// ---------------------------------------------------------------------------

/**
 * Ambil semua slot iklan.
 */
export async function getAdSettings(): Promise<AdSettingsRow[]> {
  await ensureNewsTable()

  return db.select().from(adSettings).orderBy(adSettings.id)
}

/**
 * Ambil satu slot iklan berdasarkan slot_name.
 */
export async function getAdSettingBySlot(slotName: string): Promise<AdSettingsRow | null> {
  await ensureNewsTable()

  const rows = await db
    .select()
    .from(adSettings)
    .where(eq(adSettings.slotName, slotName))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Perbarui pengaturan slot iklan.
 */
export async function updateAdSetting(
  slotName: string,
  data: Partial<NewAdSettings>,
): Promise<AdSettingsRow | null> {
  await ensureNewsTable()

  const res = await db
    .update(adSettings)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(adSettings.slotName, slotName))
    .returning()

  return res[0] ?? null
}

// ---------------------------------------------------------------------------
// Kueri Manajemen Pengguna (App Users)
// ---------------------------------------------------------------------------

/**
 * Ambil daftar semua user.
 */
export async function getAppUsers(): Promise<AppUserRow[]> {
  await ensureNewsTable()

  return db.select().from(appUser).orderBy(desc(appUser.createdAt))
}

/**
 * Ambil satu user berdasarkan email.
 */
export async function getAppUserByEmail(email: string): Promise<AppUserRow | null> {
  await ensureNewsTable()

  const rows = await db
    .select()
    .from(appUser)
    .where(eq(appUser.email, email.toLowerCase()))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Upsert user (misal saat login).
 */
export async function upsertAppUser(user: NewAppUser): Promise<AppUserRow> {
  await ensureNewsTable()

  const rows = await db
    .insert(appUser)
    .values({
      ...user,
      email: user.email.toLowerCase(),
    })
    .onConflictDoUpdate({
      target: appUser.email,
      set: {
        name: user.name,
        lastLoginAt: new Date(),
      },
    })
    .returning()

  return rows[0]
}

/**
 * Perbarui peran (role) dan status aktif user.
 */
export async function updateUserRole(
  id: number,
  role: 'admin' | 'user',
  isActive?: boolean,
): Promise<AppUserRow | null> {
  await ensureNewsTable()

  const payload: Partial<AppUserRow> = { role }
  if (typeof isActive === 'boolean') {
    payload.isActive = isActive
  }

  const res = await db
    .update(appUser)
    .set(payload)
    .where(eq(appUser.id, id))
    .returning()

  return res[0] ?? null
}

/**
 * Hapus user.
 */
export async function deleteAppUser(id: number): Promise<boolean> {
  await ensureNewsTable()

  const res = await db.delete(appUser).where(eq(appUser.id, id)).returning({ id: appUser.id })
  return res.length > 0
}
