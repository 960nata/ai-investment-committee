/**
 * Indeks warta dalam bahasa selain Indonesia: /en/warta, /zh/warta, dst.
 *
 * Hanya artikel yang versi bahasanya sudah ditulis yang muncul. Artikel yang
 * belum punya versi itu tidak ditampilkan dalam bahasa sumbernya — halaman
 * berbahasa Jepang yang diam-diam berisi Bahasa Indonesia membingungkan pembaca
 * dan mesin pencari sekaligus.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocalizedNewsList } from '@/lib/db/news-queries'
import { ARTICLE_UI } from '@/lib/i18n/article-ui'
import {
  LOCALES,
  LOCALE_INFO,
  SOURCE_LOCALE,
  isLocale,
  languageAlternates,
  localePath,
} from '@/lib/i18n/locales'
import { LanguageSwitch } from '@/components/language-switch'
import { LandingDisclaimerFooter } from '@/components/landing-sections'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) return {}
  const ui = ARTICLE_UI[lang]
  return {
    title: ui.indexTitle,
    description: ui.indexLede,
    alternates: {
      canonical: localePath(lang, '/warta'),
      languages: languageAlternates('/warta', LOCALES),
    },
  }
}

export default async function LocalizedNewsIndex({ params }: Props) {
  const { lang } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) notFound()

  const ui = ARTICLE_UI[lang]
  const info = LOCALE_INFO[lang]
  const news = await getLocalizedNewsList(lang, 30).catch(() => [])

  return (
    <div className="gd-shell" lang={info.htmlLang} data-native-locale={lang}>
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
        <LanguageSwitch current={lang} path="/warta" available={LOCALES} label={ui.language} />
      </header>

      <main className="lp">
        <div className="lp-inner">
          <header className="lp-head">
            <div>
              <p className="lp-label">Komite</p>
              <h1 className="lp-title">{ui.indexTitle}</h1>
            </div>
            <p className="lp-sub">{ui.indexLede}</p>
          </header>

          {news.length === 0 ? (
            <p className="lp-note">{ui.empty}</p>
          ) : (
            <ul className="lp-news">
              {news.map((n) => (
                <li key={n.id}>
                  <Link href={localePath(lang, `/warta/${n.slug}`)}>
                    <div className="lp-news-media">
                      {n.featuredImage?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.featuredImage.url} alt={n.featuredImage.alt ?? ''} loading="lazy" />
                      ) : (
                        <span className="lp-news-placeholder" aria-hidden="true" />
                      )}
                      <span className="lp-news-impact">
                        {ui.impact} <strong>{n.impactScore}</strong>/10
                      </span>
                    </div>
                    <div className="lp-news-body">
                      <p className="lp-news-meta">
                        {new Date(n.publishedAt).toLocaleDateString(info.dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <h3>{n.title}</h3>
                      {n.mentionedSymbols.length > 0 && (
                        <p className="lp-news-symbols">
                          {n.mentionedSymbols.slice(0, 4).map((s) => (
                            <span key={s}>{s}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <LandingDisclaimerFooter />
    </div>
  )
}
