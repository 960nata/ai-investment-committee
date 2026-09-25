/**
 * Pencatatan dan pembacaan kunjungan.
 *
 * Skema tabelnya dibuat di sini dengan DDL idempoten, mengikuti pola yang sudah
 * dipakai `ensureNewsTable()`: proyek ini menjalankan beberapa tabelnya di luar
 * migrasi drizzle, dan mencampur dua cara untuk satu tabel yang sama akan
 * membuat `db:migrate` gagal di basis data yang sudah berjalan.
 */

import { sql } from 'drizzle-orm'
import { db } from './client'
import { visitLog, type NewVisitLog } from './schema'

let tableReady = false

export async function ensureVisitTable(): Promise<void> {
  if (tableReady) return

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS visit_log (
      id SERIAL PRIMARY KEY,
      visitor_hash VARCHAR(32) NOT NULL,
      path VARCHAR(255) NOT NULL,
      country VARCHAR(4),
      region VARCHAR(64),
      city VARCHAR(128),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      device_class VARCHAR(16) NOT NULL DEFAULT 'unknown',
      geo_source VARCHAR(16) NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS visit_log_created_at_idx ON visit_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS visit_log_visitor_idx ON visit_log (visitor_hash);
    CREATE INDEX IF NOT EXISTS visit_log_country_idx ON visit_log (country);
  `)

  tableReady = true
}

/** Simpan satu kunjungan. */
export async function recordVisit(visit: NewVisitLog): Promise<void> {
  await ensureVisitTable()
  await db.insert(visitLog).values(visit)
}

export interface VisitPoint {
  city: string
  region: string | null
  country: string | null
  latitude: number
  longitude: number
  visits: number
  visitors: number
  lastSeen: Date
}

export interface VisitCountryRow {
  country: string
  visits: number
  visitors: number
}

export interface VisitSummary {
  /** Titik yang punya koordinat — hanya ini yang bisa digambar di peta. */
  points: VisitPoint[]
  countries: VisitCountryRow[]
  totalVisits: number
  totalVisitors: number
  /**
   * Kunjungan tanpa koordinat sama sekali.
   *
   * Sengaja dihitung dan ditampilkan, bukan disembunyikan: peta yang memuat
   * seribu titik dari sepuluh ribu kunjungan memberi kesan sebaran yang jauh
   * lebih lengkap daripada yang sebenarnya diketahui.
   */
  withoutLocation: number
}

/** Rentang waktu yang boleh diminta. Nilai di luar daftar ditolak diam-diam. */
export const VISIT_WINDOWS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 } as const
export type VisitWindow = keyof typeof VISIT_WINDOWS

export function parseVisitWindow(value: string | undefined): VisitWindow {
  return value && value in VISIT_WINDOWS ? (value as VisitWindow) : '30d'
}

/**
 * Sebaran kunjungan untuk peta dan tabel pendampingnya.
 *
 * Dikelompokkan per kota, bukan per baris: peta dengan sepuluh ribu penanda
 * bertumpuk di satu kota tidak memberi tahu apa pun selain bahwa kotanya ramai,
 * dan itu justru lebih terbaca sebagai satu lingkaran besar.
 *
 * Koordinatnya dibulatkan dua desimal saat dikelompokkan — kira-kira satu
 * kilometer. Tepi jaringan memang sudah memberi titik pusat kota, tetapi
 * pembulatan ini menjamin dua kunjungan dari kota yang sama tidak terpecah jadi
 * dua lingkaran hanya karena selisih di desimal keenam.
 */
export async function getVisitSummary(window: VisitWindow = '30d'): Promise<VisitSummary> {
  await ensureVisitTable()

  const days = VISIT_WINDOWS[window]
  const since = sql`NOW() - ${`${days} days`}::interval`

  const [points, countries, totals] = await Promise.all([
    db.execute<{
      city: string
      region: string | null
      country: string | null
      latitude: number
      longitude: number
      visits: number
      visitors: number
      last_seen: Date
    }>(sql`
      SELECT
        COALESCE(city, 'Tidak diketahui') AS city,
        MAX(region) AS region,
        MAX(country) AS country,
        ROUND(latitude::numeric, 2)::float8 AS latitude,
        ROUND(longitude::numeric, 2)::float8 AS longitude,
        COUNT(*)::int AS visits,
        COUNT(DISTINCT visitor_hash)::int AS visitors,
        MAX(created_at) AS last_seen
      FROM visit_log
      WHERE created_at >= ${since}
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      GROUP BY city, ROUND(latitude::numeric, 2), ROUND(longitude::numeric, 2)
      ORDER BY visits DESC
      LIMIT 500
    `),

    db.execute<{ country: string; visits: number; visitors: number }>(sql`
      SELECT
        country,
        COUNT(*)::int AS visits,
        COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM visit_log
      WHERE created_at >= ${since} AND country IS NOT NULL
      GROUP BY country
      ORDER BY visits DESC
      LIMIT 20
    `),

    db.execute<{ visits: number; visitors: number; without_location: number }>(sql`
      SELECT
        COUNT(*)::int AS visits,
        COUNT(DISTINCT visitor_hash)::int AS visitors,
        COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS without_location
      FROM visit_log
      WHERE created_at >= ${since}
    `),
  ])

  // Driver postgres-js mengembalikan baris sebagai larik biasa, bukan objek
  // berpembungkus `.rows` seperti driver Neon.
  const summary = totals[0]

  return {
    points: points.map((row) => ({
      city: row.city,
      region: row.region,
      country: row.country,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      visits: Number(row.visits),
      visitors: Number(row.visitors),
      lastSeen: new Date(row.last_seen),
    })),
    countries: countries.map((row) => ({
      country: row.country,
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    })),
    totalVisits: Number(summary?.visits ?? 0),
    totalVisitors: Number(summary?.visitors ?? 0),
    withoutLocation: Number(summary?.without_location ?? 0),
  }
}
