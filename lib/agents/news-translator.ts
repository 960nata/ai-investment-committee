/**
 * Agen penulis ulang warta ke bahasa lain.
 *
 * Bukan layanan terjemahan. Model yang sama yang menulis artikel sumber diminta
 * menulis ulang artikelnya sebagai jurnalis keuangan penutur asli bahasa
 * sasaran: judul dan ringkasan disusun ulang untuk pencarian di bahasa itu,
 * bukan dialihbahasakan kata per kata.
 *
 * Satu hal yang tidak boleh berubah di bahasa mana pun: faktanya. Angka harus
 * sama persis nilainya, simbol aset tidak diterjemahkan, dan tidak ada klaim
 * baru. Hasil yang melanggar itu ditolak, bukan disimpan — versi bahasa lain
 * yang faktanya bergeser lebih buruk daripada versi yang tidak ada.
 */

import { complete } from '@/lib/ai/registry'
import {
  listNewsMissingTranslations,
  saveNewsTranslation,
} from '@/lib/db/news-queries'
import type { MarketNewsRow } from '@/lib/db/schema'
import { LOCALE_INFO, TRANSLATED_LOCALES, type Locale } from '@/lib/i18n/locales'

/** Aturan panjang untuk SEO, dibedakan untuk aksara CJK yang jauh lebih padat. */
const SEO_LIMITS: Record<Exclude<Locale, 'id'>, { title: string; summary: string }> = {
  en: { title: '65 characters', summary: '155 characters' },
  ru: { title: '70 characters', summary: '160 characters' },
  zh: { title: '32 Chinese characters', summary: '80 Chinese characters' },
  ja: { title: '32 Japanese characters', summary: '90 Japanese characters' },
}

interface TranslationPayload {
  title?: string
  summary?: string
  tags?: string[]
  keyTakeaways?: string[]
  contentMarkdown?: string
  imageAlt?: string
  imageCaption?: string
}

function buildPrompt(article: MarketNewsRow, locale: Exclude<Locale, 'id'>): string {
  const lang = LOCALE_INFO[locale].english
  const limits = SEO_LIMITS[locale]

  return `You are a senior financial journalist who writes natively in ${lang}.
Rewrite the Indonesian market-analysis article below as an original ${lang} article for ${lang}-speaking readers.

HARD RULES — a violation makes the output unusable:
1. Facts do not change. Every number keeps exactly the same value. Only adapt the
   decimal and thousands separators to ${lang} conventions (e.g. Indonesian "1,42" is "1.42" in English).
2. Asset symbols and tickers stay exactly as written (${article.mentionedSymbols.join(', ') || 'none'}).
   Company names may be written the way ${lang} financial media usually write them.
3. Add no new facts, numbers, quotes, forecasts, or sources that are not in the original.
4. No trading instructions: never tell the reader to buy, sell, or accumulate anything.
5. Keep the Markdown and inline HTML structure (headings, lists, <table>, <blockquote>, <mark>, <strong>, <u>, <hr>).
6. Write natural ${lang}, not a word-for-word translation. Use the terminology ${lang} financial media use.

SEO for ${lang} search:
- "title": what a ${lang} reader would actually search for, at most ${limits.title}.
- "summary": meta description, at most ${limits.summary}, contains the main keyword.
- "tags": 3-5 short ${lang} keywords.

Reply with ONE JSON object only, no code fences:
{
  "title": "...",
  "summary": "...",
  "tags": ["..."],
  "keyTakeaways": ["... same number of points as the original ..."],
  "contentMarkdown": "... full article ...",
  "imageAlt": "... alt text for the cover photo, max 120 characters ...",
  "imageCaption": "... photo caption, max 160 characters ..."
}

ORIGINAL (Indonesian)
Title: ${article.title}
Summary: ${article.summary}
Key takeaways:
${article.keyTakeaways.map((k) => `- ${k}`).join('\n')}
Cover photo alt: ${article.featuredImage?.alt ?? ''}
Cover photo caption: ${article.featuredImage?.caption ?? ''}

Article:
${article.contentMarkdown}`
}

function parsePayload(text: string): TranslationPayload {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(clean) as TranslationPayload
}

/**
 * Tolak versi yang terlihat rusak atau menyimpang.
 *
 * Pemeriksaannya sengaja kasar dan murah: kolom wajib terisi, panjangnya masuk
 * akal dibanding sumbernya, dan tiap simbol aset yang disebut sumber masih ada.
 * Aksara CJK jauh lebih padat, jadi ambang panjangnya lebih rendah.
 */
