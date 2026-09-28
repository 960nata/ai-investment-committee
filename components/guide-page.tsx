import type { Metadata } from 'next'
import { GuideDeck } from '@/components/guide-deck'
import { LandingNav } from '@/components/landing-nav'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { listInstrumentQuotes } from '@/lib/db/queries'
import { GUIDE } from '@/lib/i18n/guide'
import {
  LOCALES,
  LOCALE_INFO,
  languageAlternates,
  localePath,
  type Locale,
} from '@/lib/i18n/locales'
import { SITE_NAME } from '@/lib/brand'

/*
 * Halaman panduan pengguna — kerangka server untuk dek slide.
 *
 * Dipakai /panduan (Indonesia) dan /[lang]/panduan. Isi dek-nya statis, tetapi
 * headernya header situs yang sama dengan beranda dan warta — menu, sesi
 * pengguna, pilihan bahasa, dan pita harga — supaya pembaca panduan tidak
 * terdampar di halaman tanpa jalan ke bagian lain situs. Karena header membaca
 * sesi, halaman ini dirender per permintaan.
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
      siteName: SITE_NAME,
      locale: LOCALE_INFO[locale].ogLocale,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_INFO[l].ogLocale),
      type: 'website',
    },
  }
}

export async function GuidePage({ locale }: { locale: Locale }) {
  const g = GUIDE[locale]
  const [user, isAdmin, instruments] = await Promise.all([
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
    // Pita harga di header. Pelengkap — kegagalannya tidak boleh menjatuhkan panduan.
    listInstrumentQuotes().catch(() => []),
  ])

  return (
    <div className="gd-shell" lang={LOCALE_INFO[locale].htmlLang} data-native-locale={locale}>
      <LandingNav instruments={instruments} user={user} isAdmin={isAdmin} languages={LOCALES} />

      <main className="gd-main">
        <h1 className="gd-sr">{g.metaTitle}</h1>
        {/* Terminal butuh akun, jadi tombolnya mengantar ke pendaftaran. */}
        <GuideDeck locale={locale} terminalHref={user ? '/ringkasan' : '/daftar'} />
      </main>
    </div>
  )
}
