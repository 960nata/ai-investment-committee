/**
 * Penerjemah teks antarmuka, dengan cache di Postgres.
 *
 * Dipakai pemilih bahasa di header untuk menerjemahkan halaman apa pun yang
 * belum punya versi bahasa sendiri — teks statis maupun isi dari basis data.
 * Tidak ada layanan terjemahan pihak ketiga: yang menulis terjemahannya adalah
 * model dari keyring yang sama dengan agen lain.
 *
 * Tiap kalimat hanya diterjemahkan sekali per bahasa, lalu disimpan. Kunjungan
 * berikutnya — oleh siapa pun — membaca dari cache tanpa memanggil model. Itu
 * yang membuat fitur ini murah: biaya model hanya dibayar untuk kalimat yang
 * benar-benar baru.
 */

import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { complete } from '@/lib/ai/registry'
import { LOCALE_INFO, type Locale } from '@/lib/i18n/locales'

import { STATIC_DICTIONARY } from './static-dictionary'

/** Batas per permintaan — endpoint ini publik. */
export const MAX_TEXTS = 150
export const MAX_TEXT_LENGTH = 1000

/**
 * Pagu kalimat baru per hari untuk seluruh situs. Cache yang sudah terisi
 * tidak menghitung; yang dihitung hanya kalimat yang harus dikirim ke model.
 * Situs ini punya beberapa ribu kalimat unik, jadi pagu ini cukup untuk mengisi
 * seluruh cache dalam sehari tanpa membuka jalan bagi orang yang mengirim teks
 * acak untuk menghabiskan kuota.
 */
const DAILY_NEW_TEXT_CEILING = Number(process.env.UI_TRANSLATE_DAILY_CEILING) || 4000

/** Berapa kalimat dikirim ke model dalam satu panggilan (35 untuk reliabilitas tinggi respon JSON). */
const BATCH_SIZE = 35

let tableReady = false