function validate(
  article: MarketNewsRow,
  locale: Exclude<Locale, 'id'>,
  p: TranslationPayload,
): string | null {
  if (!p.title?.trim() || !p.summary?.trim() || !p.contentMarkdown?.trim()) {
    return 'judul, ringkasan, atau isi kosong'
  }

  const ratio = p.contentMarkdown.length / Math.max(1, article.contentMarkdown.length)
  const minRatio = locale === 'zh' || locale === 'ja' ? 0.2 : 0.55
  if (ratio < minRatio) return `isi terlalu pendek (${Math.round(ratio * 100)}% dari sumber)`

  const missing = article.mentionedSymbols.filter(
    (sym) => article.contentMarkdown.includes(sym) && !p.contentMarkdown!.includes(sym),
  )
  if (missing.length > 0) return `simbol hilang: ${missing.join(', ')}`

  return null
}

/** Tulis ulang satu artikel ke satu bahasa, lalu simpan. Melempar galat bila gagal. */
export async function translateNewsArticle(
  article: MarketNewsRow,
  locale: Exclude<Locale, 'id'>,
): Promise<void> {
  const response = await complete({
    messages: [
      {
        role: 'system',
        content:
          'You are a financial journalist. You always reply with one valid JSON object and nothing else.',
      },
      { role: 'user', content: buildPrompt(article, locale) },
    ],
    temperature: 0.3,
    maxOutputTokens: 6000,
    json: true,
  })

  let payload: TranslationPayload
  try {
    payload = parsePayload(response.text)
  } catch {
    throw new Error(`[${locale}] balasan model bukan JSON yang sah`)
  }

  const problem = validate(article, locale, payload)
  if (problem) throw new Error(`[${locale}] ditolak: ${problem}`)

  await saveNewsTranslation({
    newsId: article.id,
    locale,
    title: payload.title!.trim().slice(0, 255),
    summary: payload.summary!.trim(),
    tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 6) : [],
    keyTakeaways: Array.isArray(payload.keyTakeaways) ? payload.keyTakeaways : [],
    contentMarkdown: payload.contentMarkdown!.trim(),
    imageAlt: payload.imageAlt?.trim() || null,
    imageCaption: payload.imageCaption?.trim() || null,
    model: `${response.providerId}/${response.model}`.slice(0, 96),
  })
}

export interface TranslationReport {
  done: { slug: string; locale: Locale }[]
  failed: { slug: string; locale: Locale; error: string }[]
}

/**
 * Tulis seluruh bahasa yang belum ada untuk satu artikel.
 *
 * Keempat bahasa dikerjakan bersamaan supaya waktu tunggunya kira-kira sama
 * dengan satu panggilan, dan satu bahasa yang gagal tidak menggagalkan yang
 * lain. Artikel sumbernya tetap terbit meski semua versi lain gagal.
 */
export async function translateNewsToAllLocales(
  article: MarketNewsRow,
  locales: readonly Exclude<Locale, 'id'>[] = TRANSLATED_LOCALES,
): Promise<TranslationReport> {
  const report: TranslationReport = { done: [], failed: [] }

  const results = await Promise.allSettled(locales.map((l) => translateNewsArticle(article, l)))
  results.forEach((r, i) => {
    const locale = locales[i]
    if (r.status === 'fulfilled') report.done.push({ slug: article.slug, locale })
    else {
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(`[NewsTranslator] ${article.slug} ${error}`)
      report.failed.push({ slug: article.slug, locale, error })
    }
  })

  return report
}

/** Lengkapi versi bahasa yang masih kosong di artikel yang sudah terbit. */
export async function translateMissingNews(limit = 20): Promise<TranslationReport> {
  const report: TranslationReport = { done: [], failed: [] }
  const pending = await listNewsMissingTranslations(limit)

  // Satu artikel sekali jalan: empat bahasa sekaligus sudah cukup membebani
  // kuota model, dan artikel berikutnya bisa menunggu.
  for (const { article, missing } of pending) {
    const r = await translateNewsToAllLocales(
      article,
      missing.filter((l): l is Exclude<Locale, 'id'> => l !== 'id'),
    )
    report.done.push(...r.done)
    report.failed.push(...r.failed)
  }

  return report
}
