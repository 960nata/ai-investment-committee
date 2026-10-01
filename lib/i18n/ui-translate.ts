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
import { reserveTranslateChars } from '@/lib/http/budget'

import { STATIC_DICTIONARY } from './static-dictionary'

/**
 * Batas per permintaan — endpoint ini publik.
 *
 * Peramban mengirim paling banyak lima puluh teks sekali jalan, jadi batas
 * jumlah mengikutinya. Batas total karakter yang menahan satu permintaan agar
 * tidak berisi lima puluh paragraf penuh sekaligus; pagu harian yang sebenarnya
 * ada di `reserveTranslateChars`.
 */
export const MAX_TEXTS = 50
export const MAX_TEXT_LENGTH = 1000
export const MAX_REQUEST_CHARS = 12_000

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

/** Minta model menerjemahkan satu kelompok kalimat. Null bila balasannya tidak bisa dipercaya. */
async function translateBatch(texts: string[], locale: Locale): Promise<string[] | null> {
  const language = LOCALE_INFO[locale].english
  const response = await complete({
        feature: 'ui-translation',
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
- Placeholders such as {0}, {1} stand for numbers. Keep every placeholder exactly once, unchanged, placed where the number belongs in ${language} grammar.
- Keep the brand name "AI Investdesk" unchanged. "Komite" on its own is the name of the AI investment committee feature; translate it as a committee.
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

export interface TranslateCaller {
  /** Sidik alamat pemanggil (`callerHash`), bukan alamat mentah. */
  ipHash: string
  /** Diisi bila pemanggil sedang masuk; memindahkannya ke kantong anggota. */
  userId?: number
}

export async function translateUiTexts(
  texts: string[],
  locale: Locale,
  caller: TranslateCaller,
): Promise<TranslateResult> {
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

  // Pagu dipesan sebelum model dipanggil, dan kalimat yang tidak muat
  // dilewati utuh — memotong kalimat di tengah hanya menghasilkan terjemahan
  // yang salah.
  if (missing.length > 0) {
    const wanted = missing.reduce((sum, t) => sum + t.length, 0)
    const allowance = await reserveTranslateChars(wanted, caller)

    let room = allowance.granted
    const fitting = missing.filter((t) => {
      if (t.length > room) return false
      room -= t.length
      return true
    })
    capped = fitting.length < missing.length
    missing = fitting

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      translatedCount += await translateAndStore(missing.slice(i, i + BATCH_SIZE), locale, cached)
    }

    // Yang tidak muat dan yang gagal diterjemahkan tidak membelanjakan apa pun
    // yang layak dihitung, jadi pagunya dikembalikan.
    const spent = missing.reduce((sum, t) => sum + (cached.has(hashOf(t)) ? t.length : 0), 0)
    await allowance.release(allowance.granted - spent)
  }

  return {
    translations: texts.map((t) => cached.get(hashOf(t)) ?? null),
    fromCache: unique.length - missing.length,
    translated: translatedCount,
    capped,
  }
}
