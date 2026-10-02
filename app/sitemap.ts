import type { MetadataRoute } from 'next'
import { getMarketNewsList, listNewsLocaleMap } from '@/lib/db/news-queries'
import { getPublicDonationSettings } from '@/lib/db/donation-queries'
import { listInstrumentQuotes } from '@/lib/db/queries'
import { LOCALES, LOCALE_INFO, SOURCE_LOCALE, localePath, type Locale } from '@/lib/i18n/locales'
import { getBaseUrl } from '@/lib/brand'

/**
 * Peta situs untuk halaman publik.
 *
 * Tiap halaman yang punya versi bahasa lain mencantumkan seluruh versinya
 * lewat `alternates.languages`, supaya mesin pencari tahu kelimanya satu
 * halaman yang sama dan menyajikan versi yang cocok dengan bahasa pencarinya.
 * Artikel hanya mencantumkan bahasa yang benar-benar sudah ditulis.
 */

export const dynamic = 'force-dynamic'

const base = () => getBaseUrl()

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
  const [articles, localeMap, donation, instruments] = await Promise.all([
    getMarketNewsList({ limit: 100 }).catch(() => []),
    listNewsLocaleMap().catch(() => new Map<number, Locale[]>()),
    getPublicDonationSettings(),
    listInstrumentQuotes().catch(() => []),
  ])

  return [
    { url: `${base()}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base()}/metodologi`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base()}/kalkulator`, changeFrequency: 'monthly', priority: 0.7 },
    // Halaman analisis publik per instrumen — hanya yang punya data harga.
    ...instruments
      .filter((i) => i.candleCount > 0)
      .map((i) => ({
        url: `${base()}/analisis/${encodeURIComponent(i.symbol)}`,
        lastModified: i.lastDate ?? undefined,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
    ...(donation ? [{ url: `${base()}/donasi`, changeFrequency: 'monthly' as const, priority: 0.4 }] : []),
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
