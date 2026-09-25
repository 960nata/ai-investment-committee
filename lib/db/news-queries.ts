/**
 * Kueri dan penyimpanan Berita & Intelijen Pasar AI, Iklan Strategis, dan Manajemen Pengguna.
 */

import { db } from './client'
import {
  marketNews,
  marketNewsTranslation,
  adSettings,
  appUser,
  type MarketNewsRow,
  type MarketNewsTranslationRow,
  type NewMarketNews,
  type AdSettingsRow,
  type NewAdSettings,
  type AppUserRow,
  type NewAppUser,
} from './schema'
import { desc, eq, and, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { SOURCE_LOCALE, TRANSLATED_LOCALES, type Locale } from '@/lib/i18n/locales'

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
      views_count INTEGER NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE market_news ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS market_news_category_idx ON market_news (category);
    CREATE INDEX IF NOT EXISTS market_news_published_at_idx ON market_news (published_at DESC);

    -- Versi artikel dalam bahasa lain, ditulis ulang oleh agen warta sendiri.
    -- Baris sumber (Indonesia) tetap di market_news; tabel ini hanya memuat teks
    -- yang berubah per bahasa. Angka, simbol, gambar, dan skor dampak dibaca
    -- dari baris sumbernya supaya kelima versi tidak bisa saling menyimpang.
    CREATE TABLE IF NOT EXISTS market_news_translation (
      news_id INTEGER NOT NULL REFERENCES market_news(id) ON DELETE CASCADE,
      locale VARCHAR(8) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_markdown TEXT NOT NULL,
      image_alt TEXT,
      image_caption TEXT,
      model VARCHAR(96),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (news_id, locale)
    );

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

    -- Kolom kata sandi ditambahkan belakangan; basis data yang sudah berjalan
    -- lebih dulu tetap ikut terurus tanpa migrasi manual.
    ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

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
 * Tambah jumlah tayang (view count) artikel berita secara atomik.
 */
export async function incrementNewsViews(idOrSlug: number | string): Promise<number> {
  try {
    await ensureNewsTable()

    const condition = typeof idOrSlug === 'number'
      ? eq(marketNews.id, idOrSlug)
      : eq(marketNews.slug, idOrSlug)

    const res = await db
      .update(marketNews)
      .set({
        viewsCount: sql`${marketNews.viewsCount} + 1`,
      })
      .where(condition)
      .returning({ viewsCount: marketNews.viewsCount })

    return res[0]?.viewsCount ?? 0
  } catch (err) {
    console.error('[NewsViews] Gagal menambah view count:', err)
    return 0
  }
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
 * Kolom pengguna yang boleh meninggalkan lapisan ini.
 *
 * `passwordHash` sengaja tidak ada di sini. Satu-satunya yang berhak melihatnya
 * adalah pemeriksa kata sandi, dan itu memakai `getAppUserByEmail()`. Kueri yang
 * memilih seluruh kolom akan mengirim sidik kata sandi tiap pengguna ke portal
 * admin di peramban — bukan karena ada yang memintanya, melainkan karena tidak
 * ada yang menahannya.
 */
const PUBLIC_USER_COLUMNS = {
  id: appUser.id,
  email: appUser.email,
  name: appUser.name,
  role: appUser.role,
  isActive: appUser.isActive,
  createdAt: appUser.createdAt,
  lastLoginAt: appUser.lastLoginAt,
} as const

export type PublicAppUser = {
  [K in keyof typeof PUBLIC_USER_COLUMNS]: AppUserRow[K]
}

/**
 * Ambil daftar semua user, tanpa sidik kata sandi.
 */
export async function getAppUsers(): Promise<PublicAppUser[]> {
  await ensureNewsTable()

  return db.select(PUBLIC_USER_COLUMNS).from(appUser).orderBy(desc(appUser.createdAt))
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
 * Daftarkan akun baru berikut kata sandinya.
 *
 * Surel yang sudah terpakai ditolak di sini, bukan di lapisan atas: satu-satunya
 * tempat yang benar-benar tahu isi tabel adalah tabelnya sendiri, dan pemeriksaan
 * "sudah ada atau belum" yang terpisah dari penyisipan selalu punya celah waktu
 * di antaranya.
 *
 * Akun yang pernah dibuat admin tanpa kata sandi boleh mengklaim kata sandinya
 * di sini — itulah cara undangan berubah jadi akun yang bisa dipakai. Akun yang
 * kata sandinya sudah terisi tetap ditolak.
 */
export async function registerAppUser(input: {
  email: string
  name: string
  passwordHash: string
}): Promise<{ ok: true; user: PublicAppUser } | { ok: false; reason: 'taken' }> {
  await ensureNewsTable()

  const email = input.email.toLowerCase()

  const rows = await db
    .insert(appUser)
    .values({
      email,
      name: input.name,
      role: 'user',
      isActive: true,
      passwordHash: input.passwordHash,
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appUser.email,
      set: {
        name: input.name,
        passwordHash: input.passwordHash,
        lastLoginAt: new Date(),
      },
      // Hanya baris undangan — yang belum punya kata sandi — yang boleh terisi.
      setWhere: isNull(appUser.passwordHash),
    })
    .returning(PUBLIC_USER_COLUMNS)

  if (rows.length === 0) return { ok: false, reason: 'taken' }
  return { ok: true, user: rows[0] }
}

/**
 * Catat waktu masuk terakhir.
 *
 * Kegagalan di sini sengaja tidak menggagalkan proses masuk. Stempel waktu
 * adalah catatan, bukan syarat, dan menolak seseorang masuk karena satu kolom
 * pencatatan gagal ditulis adalah pertukaran yang salah.
 */
export async function markUserLogin(id: number): Promise<void> {
  await ensureNewsTable()

  await db.update(appUser).set({ lastLoginAt: new Date() }).where(eq(appUser.id, id))
}

/**
 * Upsert user (misal saat login).
 */
export async function upsertAppUser(user: NewAppUser): Promise<PublicAppUser> {
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
    .returning(PUBLIC_USER_COLUMNS)

  return rows[0]
}

/**
 * Perbarui peran (role) dan status aktif user.
 */
export async function updateUserRole(
  id: number,
  role: 'admin' | 'user',
  isActive?: boolean,
): Promise<PublicAppUser | null> {
  await ensureNewsTable()

  const payload: Partial<AppUserRow> = { role }
  if (typeof isActive === 'boolean') {
    payload.isActive = isActive
  }

  const res = await db
    .update(appUser)
    .set(payload)
    .where(eq(appUser.id, id))
    .returning(PUBLIC_USER_COLUMNS)

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

// ---------------------------------------------------------------------------
// Versi bahasa lain
// ---------------------------------------------------------------------------

export interface NewsTranslationInput {
  newsId: number
  locale: Locale
  title: string
  summary: string
  tags: string[]
  keyTakeaways: string[]
  contentMarkdown: string
  imageAlt: string | null
  imageCaption: string | null
  model: string | null
}

export async function saveNewsTranslation(input: NewsTranslationInput): Promise<void> {
  await ensureNewsTable()
  await db
    .insert(marketNewsTranslation)
    .values({ ...input, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [marketNewsTranslation.newsId, marketNewsTranslation.locale],
      set: {
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        tags: sql`excluded.tags`,
        keyTakeaways: sql`excluded.key_takeaways`,
        contentMarkdown: sql`excluded.content_markdown`,
        imageAlt: sql`excluded.image_alt`,
        imageCaption: sql`excluded.image_caption`,
        model: sql`excluded.model`,
        createdAt: sql`excluded.created_at`,
      },
    })
}

/** Bahasa yang tersedia untuk satu artikel, termasuk bahasa sumbernya. */
export async function listNewsLocales(newsId: number): Promise<Locale[]> {
  await ensureNewsTable()
  const rows = await db
    .select({ locale: marketNewsTranslation.locale })
    .from(marketNewsTranslation)
    .where(eq(marketNewsTranslation.newsId, newsId))
  const have = new Set(rows.map((r) => r.locale))
  return [SOURCE_LOCALE, ...TRANSLATED_LOCALES.filter((l) => have.has(l))]
}

/**
 * Gabungkan baris sumber dengan versi bahasanya.
 *
 * Hasilnya berbentuk sama dengan `MarketNewsRow`, jadi halaman artikel tidak
 * perlu tahu versi mana yang sedang ia tampilkan. Fakta — dampak, simbol,
 * tanggal, sampul — selalu datang dari baris sumber.
 */
function mergeTranslation(base: MarketNewsRow, t: MarketNewsTranslationRow): MarketNewsRow {
  return {
    ...base,
    title: t.title,
    summary: t.summary,
    tags: t.tags.length > 0 ? t.tags : base.tags,
    keyTakeaways: t.keyTakeaways,
    contentMarkdown: t.contentMarkdown,
    featuredImage: base.featuredImage
      ? {
          ...base.featuredImage,
          alt: t.imageAlt ?? base.featuredImage.alt,
          caption: t.imageCaption ?? base.featuredImage.caption,
        }
      : base.featuredImage,
  }
}

/** Satu artikel dalam satu bahasa; null bila versi bahasa itu belum ditulis. */
export async function getLocalizedNewsBySlug(
  slug: string,
  locale: Locale,
): Promise<MarketNewsRow | null> {
  const base = await getMarketNewsBySlug(slug)
  if (!base || locale === SOURCE_LOCALE) return base

  const rows = await db
    .select()
    .from(marketNewsTranslation)
    .where(and(eq(marketNewsTranslation.newsId, base.id), eq(marketNewsTranslation.locale, locale)))
    .limit(1)

  return rows[0] ? mergeTranslation(base, rows[0]) : null
}

/** Daftar artikel yang sudah punya versi dalam satu bahasa, terbaru dulu. */
export async function getLocalizedNewsList(locale: Locale, limit = 20): Promise<MarketNewsRow[]> {
  if (locale === SOURCE_LOCALE) return getMarketNewsList({ limit })
  await ensureNewsTable()

  const rows = await db
    .select({ base: marketNews, t: marketNewsTranslation })
    .from(marketNews)
    .innerJoin(
      marketNewsTranslation,
      and(eq(marketNewsTranslation.newsId, marketNews.id), eq(marketNewsTranslation.locale, locale)),
    )
    .orderBy(desc(marketNews.publishedAt))
    .limit(Math.min(limit, 100))

  return rows.map((r) => mergeTranslation(r.base, r.t))
}

/** Artikel yang masih kekurangan versi dalam salah satu bahasa, untuk diisi agen. */
export async function listNewsMissingTranslations(
  limit = 50,
): Promise<{ article: MarketNewsRow; missing: Locale[] }[]> {
  await ensureNewsTable()
  const articles = await getMarketNewsList({ limit })
  if (articles.length === 0) return []

  const rows = await db
    .select({ newsId: marketNewsTranslation.newsId, locale: marketNewsTranslation.locale })
    .from(marketNewsTranslation)
    .where(inArray(marketNewsTranslation.newsId, articles.map((a) => a.id)))

  const have = new Map<number, Set<string>>()
  for (const r of rows) {
    const set = have.get(r.newsId) ?? new Set<string>()
    set.add(r.locale)
    have.set(r.newsId, set)
  }

  return articles
    .map((article) => ({
      article,
      missing: TRANSLATED_LOCALES.filter((l) => !have.get(article.id)?.has(l)),
    }))
    .filter((x) => x.missing.length > 0)
}


/** Bahasa yang tersedia per artikel, sekali kueri — untuk sitemap. */
export async function listNewsLocaleMap(): Promise<Map<number, Locale[]>> {
  await ensureNewsTable()
  const rows = await db
    .select({ newsId: marketNewsTranslation.newsId, locale: marketNewsTranslation.locale })
    .from(marketNewsTranslation)

  const map = new Map<number, Locale[]>()
  for (const r of rows) {
    const list = map.get(r.newsId) ?? [SOURCE_LOCALE]
    if (TRANSLATED_LOCALES.includes(r.locale as Exclude<Locale, 'id'>)) list.push(r.locale as Locale)
    map.set(r.newsId, list)
  }
  return map
}
