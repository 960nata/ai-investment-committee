/**
 * Baca-tulis `ownership_monthly` (KSEI).
 */

import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from './client'
import { instrument, ownershipMonthly } from './schema'

export interface OwnershipInput {
  instrumentId: number
  asOf: string
  availableAt: string
  sharesListed: number
  price: number | null
  local: number[]
  foreign: number[]
  localTotal: number
  foreignTotal: number
}

export async function upsertOwnership(rows: OwnershipInput[], chunkSize = 300): Promise<number> {
  let written = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    const res = await db
      .insert(ownershipMonthly)
      .values(
        slice.map((r) => ({
          ...r,
          price: r.price === null ? null : String(r.price),
          fetchedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [ownershipMonthly.instrumentId, ownershipMonthly.asOf],
        set: {
          availableAt: sql`excluded.available_at`,
          sharesListed: sql`excluded.shares_listed`,
          price: sql`excluded.price`,
          local: sql`excluded.local`,
          foreign: sql`excluded.foreign`,
          localTotal: sql`excluded.local_total`,
          foreignTotal: sql`excluded.foreign_total`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
      .returning({ asOf: ownershipMonthly.asOf })
    written += res.length
  }
  return written
}

/** Kode KSEI (BBCA) -> id instrumen, dari simbol Yahoo (BBCA.JK). */
export async function idxCodeMap(): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: instrument.id, symbol: instrument.symbol })
    .from(instrument)
    .where(eq(instrument.market, 'idx'))
  return new Map(rows.map((r) => [r.symbol.replace(/\.JK$/i, '').toUpperCase(), r.id]))
}

export interface OwnershipPoint {
  asOf: string
  availableAt: string
  local: number[]
  foreign: number[]
  localTotal: number
  foreignTotal: number
}

/**
 * Seluruh posisi kepemilikan yang sudah bisa diketahui pada `asOf`, terbaru
 * dulu. Penyaringnya `available_at`, bukan `as_of` — alasan yang sama dengan
 * `reported_at` di laporan keuangan.
 */
export async function getOwnershipAsOf(instrumentId: number, asOf: string): Promise<OwnershipPoint[]> {
  const rows = await db
    .select({
      asOf: ownershipMonthly.asOf,
      availableAt: ownershipMonthly.availableAt,
      local: ownershipMonthly.local,
      foreign: ownershipMonthly.foreign,
      localTotal: ownershipMonthly.localTotal,
      foreignTotal: ownershipMonthly.foreignTotal,
    })
    .from(ownershipMonthly)
    .where(and(eq(ownershipMonthly.instrumentId, instrumentId), lte(ownershipMonthly.availableAt, asOf)))
    .orderBy(sql`${ownershipMonthly.asOf} desc`)
  return rows.map((r) => ({
    ...r,
    local: r.local.map(Number),
    foreign: r.foreign.map(Number),
    localTotal: Number(r.localTotal),
    foreignTotal: Number(r.foreignTotal),
  }))
}

/** Bulan-bulan yang sudah tersimpan, untuk melewati yang tidak perlu diunduh ulang. */
export async function ownershipMonthsStored(): Promise<Set<string>> {
  const rows = await db.execute<{ m: string }>(sql`
    select distinct to_char(as_of, 'YYYY-MM') as m from ownership_monthly`)
  return new Set((rows as unknown as { m: string }[]).map((r) => r.m))
}
