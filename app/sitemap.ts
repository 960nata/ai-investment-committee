import type { MetadataRoute } from 'next'
import { getMarketNewsList, listNewsLocaleMap } from '@/lib/db/news-queries'
import { LOCALES, LOCALE_INFO, SOURCE_LOCALE, localePath, type Locale } from '@/lib/i18n/locales'

/**
 * Peta situs untuk halaman publik.
 *
 * Tiap halaman yang punya versi bahasa lain mencantumkan seluruh versinya
 * lewat `alternates.languages`, supaya mesin pencari tahu kelimanya satu
 * halaman yang sama dan menyajikan versi yang cocok dengan bahasa pencarinya.
 * Artikel hanya mencantumkan bahasa yang benar-benar sudah ditulis.
 */

export const dynamic = 'force-dynamic'

const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

function entry(
  path: string,
  available: readonly Locale[],
  extra: Partial<MetadataRoute.Sitemap[number]> = {},
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    available.map((l) => [LOCALE_INFO[l].htmlLang, `${base()}${localePath(l, path)}`]),
  )
  // Satu baris per versi bahasa, masing-masing membawa peta lengkapnya.
  return available.map((l) => ({
    url: `${base()}${localePath(l, path)}`,
    alternates: { languages },
    ...extra,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, localeMap] = await Promise.all([
    getMarketNewsList({ limit: 100 }).catch(() => []),
    listNewsLocaleMap().catch(() => new Map<number, Locale[]>()),
  ])

  return [
    { url: `${base()}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base()}/metodologi`, changeFrequency: 'monthly', priority: 0.7 },
    ...entry('/panduan', LOCALES, { changeFrequency: 'monthly', priority: 0.8 }),
    ...entry('/warta', LOCALES, { changeFrequency: 'daily', priority: 0.8 }),
    ...articles.flatMap((a) =>
      entry(`/warta/${a.slug}`, localeMap.get(a.id) ?? [SOURCE_LOCALE], {
        lastModified: a.publishedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
      }),
    ),
  ]
}
