/**
 * Catatan berita sumber yang sudah dipakai warta otomatis.
 *
 * Tanpa catatan ini agen akan menulis ulang berita yang sama tiap kali jadwal
 * jalan, karena berita paling hangat di RSS jarang berganti dalam hitungan jam.
 * Tabelnya dibuat malas seperti `ensureNewsTable`, supaya basis data yang sudah
 * berjalan tidak perlu migrasi manual hanya untuk fitur ini.
 */

import { sql } from 'drizzle-orm'
import { db } from './client'

let tableReady = false

async function ensureSourceTable(): Promise<void> {
  if (tableReady) return
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS news_source_item (
      link TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source VARCHAR(64) NOT NULL,
      news_slug VARCHAR(180),
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS news_source_item_used_at_idx ON news_source_item (used_at DESC);
  `)
  tableReady = true
}

/** Saring tautan yang belum pernah jadi bahan warta. */
export async function filterUnusedLinks(links: string[]): Promise<Set<string>> {
  if (links.length === 0) return new Set()
  await ensureSourceTable()

  const rows = await db.execute<{ link: string }>(sql`
    SELECT link FROM news_source_item
    WHERE link IN (${sql.join(links.map((l) => sql`${l}`), sql`, `)})
  `)
  const used = new Set(rows.map((r) => r.link))
  return new Set(links.filter((l) => !used.has(l)))
}

/**
 * Tandai berita sumber sudah terpakai.
 *
 * `newsSlug` boleh kosong: berita yang ditolak editor AI karena tidak relevan
 * juga dicatat, supaya tidak ditimbang ulang di setiap jadwal berikutnya.
 */
export async function markSourcesUsed(
  items: Array<{ link: string; title: string; source: string }>,
  newsSlug: string | null,
): Promise<void> {
  if (items.length === 0) return
  await ensureSourceTable()

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO news_source_item (link, title, source, news_slug)
      VALUES (${item.link}, ${item.title.slice(0, 500)}, ${item.source.slice(0, 64)}, ${newsSlug})
      ON CONFLICT (link) DO UPDATE SET news_slug = COALESCE(EXCLUDED.news_slug, news_source_item.news_slug)
    `)
  }
}
