/**
 * Bahasa yang dilayani halaman publik: warta dan panduan.
 *
 * Bahasa Indonesia adalah bahasa sumber. Artikel ditulis lebih dulu dalam
 * Indonesia, lalu agen yang sama menulis ulang versinya dalam empat bahasa lain
 * — bukan lewat layanan terjemahan. Versi Indonesia tinggal di alamat tanpa
 * awalan (/warta/...), yang lain di bawah awalan bahasanya (/en/warta/...).
 */

export const LOCALES = ['id', 'en', 'zh', 'ja', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

export const SOURCE_LOCALE: Locale = 'id'

/** Bahasa selain sumber — yang punya awalan di alamatnya dan perlu ditulis ulang. */
export const TRANSLATED_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE) as Exclude<
  Locale,
  'id'
>[]

export interface LocaleInfo {
  /** Nama bahasa dalam bahasanya sendiri, untuk pemilih bahasa. */
  native: string
  /** Nama bahasa dalam Bahasa Indonesia, untuk prompt dan log. */
  indonesian: string
  /** Nama bahasa dalam Bahasa Inggris, untuk prompt agen. */
  english: string
  /** Nilai `lang` HTML dan `hreflang`. */
  htmlLang: string
  /** Lokal untuk format tanggal dan angka. */
  dateLocale: string
  /** Kode bendera CSS. */
  flag: 'id' | 'us' | 'cn' | 'jp' | 'ru'
  /** Open Graph locale. */
  ogLocale: string
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  id: {
    native: 'Indonesia',
    indonesian: 'Bahasa Indonesia',
    english: 'Indonesian',
    htmlLang: 'id',
    dateLocale: 'id-ID',
    flag: 'id',
    ogLocale: 'id_ID',
  },
  en: {
    native: 'English',
    indonesian: 'Bahasa Inggris',
    english: 'English',
    htmlLang: 'en',
    dateLocale: 'en-US',
    flag: 'us',
    ogLocale: 'en_US',
  },
  zh: {
    native: '中文',
    indonesian: 'Bahasa Mandarin (aksara sederhana)',
    english: 'Simplified Chinese',
    htmlLang: 'zh-Hans',
    dateLocale: 'zh-CN',
    flag: 'cn',
    ogLocale: 'zh_CN',
  },
  ja: {
    native: '日本語',
    indonesian: 'Bahasa Jepang',
    english: 'Japanese',
    htmlLang: 'ja',
    dateLocale: 'ja-JP',
    flag: 'jp',
    ogLocale: 'ja_JP',
  },
  ru: {
    native: 'Русский',
    indonesian: 'Bahasa Rusia',
    english: 'Russian',
    htmlLang: 'ru',
    dateLocale: 'ru-RU',
    flag: 'ru',
    ogLocale: 'ru_RU',
  },
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/** Alamat sebuah halaman dalam satu bahasa. `path` diawali "/", tanpa awalan bahasa. */
export function localePath(locale: Locale, path: string): string {
  return locale === SOURCE_LOCALE ? path : `/${locale}${path === '/' ? '' : path}`
}

/**
 * Peta `hreflang` untuk metadata Next: tiap bahasa yang tersedia menunjuk ke
 * alamatnya, dan `x-default` ke versi sumber.
 */
export function languageAlternates(
  path: string,
  available: readonly Locale[] = LOCALES,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of available) out[LOCALE_INFO[l].htmlLang] = localePath(l, path)
  out['x-default'] = localePath(SOURCE_LOCALE, path)
  return out
}