async function ensureTable(): Promise<void> {
  if (tableReady) return
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ui_translation (
      locale VARCHAR(8) NOT NULL,
      source_hash CHAR(40) NOT NULL,
      source TEXT NOT NULL,
      translated TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (locale, source_hash)
    );
    CREATE INDEX IF NOT EXISTS ui_translation_created_idx ON ui_translation (created_at);
  `)
  tableReady = true
}

const hashOf = (text: string) => createHash('sha1').update(text).digest('hex')

async function newTextsToday(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from ui_translation where created_at >= date_trunc('day', now())
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0)
}

/** Minta model menerjemahkan satu kelompok kalimat. Null bila balasannya tidak bisa dipercaya. */
async function translateBatch(texts: string[], locale: Locale): Promise<string[] | null> {
  const language = LOCALE_INFO[locale].english
  const response = await complete({
    messages: [
      {
        role: 'system',
        content: 'You translate user-interface text. You always reply with one valid JSON object and nothing else.',
      },
      {
        role: 'user',
        content: `Translate each string below into natural ${language} for the interface of a financial market analysis website.

Rules:
- Most strings are Indonesian; a few may already be English. Translate all of them into ${language}.
- Keep numbers, dates, prices, percentages, and asset tickers (e.g. BTCUSDT, BBCA.JK, ^JKSE, NVDA) exactly as written.
- Keep the brand name "Komite" unchanged.
- Keep the meaning and the tone. Short labels stay short. Do not add explanations.
- This site never gives buy or sell advice; do not translate anything into a trading instruction.
- Return exactly ${texts.length} strings, in the same order.

Reply as: {"t": ["...", "..."]}

Strings:
${JSON.stringify(texts)}`,
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 6000,
    json: true,
  })

  try {
    const clean = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(clean) as { t?: unknown }
    if (!Array.isArray(parsed.t) || parsed.t.length !== texts.length) return null
    if (!parsed.t.every((x) => typeof x === 'string' && x.trim().length > 0)) return null
    return parsed.t as string[]
  } catch {
    return null
  }
}

/** Kelompok terkecil yang masih dicoba ulang dengan cara dibelah. */
const MIN_SPLIT = 4

/**
 * Terjemahkan satu kelompok dan simpan hasilnya.
 *
 * Satu balasan model yang cacat — jumlah butir meleset satu, JSON terpotong —
 * tidak boleh membuang enam puluh kalimat sekaligus. Kelompok yang gagal
 * dibelah dua dan dicoba lagi sampai tinggal beberapa kalimat, sehingga yang
 * hilang hanya kalimat yang memang bermasalah.
 */
async function translateAndStore(
  batch: string[],
  locale: Locale,
  cached: Map<string, string>,
): Promise<number> {
  let out: string[] | null = null
  try {
    out = await translateBatch(batch, locale)
  } catch (err) {
    console.warn('[ui-translate] model gagal:', err instanceof Error ? err.message : err)
    // Galat penyedia (kuota habis, jaringan) tidak membaik dengan dibelah.
    return 0
  }

  if (!out) {
    if (batch.length <= MIN_SPLIT) return 0
    const mid = Math.ceil(batch.length / 2)
    return (
      (await translateAndStore(batch.slice(0, mid), locale, cached)) +
      (await translateAndStore(batch.slice(mid), locale, cached))
    )
  }

  const values = batch.map((source, j) => sql`(${locale}, ${hashOf(source)}, ${source}, ${out![j]})`)
  await db.execute(sql`
    insert into ui_translation (locale, source_hash, source, translated)
    values ${sql.join(values, sql`, `)}
    on conflict (locale, source_hash) do nothing
  `)
  batch.forEach((source, j) => cached.set(hashOf(source), out![j]))
  return batch.length
}

export interface TranslateResult {
  /** Terjemahan per teks masukan, urutan sama. Null bila belum bisa diterjemahkan. */
  translations: (string | null)[]
  fromCache: number
  translated: number
  /** Benar bila pagu harian sudah tercapai sehingga sebagian teks dilewati. */
  capped: boolean
}

export async function translateUiTexts(texts: string[], locale: Locale): Promise<TranslateResult> {
  await ensureTable()

  const unique = [...new Set(texts)]
  const hashes = unique.map(hashOf)

  const cached = new Map<string, string>()

  // 1. Periksa kamus statis instan lebih dulu (0ms)
  const dict = locale !== 'id' ? STATIC_DICTIONARY[locale as Exclude<Locale, 'id'>] : null
  if (dict) {
    for (const t of unique) {
      if (dict[t]) {
        cached.set(hashOf(t), dict[t])
      }
    }
  }

  // 2. Kueri tabel ui_translation di basis data untuk yang belum ditemukan
  const stillMissingHashes = unique
    .filter((t) => !cached.has(hashOf(t)))
    .map(hashOf)

  if (stillMissingHashes.length > 0) {
    const rows = await db.execute<{ source_hash: string; translated: string }>(sql`
      select source_hash, translated from ui_translation
      where locale = ${locale} and source_hash in (${sql.join(stillMissingHashes.map((h) => sql`${h}`), sql`, `)})
    `)
    for (const r of rows as unknown as { source_hash: string; translated: string }[]) {
      cached.set(r.source_hash, r.translated)
    }
  }

  let missing = unique.filter((t) => !cached.has(hashOf(t)))
  let capped = false
  let translatedCount = 0

  if (missing.length > 0) {
    const room = DAILY_NEW_TEXT_CEILING - (await newTextsToday())
    if (room <= 0) {
      capped = true
      missing = []
    } else if (missing.length > room) {
      capped = true
      missing = missing.slice(0, room)
    }
  }

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const done = await translateAndStore(missing.slice(i, i + BATCH_SIZE), locale, cached)
    translatedCount += done
  }

  return {
    translations: texts.map((t) => cached.get(hashOf(t)) ?? null),
    fromCache: unique.length - missing.length,
    translated: translatedCount,
    capped,
  }
}
