/**
 * Satu artikel warta dalam satu bahasa, versi publik.
 *
 * Dipakai bersama oleh /warta/[slug] (Indonesia) dan /[lang]/warta/[slug]
 * (empat bahasa lain), supaya kelima versi tampil identik dan tidak bisa
 * menyimpang satu sama lain seiring waktu.
 *
 * Isi artikelnya utuh — tidak ada paruh yang disembunyikan di balik dinding
 * akun. Yang dikunci adalah terminalnya, bukan bacaannya.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getAdSettings,
  getLocalizedNewsBySlug,
  getLocalizedNewsList,
  incrementNewsViews,
  listNewsLocales,
} from '@/lib/db/news-queries'
import { listInstrumentQuotes, getDataFreshness } from '@/lib/db/queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { ARTICLE_UI } from '@/lib/i18n/article-ui'
import {
  LOCALE_INFO,
  SOURCE_LOCALE,
  languageAlternates,
  localePath,
  type Locale,
} from '@/lib/i18n/locales'
import { MarkdownView } from '@/components/markdown-view'
import { AdSlot } from '@/components/ad-slot'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { PublicTerminalCta } from '@/components/public-news-portal'
import { LanguageSwitch } from '@/components/language-switch'
import { IconEye } from '@/components/icons'

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function wartaArticleMetadata(slug: string, locale: Locale): Promise<Metadata> {
  await seedInitialNewsArticles()
  const article = await getLocalizedNewsBySlug(slug, locale)
  if (!article) return { title: ARTICLE_UI[locale].notFound }

  const available = await listNewsLocales(article.id)
  const path = `/warta/${article.slug}`
  const url = `${baseUrl()}${localePath(locale, path)}`
  const imageUrl = article.featuredImage?.url

  return {
    title: article.title,
    description: article.summary,
    keywords: [...article.tags, ...article.mentionedSymbols],
    authors: [{ name: article.author }],
    alternates: {
      canonical: localePath(locale, path),
      languages: languageAlternates(path, available),
    },
    openGraph: {
      title: article.title,
      description: article.summary,
      url,
      siteName: 'Komite',
      locale: LOCALE_INFO[locale].ogLocale,
      alternateLocale: available.filter((l) => l !== locale).map((l) => LOCALE_INFO[l].ogLocale),
      images: imageUrl ? [{ url: imageUrl, alt: article.featuredImage?.alt ?? article.title }] : undefined,
      type: 'article',
      publishedTime: article.publishedAt.toISOString(),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.summary,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export async function WartaArticle({ slug, locale }: { slug: string; locale: Locale }) {
  await seedInitialNewsArticles()

  const article = await getLocalizedNewsBySlug(slug, locale)
  if (!article) notFound()

  const ui = ARTICLE_UI[locale]
  const info = LOCALE_INFO[locale]
  const updatedViews = await incrementNewsViews(slug)

  const [available, allNews, adSlots, instruments, freshness, session, isAdmin] = await Promise.all([
    listNewsLocales(article.id).catch(() => [SOURCE_LOCALE] as Locale[]),
    getLocalizedNewsList(locale, 8).catch(() => []),
    getAdSettings().catch(() => []),
    listInstrumentQuotes().catch(() => []),
    getDataFreshness().catch(() => null),
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
  ])

  const headerAd = adSlots.find((s) => s.slotName === 'header_leaderboard')
  const midAd = adSlots.find((s) => s.slotName === 'in_article_mid')
  const footerAd = adSlots.find((s) => s.slotName === 'footer_banner')

  const related = allNews.filter((a) => a.slug !== slug).slice(0, 3)
  const path = `/warta/${article.slug}`
  const articleUrl = `${baseUrl()}${localePath(locale, path)}`

  // JSON-LD untuk Google Search & Google News, lengkap dengan bahasa versinya
  // dan tautan ke versi sumber bila ini hasil tulis ulang.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    inLanguage: info.htmlLang,
    image: article.featuredImage?.url ? [article.featuredImage.url] : [],
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.publishedAt.toISOString(),
    author: [{ '@type': 'Organization', name: article.author, url: baseUrl() }],
    publisher: { '@type': 'Organization', name: 'Komite', url: baseUrl() },
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    ...(locale !== SOURCE_LOCALE
      ? {
          translationOfWork: {
            '@type': 'NewsArticle',
            '@id': `${baseUrl()}${path}`,
            inLanguage: LOCALE_INFO[SOURCE_LOCALE].htmlLang,
          },
        }
      : {}),
    about: article.mentionedSymbols.map((sym) => ({ '@type': 'FinancialProduct', name: sym })),
  }

  const date = (d: Date, long = true) =>
    new Date(d).toLocaleDateString(info.dateLocale, {
      ...(long ? { weekday: 'long', month: 'long' } : { month: 'short' }),
      year: 'numeric',
      day: 'numeric',
    })

  return (
    <div className="landing-shell">
      <LandingNav
        instruments={instruments}
        latestNews={allNews.slice(0, 6)}
        freshnessLabel={
          freshness?.freshness === 'fresh' ? 'DATA SEGAR · TERHUBUNG' : 'DATA TERCATAT'
        }
        isFresh={freshness?.freshness === 'fresh'}
        isAdmin={isAdmin}
        user={session ? { name: session.name, role: session.role } : null}
        languages={available}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Isi artikel sudah ditulis dalam bahasanya oleh server; penerjemah
          halaman melewatinya dan hanya menerjemahkan bingkai di sekitarnya. */}
      <section
        className="landing-section"
        style={{ paddingTop: '36px' }}
        lang={info.htmlLang}
        data-native-locale={locale}
      >
        <div className="landing-section-container" style={{ maxWidth: 860 }}>
          <div className="warta-toolbar">
            <Link href={localePath(locale, '/warta')} className="warta-back mono">
              <span>&larr;</span>
              <span>{ui.back}</span>
            </Link>
            {available.length > 1 && (
              <LanguageSwitch current={locale} path={path} available={available} label={ui.language} />
            )}
          </div>

          <article className="panel" style={{ padding: 'var(--space-5)' }}>
            <AdSlot slot={headerAd} />

            <header className="article-header">
              <div className="warta-kicker mono">
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {article.category.replace(/-/g, ' ').toUpperCase()}
                </span>
                <span>·</span>
                <span>
                  {ui.impact.toUpperCase()} {article.impactScore}/10
                </span>
                <span>·</span>
                <span>
                  {ui.sentiment} {ui.sentiments[article.sentiment] ?? article.sentiment}
                </span>
              </div>

              <h1 className="article-title">{article.title}</h1>

              <div className="article-meta">
                <span>
                  {ui.by}: {article.author}
                </span>
                <span>·</span>
                <span>{date(article.publishedAt)}</span>
                <span>·</span>
                <span>{ui.minutesRead(article.readingTimeMinutes)}</span>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink)' }}>
                  <IconEye size={14} style={{ color: 'var(--signal)' }} />
                  <strong>
                    {Math.max(updatedViews || 0, (article.viewsCount || 0) + 1).toLocaleString(
                      info.dateLocale,
                    )}
                  </strong>{' '}
                  {ui.readers}
                </span>
              </div>

              {ui.aiNote && <p className="warta-ai-note">{ui.aiNote}</p>}
            </header>

            {article.featuredImage?.url && (
              <figure style={{ margin: 'var(--space-4) 0' }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    background: 'var(--bg-subtle)',
                    maxHeight: 450,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={article.featuredImage.url}
                    alt={article.featuredImage.alt ?? article.title}
                    style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                  />
                </div>
                {article.featuredImage.caption && (
                  <figcaption
                    style={{
                      fontSize: 'var(--t-micro)',
                      color: 'var(--ink-mute)',
                      marginTop: 8,
                      textAlign: 'center',
                    }}
                  >
                    {article.featuredImage.caption}
                    {/* Kredit dan lisensi ditautkan ke halaman sumber: sebagian
                        foto dipakai di bawah lisensi Creative Commons yang
                        mewajibkannya. */}
                    {article.featuredImage.credit && (
                      <span style={{ marginLeft: 6 }}>
                        (
                        {article.featuredImage.sourceUrl ? (
                          <a
                            href={article.featuredImage.sourceUrl}
                            target="_blank"
                            rel="noreferrer nofollow"
                            style={{ color: 'inherit', textDecoration: 'underline' }}
                          >
                            {article.featuredImage.credit}
                          </a>
                        ) : (
                          article.featuredImage.credit
                        )}
                        {article.featuredImage.license && ` · ${article.featuredImage.license}`})
                      </span>
                    )}
                  </figcaption>
                )}
              </figure>
            )}

            {article.keyTakeaways && article.keyTakeaways.length > 0 && (
              <div className="takeaways-box">
                <div className="takeaways-title">{ui.keyPoints}</div>
                <ul className="takeaways-list">
                  {article.keyTakeaways.map((takeaway, idx) => (
                    <li key={idx} className="takeaways-item">
                      <span className="takeaways-bullet">&mdash;</span>
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {article.youtubeVideo?.videoId && (
              <div style={{ margin: 'var(--space-4) 0' }}>
                <div
                  className="mono"
                  style={{ marginBottom: 6, fontSize: 'var(--t-micro)', color: 'var(--ink-mute)' }}
                >
                  {ui.video.toUpperCase()}: {article.youtubeVideo.title} · {article.youtubeVideo.channel}
                </div>
                <div className="youtube-wrapper">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${article.youtubeVideo.videoId}`}
                    title={article.youtubeVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            <AdSlot slot={midAd} />

            <div style={{ margin: 'var(--space-5) 0' }}>
              <MarkdownView content={article.contentMarkdown} />
            </div>

            {article.mentionedSymbols.length > 0 && (
              <div className="warta-assets">
                <div className="mono warta-assets-title">{ui.mentionedAssets.toUpperCase()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {article.mentionedSymbols.map((symbol) => (
                    <span key={symbol} className="tag mono">
                      {symbol}
                    </span>
                  ))}
                </div>
                <p className="warta-assets-note">
                  {ui.terminalNote[0]}
                  <Link href="/daftar" style={{ color: 'var(--signal)' }}>
                    {ui.terminalNote[1]}
                  </Link>
                  {ui.terminalNote[2]}
                </p>
              </div>
            )}

            <AdSlot slot={footerAd} />
          </article>

          {related.length > 0 && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <div className="landing-section-head">
                <h2 className="landing-section-title">{ui.related}</h2>
              </div>
              <div className="landing-news-grid">
                {related.map((item) => (
                  <article key={item.id} className="landing-news-card">
                    <div className="news-card-meta">
                      <span className="tag mono news-card-cat">{item.category}</span>
                      <span className="mono news-card-impact">
                        {ui.impact}: {item.impactScore}/10
                      </span>
                    </div>
                    <h3 className="news-card-title">
                      <Link href={localePath(locale, `/warta/${item.slug}`)}>{item.title}</Link>
                    </h3>
                    <p className="news-card-summary">{item.summary}</p>
                    <div className="news-card-footer">
                      <span className="mono news-card-date">{date(item.publishedAt, false)}</span>
                      <Link href={localePath(locale, `/warta/${item.slug}`)} className="news-read-link">
                        {ui.readMore} &rarr;
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <PublicTerminalCta />
      <LandingFooter />
    </div>
  )
}
