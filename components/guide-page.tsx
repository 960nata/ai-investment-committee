import type { Metadata } from 'next'
import Link from 'next/link'
import { GuideDeck } from '@/components/guide-deck'
import { LanguageSwitch } from '@/components/language-switch'
import { GUIDE } from '@/lib/i18n/guide'
import {
  LOCALES,
  LOCALE_INFO,
  languageAlternates,
  localePath,
  type Locale,
} from '@/lib/i18n/locales'

/*
 * Halaman panduan pengguna — kerangka server untuk dek slide.
 *
 * Dipakai /panduan (Indonesia) dan /[lang]/panduan. Isinya statis, jadi
 * halamannya bisa dirender sekali dan disajikan dari cache.
 */

const PATH = '/panduan'

export function guideMetadata(locale: Locale): Metadata {
  const g = GUIDE[locale]
  return {
    title: g.metaTitle,
    description: g.metaDescription,
    alternates: {
      canonical: localePath(locale, PATH),
      languages: languageAlternates(PATH, LOCALES),
    },
    openGraph: {
      title: g.metaTitle,
      description: g.metaDescription,
      url: localePath(locale, PATH),
      siteName: 'Komite',
      locale: LOCALE_INFO[locale].ogLocale,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_INFO[l].ogLocale),
      type: 'website',
    },
  }
}

export function GuidePage({ locale }: { locale: Locale }) {
  const g = GUIDE[locale]
  return (
    <div className="gd-shell" lang={LOCALE_INFO[locale].htmlLang} data-native-locale={locale}>
      <header className="gd-bar">
        <Link href="/" className="gd-brand">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z"
              fill="#fa862a"
            />
          </svg>
          Komite
        </Link>
        <LanguageSwitch current={locale} path={PATH} available={LOCALES} label={g.deckLabel} />
      </header>

      <main className="gd-main">
        <h1 className="gd-sr">{g.metaTitle}</h1>
        {/* Terminal butuh akun, jadi tombolnya mengantar ke pendaftaran. */}
        <GuideDeck locale={locale} terminalHref="/daftar" />
      </main>
    </div>
  )
}
