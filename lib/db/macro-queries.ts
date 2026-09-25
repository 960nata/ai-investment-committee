/**
 * Baca-tulis `macro_series`.
 */

import { desc, eq, sql } from 'drizzle-orm'
import { db } from './client'
import { macroSeries } from './schema'
import type { MacroPoint } from '@/lib/macro/sources'

export async function upsertMacro(points: MacroPoint[], chunkSize = 500): Promise<number> {
  let written = 0
  for (let i = 0; i < points.length; i += chunkSize) {
    const slice = points.slice(i, i + chunkSize)
    const res = await db
      .insert(macroSeries)
      .values(slice.map((p) => ({ ...p, fetchedAt: new Date() })))
      .onConflictDoUpdate({
        target: [macroSeries.seriesId, macroSeries.date],
        set: { value: sql`excluded.value`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
      })
      .returning({ date: macroSeries.date })
    written += res.length
  }
  return written
}

/** Nilai terakhir satu deret, atau null bila belum pernah diambil. */
export async function latestMacro(seriesId: string): Promise<{ date: string; value: number } | null> {
  const [row] = await db
    .select({ date: macroSeries.date, value: macroSeries.value })
    .from(macroSeries)
    .where(eq(macroSeries.seriesId, seriesId))
    .orderBy(desc(macroSeries.date))
    .limit(1)
  return row ?? null
}

/** N nilai terakhir, terbaru dulu — untuk pertumbuhan dari deret tingkat (PDB nominal). */
export async function lastMacro(seriesId: string, n: number): Promise<{ date: string; value: number }[]> {
  return db
    .select({ date: macroSeries.date, value: macroSeries.value })
    .from(macroSeries)
    .where(eq(macroSeries.seriesId, seriesId))
    .orderBy(desc(macroSeries.date))
    .limit(n)
}
