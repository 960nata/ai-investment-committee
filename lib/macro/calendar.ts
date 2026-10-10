/**
 * Kalender makro: jadwal rilis data dan rapat bank sentral pekan ini.
 *
 * Sumbernya umpan JSON publik Forex Factory (nfs.faireconomy.media) — tanpa
 * kunci, tapi juga tanpa kontrak: bentuknya bisa berubah, dan isinya hanya
 * pekan berjalan. Karena itu:
 *
 *   - hasilnya disimpan di Redis satu jam, jadi pengunjung tidak memukul
 *     sumbernya setiap kali halaman dibuka;
 *   - setiap peristiwa juga disalin ke tabel `macro_event`, supaya riwayat
 *     pekan-pekan sebelumnya tidak hilang ketika umpannya berganti minggu;
 *   - kegagalan mengembalikan isi tabel, bukan galat.
 *
 * Yang TIDAK ada di umpan ini: rilis Indonesia (RDG BI, inflasi BPS). Halaman
 * menyebutkan itu terus terang alih-alih mengisinya dengan jadwal karangan.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cache } from '@/lib/cache/redis'
import { fetchWithTimeout } from '@/lib/http/fetch'
import { createIfMissing } from '@/lib/db/create-if-missing'

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const CACHE_KEY = 'macro:calendar:thisweek:v1'
const CACHE_TTL_SECONDS = 60 * 60

export type MacroImpact = 'High' | 'Medium' | 'Low' | 'Holiday'

export interface MacroEvent {
  title: string
  /** Kode mata uang yang terdampak (USD, EUR, CNY, …) atau "All". */
  country: string
  /** ISO 8601 dengan zona waktu. */
  date: string
  impact: MacroImpact
  forecast: string
  previous: string
}

interface RawEvent {
  title?: unknown
  country?: unknown
  date?: unknown
  impact?: unknown
  forecast?: unknown
  previous?: unknown
}

const IMPACTS = new Set<MacroImpact>(['High', 'Medium', 'Low', 'Holiday'])

/** Saring dan rapikan isi umpan. Baris dengan bentuk aneh dibuang, bukan ditebak. */
export function parseCalendar(raw: unknown): MacroEvent[] {
  if (!Array.isArray(raw)) return []
  return (raw as RawEvent[]).flatMap((e) => {
    if (typeof e.title !== 'string' || typeof e.country !== 'string' || typeof e.date !== 'string') return []
    if (Number.isNaN(Date.parse(e.date))) return []
    const impact = IMPACTS.has(e.impact as MacroImpact) ? (e.impact as MacroImpact) : 'Low'
    return [
      {
        title: e.title.slice(0, 160),
        country: e.country.slice(0, 8),
        date: new Date(e.date).toISOString(),
        impact,
        forecast: typeof e.forecast === 'string' ? e.forecast.slice(0, 32) : '',
        previous: typeof e.previous === 'string' ? e.previous.slice(0, 32) : '',
      },
    ]
  })
}

let tableReady: Promise<void> | null = null

function ensureTable(): Promise<void> {
  tableReady ??= createIfMissing('macro_event', sql`
      CREATE TABLE IF NOT EXISTS macro_event (
        id SERIAL PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        country VARCHAR(8) NOT NULL,
        event_at TIMESTAMPTZ NOT NULL,
        impact VARCHAR(8) NOT NULL,
        forecast VARCHAR(32) NOT NULL DEFAULT '',
        previous VARCHAR(32) NOT NULL DEFAULT '',
        source VARCHAR(32) NOT NULL DEFAULT 'forexfactory',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS macro_event_uq ON macro_event (title, country, event_at);
      CREATE INDEX IF NOT EXISTS macro_event_at_idx ON macro_event (event_at);
    `).catch((err) => {
    tableReady = null
    throw err
  })
  return tableReady
}

async function saveEvents(events: MacroEvent[]): Promise<void> {
  if (events.length === 0) return
  await ensureTable()
  await db.execute(sql`
    INSERT INTO macro_event (title, country, event_at, impact, forecast, previous)
    VALUES ${sql.join(
      events.map((e) => sql`(${e.title}, ${e.country}, ${e.date}::timestamptz, ${e.impact}, ${e.forecast}, ${e.previous})`),
      sql`, `,
    )}
    ON CONFLICT (title, country, event_at) DO UPDATE SET
      impact = EXCLUDED.impact,
      forecast = EXCLUDED.forecast,
      previous = EXCLUDED.previous,
      updated_at = NOW()
  `)
}

/** Peristiwa tersimpan dalam rentang, dipakai saat umpan gagal dan untuk riwayat. */
export async function storedEvents(from: Date, to: Date): Promise<MacroEvent[]> {
  await ensureTable()
  const rows = await db.execute<{
    title: string
    country: string
    event_at: Date | string
    impact: MacroImpact
    forecast: string
    previous: string
  }>(sql`
    SELECT title, country, event_at, impact, forecast, previous
    FROM macro_event
    WHERE event_at >= ${from.toISOString()}::timestamptz AND event_at < ${to.toISOString()}::timestamptz
    ORDER BY event_at
  `)
  return rows.map((r) => ({
    title: r.title,
    country: r.country,
    date: new Date(r.event_at).toISOString(),
    impact: r.impact,
    forecast: r.forecast,
    previous: r.previous,
  }))
}

export interface CalendarResult {
  events: MacroEvent[]
  /** 'live' dari umpan (atau cache-nya), 'stored' dari tabel karena umpan gagal. */
  origin: 'live' | 'stored'
}

export async function getMacroCalendar(): Promise<CalendarResult> {
  const cached = await cache.get<MacroEvent[]>(CACHE_KEY)
  if (cached) return { events: cached, origin: 'live' }

  try {
    const res = await fetchWithTimeout(FEED_URL, {
      label: 'Kalender makro',
      timeoutMs: 15_000,
      headers: { 'User-Agent': 'curl/8.7.1', Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const events = parseCalendar(await res.json())
    if (events.length === 0) throw new Error('umpan kosong')
    await cache.set(CACHE_KEY, events, CACHE_TTL_SECONDS)
    await saveEvents(events).catch((err) => console.warn('[MacroCalendar] gagal menyimpan riwayat:', err))
    return { events, origin: 'live' }
  } catch (err) {
    console.warn('[MacroCalendar] umpan gagal, memakai tabel:', err instanceof Error ? err.message : err)
    const now = new Date()
    const from = new Date(now.getTime() - 3 * 86_400_000)
    const to = new Date(now.getTime() + 7 * 86_400_000)
    return { events: await storedEvents(from, to).catch(() => []), origin: 'stored' }
  }
}

/** Peristiwa berdampak tinggi yang belum lewat — untuk peringatan dan laporan. */
export function upcomingHighImpact(events: MacroEvent[], withinHours = 72, now = Date.now()): MacroEvent[] {
  return events.filter((e) => {
    const t = Date.parse(e.date)
    return e.impact === 'High' && t >= now && t <= now + withinHours * 3_600_000
  })
}
