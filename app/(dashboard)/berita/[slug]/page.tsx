import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMarketNewsBySlug, getMarketNewsList } from '@/lib/db/news-queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'
import { MarkdownView } from '@/components/markdown-view'
import { ArticleActions } from '@/components/article-actions'
import { IconNews } from '@/components/icons'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  await seedInitialNewsArticles()
  const article = await getMarketNewsBySlug(slug)

  if (!article) {
    return {
      title: 'Artikel Tidak Ditemukan | AI Investment Committee',
    }
  }

  const imageUrl = article.featuredImage?.url
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return {
    title: `${article.title} | AI Investment Committee`,
    description: article.summary,
    keywords: [...article.tags, ...article.mentionedSymbols, 'Investasi', 'Saham', 'AI', 'Energi'],
    authors: [{ name: article.author }],
    openGraph: {
      title: article.title,
      description: article.summary,
      url: `${baseUrl}/berita/${article.slug}`,
      siteName: 'AI Investment Committee',
      images: imageUrl ? [{ url: imageUrl, alt: article.title }] : undefined,
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

export default async function BeritaDetailPage({ params }: Props) {
  const { slug } = await params
  await seedInitialNewsArticles()
  const article = await getMarketNewsBySlug(slug)

  if (!article) {
    notFound()
  }

  const related = (await getMarketNewsList({ limit: 4 })).filter((a) => a.slug !== slug).slice(0, 3)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // JSON-LD Structured Data untuk Google Search & Google News
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    image: article.featuredImage?.url ? [article.featuredImage.url] : [],
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.publishedAt.toISOString(),
    author: [
      {
        '@type': 'Organization',
        name: article.author,
        url: baseUrl,
      },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'AI Investment Committee',
      url: baseUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${baseUrl}/berita/${article.slug}`,
    },
    about: article.mentionedSymbols.map((sym) => ({
      '@type': 'FinancialProduct',
      name: sym,
    })),
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 'var(--space-6)' }}>
      {/* Script JSON-LD Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Navigasi Balik */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link
          href="/berita"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--t-small)',
            color: 'var(--ink-mute)',
            textDecoration: 'none',
          }}
        >
          <span>←</span>
          <span>Kembali ke Indeks Warta &amp; Intelijen</span>
        </Link>
      </div>

      <article className="panel" style={{ padding: 'var(--space-5)' }}>
        {/* Header Artikel */}
        <header className="article-header">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="badge-tag badge-category">{article.category.toUpperCase()}</span>
            <span className={`badge-tag badge-sentiment-${article.sentiment}`}>
              SENTIMEN: {article.sentiment.toUpperCase()}
            </span>
            <span
              className="badge-tag"
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              ⚡ SKOR DAMPAK {article.impactScore}/10
            </span>
          </div>

          <h1 className="article-title">{article.title}</h1>

          <div className="article-meta">
            <span>Oleh: <strong>{article.author}</strong></span>
            <span>·</span>
            <span>
              {new Date(article.publishedAt).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span>·</span>
            <span>{article.readingTimeMinutes} menit baca</span>
          </div>
        </header>

        {/* Gambar Utama (Featured Image) */}
        {article.featuredImage?.url && (
          <figure style={{ margin: 'var(--space-4) 0' }}>
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--bg-subtle)',
                maxHeight: 450,
              }}
            >
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
                {article.featuredImage.credit && ` (Foto: ${article.featuredImage.credit})`}
              </figcaption>
            )}
          </figure>
        )}

        {/* Kotak Ringkasan Eksekutif (Key Takeaways) */}
        {article.keyTakeaways && article.keyTakeaways.length > 0 && (
          <div className="takeaways-box">
            <div className="takeaways-title">
              <span>🎯</span>
              <span>Poin Kunci Intelijen AI (Executive Takeaways)</span>
            </div>
            <ul className="takeaways-list">
              {article.keyTakeaways.map((takeaway, idx) => (
                <li key={idx} className="takeaways-item">
                  <span className="takeaways-bullet">▸</span>
                  <span>{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sematan Video YouTube (Jika Ada) */}
        {article.youtubeVideo?.videoId && (
          <div style={{ margin: 'var(--space-5) 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                fontSize: 'var(--t-small)',
                fontWeight: 600,
                color: '#f87171',
              }}
            >
              <span>▶</span>
              <span>Sematan Video YouTube: {article.youtubeVideo.title} ({article.youtubeVideo.channel})</span>
            </div>
            <div className="youtube-wrapper">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${article.youtubeVideo.videoId}`}
                title={article.youtubeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            {article.youtubeVideo.relevance && (
              <p style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-mute)', marginTop: 4 }}>
                Keterangan: {article.youtubeVideo.relevance}
              </p>
            )}
          </div>
        )}

        {/* Konten Utama Artikel (Markdown) */}
        <div style={{ margin: 'var(--space-5) 0' }}>
          <MarkdownView content={article.contentMarkdown} />
        </div>

        {/* Ticker Aset Terkait & Tautan Grafik */}
        <div
          style={{
            margin: 'var(--space-5) 0',
            padding: 'var(--space-4)',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--t-micro)',
              fontWeight: 700,
              color: 'var(--ink-mute)',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Instrumen &amp; Saham Terkait di Sistem:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {article.mentionedSymbols.map((symbol) => (
              <Link
                key={symbol}
                href={`/instruments`}
                className="badge-ticker"
                style={{ padding: '4px 10px', fontSize: 'var(--t-small)' }}
                title={`Buka grafik dan analisis teknikal untuk ${symbol}`}
              >
                📊 ${symbol}
              </Link>
            ))}
          </div>
        </div>

        {/* Bilah Aksi & Bagikan */}
        <ArticleActions
          title={article.title}
          summary={article.summary}
          slug={article.slug}
          keyTakeaways={article.keyTakeaways}
          symbols={article.mentionedSymbols}
        />
      </article>

      {/* Artikel Terkait */}
      {related.length > 0 && (
        <section style={{ marginTop: 'var(--space-5)' }}>
          <h3
            style={{
              fontSize: 'var(--t-body)',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: 'var(--space-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <IconNews size={16} />
            <span>Laporan Intelijen Terkait Lainnya</span>
          </h3>
          <div className="news-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {related.map((rel) => (
              <Link key={rel.id} href={`/berita/${rel.slug}`} className="news-card">
                <div className="news-card-img-wrap" style={{ height: 140 }}>
                  {rel.featuredImage?.url && (
                    <img
                      src={rel.featuredImage.url}
                      alt={rel.title}
                      className="news-card-img"
                    />
                  )}
                </div>
                <div className="news-card-body">
                  <div style={{ fontSize: 'var(--t-micro)', color: '#38bdf8', fontWeight: 600, marginBottom: 4 }}>
                    {rel.category.toUpperCase()}
                  </div>
                  <h4 style={{ fontSize: 'var(--t-small)', fontWeight: 700, margin: '0 0 6px 0', lineHeight: 1.4 }}>
                    {rel.title}
                  </h4>
                  <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-mute)', marginTop: 'auto' }}>
                    {new Date(rel.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
