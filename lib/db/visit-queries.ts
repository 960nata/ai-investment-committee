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
import { cache } from '@/lib/cache/redis'
import { clickLog, visitLog, type NewClickLog, type NewVisitLog } from './schema'

/**
 * Satu janji untuk seluruh proses, bukan satu bendera.
 *
 * Halaman analitik memanggil `getVisitSummary` dan `getVisitAnalytics`
 * bersamaan. Dengan bendera boolean, keduanya melihat "belum siap" di proses
 * yang baru menyala, lalu dua DDL yang sama berjalan bersamaan dan saling
 * bertabrakan di katalog Postgres — kueri kedua gagal dan laporan trafik hilang
 * pada kunjungan pertama setiap kali server dinyalakan ulang. Janji yang dibagi
 * membuat pemanggil kedua menunggu yang pertama. Bila gagal, janjinya dibuang
 * supaya permintaan berikutnya mencoba lagi alih-alih mewarisi galat lama.
 */
let tableReady: Promise<void> | null = null

export function ensureVisitTable(): Promise<void> {
  tableReady ??= createVisitTables().catch((err) => {
    tableReady = null
    throw err
  })
  return tableReady
}

async function createVisitTables(): Promise<void> {
  // Cek murah dulu. DDL di bawah memuat ALTER TABLE, yang butuh kunci eksklusif
  // atas visit_log: di produksi ia antre di belakang INSERT kunjungan yang terus
  // mengalir, kena statement_timeout, dan seluruh laporan ikut gagal padahal
  // tabelnya sudah lengkap. Kolom `referrer` adalah yang paling akhir datang.
  const [state] = await db.execute<{ ready: boolean }>(sql`
    SELECT to_regclass('click_log') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'visit_log' AND column_name = 'referrer'
       ) AS ready
  `)
  if (state?.ready) return

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

    -- Kolom yang datang belakangan. ADD COLUMN IF NOT EXISTS supaya basis data
    -- yang sudah berjalan ikut naik tanpa migrasi terpisah.
    ALTER TABLE visit_log ADD COLUMN IF NOT EXISTS browser VARCHAR(32);
    ALTER TABLE visit_log ADD COLUMN IF NOT EXISTS os VARCHAR(32);
    ALTER TABLE visit_log ADD COLUMN IF NOT EXISTS referrer VARCHAR(128);

    CREATE TABLE IF NOT EXISTS click_log (
      id SERIAL PRIMARY KEY,
      visitor_hash VARCHAR(32) NOT NULL,
      path VARCHAR(255) NOT NULL,
      label VARCHAR(80),
      href VARCHAR(255),
      tag VARCHAR(16),
      x_pct DOUBLE PRECISION NOT NULL,
      y_pct DOUBLE PRECISION NOT NULL,
      device_class VARCHAR(16) NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS click_log_created_at_idx ON click_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS click_log_path_idx ON click_log (path);
  `)
}

/** Simpan satu kunjungan. */
export async function recordVisit(visit: NewVisitLog): Promise<void> {
  await ensureVisitTable()
  await db.insert(visitLog).values(visit)
}

/** Simpan sekumpulan klik dari satu halaman. */
export async function recordClicks(clicks: NewClickLog[]): Promise<void> {
  if (clicks.length === 0) return
  await ensureVisitTable()
  await db.insert(clickLog).values(clicks)
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
export const VISIT_WINDOWS = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '365d': 365,
  '730d': 730,
} as const

/**
 * Ember tren. Rentang panjang dikelompokkan per minggu atau bulan: 730 titik
 * harian di satu grafik selebar layar hanya terbaca sebagai pita bergerigi.
 */
export type TrendUnit = 'hour' | 'day' | 'week' | 'month'

export function trendUnit(days: number): TrendUnit {
  if (days <= 1) return 'hour'
  if (days <= 90) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}
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

// ---------------------------------------------------------------------------
// Laporan lengkap untuk halaman analitik admin
// ---------------------------------------------------------------------------

/**
 * Halaman portal admin tidak ikut dihitung. Pengelola membuka dasbornya
 * sendiri berkali-kali sehari, dan kunjungan itu bukan trafik situs.
 */
const PUBLIC_ONLY = sql`path NOT LIKE '/admin%'`

/** Zona waktu tampilan: jam dan hari di laporan mengikuti WIB. */
const TZ = 'Asia/Jakarta'

export interface CountRow {
  label: string
  views: number
  visitors: number
}

export interface TrendPoint {
  /** Awal ember waktu, ISO. */
  at: string
  views: number
  visitors: number
}

export interface PageRow {
  path: string
  views: number
  visitors: number
  lastSeen: string
}

export interface VisitorRow {
  id: string
  views: number
  pages: number
  sessions: number
  city: string | null
  country: string | null
  device: string
  browser: string | null
  os: string | null
  lastPath: string
  firstSeen: string
  lastSeen: string
  returning: boolean
}

export interface ClickTarget {
  label: string
  href: string | null
  path: string
  clicks: number
  visitors: number
}

export interface ClickDot {
  x: number
  y: number
  weight: number
}

export interface VisitAnalytics {
  window: VisitWindow
  totals: {
    views: number
    visitors: number
    sessions: number
    returning: number
    clicks: number
    bounceSessions: number
  }
  previous: { views: number; visitors: number }
  live: { last5: number; last30: number; pagesNow: CountRow[] }
  trend: { unit: TrendUnit; points: TrendPoint[] }
  pages: PageRow[]
  entryPages: CountRow[]
  devices: CountRow[]
  browsers: CountRow[]
  os: CountRow[]
  referrers: CountRow[]
  /** [hari 0=Minggu][jam 0..23] jumlah tayangan, jam WIB. */
  heatmap: number[][]
  visitors: VisitorRow[]
  clickTargets: ClickTarget[]
  clickPages: CountRow[]
  heatPath: string | null
  clickDots: ClickDot[]
}

const n = (v: unknown) => Number(v ?? 0)

/**
 * Seluruh angka halaman analitik, dibaca langsung dari `visit_log` dan
 * `click_log`. Dipanggil dari Server Component saja — tidak ada rute API yang
 * mengembalikan data ini, jadi tidak ada yang bisa membacanya dari luar.
 */
export async function getVisitAnalytics(
  window: VisitWindow = '7d',
  heatPathWanted?: string,
): Promise<VisitAnalytics> {
  await ensureVisitTable()

  const days = VISIT_WINDOWS[window]
  const interval = `${days} days`
  const since = sql`NOW() - ${interval}::interval`
  const prevSince = sql`NOW() - (${interval}::interval * 2)`
  const unit = trendUnit(days)

  const scoped = sql`created_at >= ${since} AND ${PUBLIC_ONLY}`

  // Satu kueri untuk empat rincian sekaligus. Tiap perjalanan ke pooler
  // Supabase adalah satu kesempatan macet, jadi jumlahnya ditekan.
  const breakdownPart = (dim: string, column: string, fallback: string) => sql`
    SELECT ${dim}::text AS dim,
           COALESCE(NULLIF(${sql.raw(column)}, ''), ${fallback}) AS label,
           COUNT(*)::int AS views,
           COUNT(DISTINCT visitor_hash)::int AS visitors
    FROM visit_log
    WHERE ${scoped}
    GROUP BY 2
  `

  const [
    totals,
    sessions,
    pagesNow,
    trend,
    pages,
    entryPages,
    breakdowns,
    heat,
    visitors,
    clickTargets,
    clickPages,
  ] = await Promise.all([
    // Semua angka tunggal dalam satu perjalanan: periode ini, periode
    // sebelumnya, pengunjung aktif, dan jumlah klik.
    db.execute<{
      views: number
      visitors: number
      returning: number
      prev_views: number
      prev_visitors: number
      last5: number
      last30: number
      clicks: number
    }>(sql`
      WITH w AS (SELECT DISTINCT visitor_hash FROM visit_log WHERE ${scoped})
      SELECT
        (SELECT COUNT(*) FROM visit_log WHERE ${scoped})::int AS views,
        (SELECT COUNT(*) FROM w)::int AS visitors,
        (SELECT COUNT(*) FROM w WHERE EXISTS (
          SELECT 1 FROM visit_log p
          WHERE p.visitor_hash = w.visitor_hash AND p.created_at < ${since}
        ))::int AS returning,
        (SELECT COUNT(*) FROM visit_log
          WHERE created_at >= ${prevSince} AND created_at < ${since} AND ${PUBLIC_ONLY})::int AS prev_views,
        (SELECT COUNT(DISTINCT visitor_hash) FROM visit_log
          WHERE created_at >= ${prevSince} AND created_at < ${since} AND ${PUBLIC_ONLY})::int AS prev_visitors,
        (SELECT COUNT(DISTINCT visitor_hash) FROM visit_log
          WHERE created_at >= NOW() - INTERVAL '5 minutes' AND ${PUBLIC_ONLY})::int AS last5,
        (SELECT COUNT(DISTINCT visitor_hash) FROM visit_log
          WHERE created_at >= NOW() - INTERVAL '30 minutes' AND ${PUBLIC_ONLY})::int AS last30,
        (SELECT COUNT(*) FROM click_log WHERE ${scoped})::int AS clicks
    `),

    // Sesi = rangkaian kunjungan satu pengunjung tanpa jeda lebih dari 30 menit.
    db.execute<{ sessions: number; bounces: number }>(sql`
      WITH v AS (
        SELECT visitor_hash, created_at,
          CASE WHEN LAG(created_at) OVER w IS NULL
                 OR created_at - LAG(created_at) OVER w > INTERVAL '30 minutes'
               THEN 1 ELSE 0 END AS starts
        FROM visit_log
        WHERE ${scoped}
        WINDOW w AS (PARTITION BY visitor_hash ORDER BY created_at)
      ),
      s AS (
        SELECT visitor_hash, SUM(starts) OVER (PARTITION BY visitor_hash ORDER BY created_at) AS sid
        FROM v
      )
      SELECT
        (SELECT COUNT(*) FROM (SELECT DISTINCT visitor_hash, sid FROM s) x)::int AS sessions,
        (SELECT COUNT(*) FROM (SELECT visitor_hash, sid FROM s GROUP BY 1, 2 HAVING COUNT(*) = 1) y)::int AS bounces
    `),

    db.execute<{ label: string; views: number; visitors: number }>(sql`
      SELECT path AS label, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM visit_log
      WHERE created_at >= NOW() - INTERVAL '30 minutes' AND ${PUBLIC_ONLY}
      GROUP BY path ORDER BY views DESC LIMIT 6
    `),

    db.execute<{ at: string; views: number; visitors: number }>(sql`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, (NOW() - ${interval}::interval) AT TIME ZONE ${TZ}),
          date_trunc(${unit}, NOW() AT TIME ZONE ${TZ}),
          ${`1 ${unit}`}::interval
        ) AS at
      ),
      agg AS (
        SELECT date_trunc(${unit}, created_at AT TIME ZONE ${TZ}) AS at,
               COUNT(*)::int AS views,
               COUNT(DISTINCT visitor_hash)::int AS visitors
        FROM visit_log
        WHERE ${scoped}
        GROUP BY 1
      )
      SELECT to_char(b.at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
             COALESCE(a.views, 0)::int AS views,
             COALESCE(a.visitors, 0)::int AS visitors
      FROM buckets b LEFT JOIN agg a ON a.at = b.at
      ORDER BY b.at
    `),

    db.execute<{ path: string; views: number; visitors: number; last_seen: Date }>(sql`
      SELECT path, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors,
             MAX(created_at) AS last_seen
      FROM visit_log
      WHERE ${scoped}
      GROUP BY path ORDER BY views DESC LIMIT 20
    `),

    // Halaman pertama tiap sesi: pintu masuk pengunjung ke situs.
    db.execute<{ label: string; views: number; visitors: number }>(sql`
      WITH v AS (
        SELECT visitor_hash, path, created_at,
          LAG(created_at) OVER (PARTITION BY visitor_hash ORDER BY created_at) AS prev
        FROM visit_log WHERE ${scoped}
      )
      SELECT path AS label, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM v
      WHERE prev IS NULL OR created_at - prev > INTERVAL '30 minutes'
      GROUP BY path ORDER BY views DESC LIMIT 8
    `),

    db.execute<{ dim: string; label: string; views: number; visitors: number }>(sql`
      ${breakdownPart('device', 'device_class', 'unknown')}
      UNION ALL ${breakdownPart('browser', 'browser', 'Belum tercatat')}
      UNION ALL ${breakdownPart('os', 'os', 'Belum tercatat')}
      UNION ALL ${breakdownPart('referrer', 'referrer', 'Langsung / internal')}
    `),

    db.execute<{ dow: number; hour: number; views: number }>(sql`
      SELECT EXTRACT(DOW FROM created_at AT TIME ZONE ${TZ})::int AS dow,
             EXTRACT(HOUR FROM created_at AT TIME ZONE ${TZ})::int AS hour,
             COUNT(*)::int AS views
      FROM visit_log
      WHERE ${scoped}
      GROUP BY 1, 2
    `),

    db.execute<{
      visitor_hash: string
      views: number
      pages: number
      city: string | null
      country: string | null
      device: string
      browser: string | null
      os: string | null
      last_path: string
      first_seen: Date
      last_seen: Date
      returning: boolean
      sessions: number
    }>(sql`
      WITH v AS (
        SELECT *,
          CASE WHEN LAG(created_at) OVER (PARTITION BY visitor_hash ORDER BY created_at) IS NULL
                 OR created_at - LAG(created_at) OVER (PARTITION BY visitor_hash ORDER BY created_at) > INTERVAL '30 minutes'
               THEN 1 ELSE 0 END AS starts
        FROM visit_log WHERE ${scoped}
      )
      SELECT
        visitor_hash,
        COUNT(*)::int AS views,
        COUNT(DISTINCT path)::int AS pages,
        SUM(starts)::int AS sessions,
        (ARRAY_AGG(city ORDER BY created_at DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
        (ARRAY_AGG(country ORDER BY created_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
        (ARRAY_AGG(device_class ORDER BY created_at DESC))[1] AS device,
        (ARRAY_AGG(browser ORDER BY created_at DESC) FILTER (WHERE browser IS NOT NULL))[1] AS browser,
        (ARRAY_AGG(os ORDER BY created_at DESC) FILTER (WHERE os IS NOT NULL))[1] AS os,
        (ARRAY_AGG(path ORDER BY created_at DESC))[1] AS last_path,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen,
        EXISTS (
          SELECT 1 FROM visit_log p
          WHERE p.visitor_hash = v.visitor_hash AND p.created_at < ${since}
        ) AS returning
      FROM v
      GROUP BY visitor_hash
      ORDER BY MAX(created_at) DESC
      LIMIT 40
    `),

    db.execute<{ label: string; href: string | null; path: string; clicks: number; visitors: number }>(sql`
      SELECT label, MAX(href) AS href, path,
             COUNT(*)::int AS clicks, COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM click_log
      WHERE ${scoped} AND label IS NOT NULL
      GROUP BY label, path
      ORDER BY clicks DESC
      LIMIT 15
    `),

    db.execute<{ label: string; views: number; visitors: number }>(sql`
      SELECT path AS label, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM click_log
      WHERE ${scoped}
      GROUP BY path ORDER BY views DESC LIMIT 12
    `),
  ])

  const toCount = (rows: { label: string; views: number; visitors: number }[]): CountRow[] =>
    rows.map((r) => ({ label: r.label, views: n(r.views), visitors: n(r.visitors) }))

  const clickPageRows = toCount(clickPages)
  const heatPath =
    (heatPathWanted && clickPageRows.some((p) => p.label === heatPathWanted) ? heatPathWanted : null) ??
    clickPageRows[0]?.label ??
    null

  // Titik peta panas dikelompokkan ke kisi 2% supaya ribuan klik tidak
  // dikirim satu per satu ke peramban.
  const dots = heatPath
    ? await db.execute<{ x: number; y: number; weight: number }>(sql`
        SELECT ROUND((x_pct * 50)::numeric) / 50 AS x,
               ROUND((y_pct * 50)::numeric) / 50 AS y,
               COUNT(*)::int AS weight
        FROM click_log
        WHERE ${scoped} AND path = ${heatPath}
        GROUP BY 1, 2
        ORDER BY weight DESC
        LIMIT 400
      `)
    : []

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const cell of heat) heatmap[n(cell.dow)][n(cell.hour)] = n(cell.views)

  const t = totals[0]
  const s = sessions[0]
  const dim = (name: string, limit = 8) =>
    toCount(
      breakdowns
        .filter((r) => r.dim === name)
        .sort((a, b) => n(b.views) - n(a.views))
        .slice(0, limit),
    )

  return {
    window,
    totals: {
      views: n(t?.views),
      visitors: n(t?.visitors),
      sessions: n(s?.sessions),
      returning: n(t?.returning),
      clicks: n(t?.clicks),
      bounceSessions: n(s?.bounces),
    },
    previous: { views: n(t?.prev_views), visitors: n(t?.prev_visitors) },
    live: { last5: n(t?.last5), last30: n(t?.last30), pagesNow: toCount(pagesNow) },
    trend: {
      unit,
      points: trend.map((r) => ({ at: r.at, views: n(r.views), visitors: n(r.visitors) })),
    },
    pages: pages.map((r) => ({
      path: r.path,
      views: n(r.views),
      visitors: n(r.visitors),
      lastSeen: new Date(r.last_seen).toISOString(),
    })),
    entryPages: toCount(entryPages),
    devices: dim('device', 6),
    browsers: dim('browser'),
    os: dim('os'),
    referrers: dim('referrer'),
    heatmap,
    visitors: visitors.map((r) => ({
      id: r.visitor_hash.slice(0, 8).toUpperCase(),
      views: n(r.views),
      pages: n(r.pages),
      sessions: n(r.sessions),
      city: r.city,
      country: r.country,
      device: r.device,
      browser: r.browser,
      os: r.os,
      lastPath: r.last_path,
      firstSeen: new Date(r.first_seen).toISOString(),
      lastSeen: new Date(r.last_seen).toISOString(),
      returning: Boolean(r.returning),
    })),
    clickTargets: clickTargets.map((r) => ({
      label: r.label,
      href: r.href,
      path: r.path,
      clicks: n(r.clicks),
      visitors: n(r.visitors),
    })),
    clickPages: clickPageRows,
    heatPath,
    clickDots: dots.map((d) => ({ x: n(d.x), y: n(d.y), weight: n(d.weight) })),
  }
}

/** Pengunjung aktif saat ini — selalu dihitung segar, tidak pernah dari cache. */
export async function getVisitLive(): Promise<VisitAnalytics['live']> {
  await ensureVisitTable()
  const [counts] = await db.execute<{ last5: number; last30: number }>(sql`
    SELECT
      COUNT(DISTINCT visitor_hash) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes')::int AS last5,
      COUNT(DISTINCT visitor_hash)::int AS last30
    FROM visit_log
    WHERE created_at >= NOW() - INTERVAL '30 minutes' AND ${PUBLIC_ONLY}
  `)
  const pages = await db.execute<{ label: string; views: number; visitors: number }>(sql`
    SELECT path AS label, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
    FROM visit_log
    WHERE created_at >= NOW() - INTERVAL '30 minutes' AND ${PUBLIC_ONLY}
    GROUP BY path ORDER BY views DESC LIMIT 6
  `)
  return {
    last5: n(counts?.last5),
    last30: n(counts?.last30),
    pagesNow: pages.map((r) => ({ label: r.label, views: n(r.views), visitors: n(r.visitors) })),
  }
}

/**
 * Laporan trafik lewat cache Redis.
 *
 * Laporan setahun memindai seluruh catatan kunjungan dan pooler sesekali
 * lambat; membuka halaman yang sama berkali-kali tidak perlu menghitungnya
 * ulang. Masa simpan mengikuti panjang rentang — angka sehari bergerak cepat,
 * angka setahun tidak. Pengunjung aktif dihitung segar di setiap pembukaan.
 * Tanpa Redis, perilakunya sama dengan `getVisitAnalytics`.
 */
export async function getVisitAnalyticsCached(window: VisitWindow = '7d', heatPathWanted?: string): Promise<VisitAnalytics> {
  const days = VISIT_WINDOWS[window]
  const ttl = days <= 7 ? 60 : days <= 90 ? 300 : 900
  const key = `analytics:visits:v1:${window}:${encodeURIComponent(heatPathWanted ?? '')}`
  const report = await cache.getOrSet(key, () => getVisitAnalytics(window, heatPathWanted), ttl)
  const live = await getVisitLive().catch(() => report.live)
  return { ...report, live }
}
