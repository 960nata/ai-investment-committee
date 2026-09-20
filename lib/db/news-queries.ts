/**
 * Kueri dan penyimpanan Berita & Intelijen Pasar AI.
 */

import { db } from './client'
import { marketNews, type MarketNewsRow, type NewMarketNews } from './schema'
import { desc, eq, and, sql, type SQL } from 'drizzle-orm'

let tableInitialized = false

/**
 * Pastikan tabel market_news ada di Postgres.
 * Berjalan sekali secara lazy tanpa memblokir runtime aplikasi.
 */
export async function ensureNewsTable(): Promise<void> {
  if (tableInitialized) return

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
  `)

  tableInitialized = true
}

export interface NewsFilter {
  category?: string
  symbol?: string
  sentiment?: string
  limit?: number
  offset?: number
}

/**
 * Ambil daftar artikel berita dengan filter.
 */
export async function getMarketNewsList(filter: NewsFilter = {}): Promise<MarketNewsRow[]> {
  await ensureNewsTable()
  const limit = Math.min(filter.limit ?? 20, 50)
  const offset = filter.offset ?? 0

  const conditions: SQL[] = []
  if (filter.category && filter.category !== 'semua') {
    conditions.push(eq(marketNews.category, filter.category))
  }
  if (filter.sentiment && filter.sentiment !== 'semua') {
    conditions.push(eq(marketNews.sentiment, filter.sentiment))
  }

  let query = db
    .select()
    .from(marketNews)
    .orderBy(desc(marketNews.publishedAt))
    .limit(limit)
    .offset(offset)

  if (conditions.length > 0) {
    // @ts-ignore
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
