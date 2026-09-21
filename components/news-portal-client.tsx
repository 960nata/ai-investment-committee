'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { MarketNewsRow } from '@/lib/db/schema'
import { IconNews, IconEye } from './icons'

interface Props {
  initialArticles: MarketNewsRow[]
  /** Kategori pembuka dari alamat (?kategori=), dipakai menu header. */
  initialCategory?: string
  initialQuery?: string
}

const CATEGORIES = [
  { id: 'semua', label: 'Semua' },
  { id: 'teknologi-ai', label: 'Teknologi & AI' },
  { id: 'energi-komoditas', label: 'Energi & Komoditas' },
  { id: 'ekonomi-makro', label: 'Ekonomi Makro' },
  { id: 'saham-idx', label: 'Saham IDX' },
  { id: 'crypto-fintech', label: 'Kripto & Fintech' },
]

export function NewsPortalClient({
  initialArticles,
  initialCategory = 'semua',
  initialQuery = '',
}: Props) {
  const [articles] = useState<MarketNewsRow[]>(initialArticles)
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory)
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery)

  const filteredArticles = articles.filter((a) => {
    const matchCategory =
      selectedCategory === 'semua' || a.category === selectedCategory
    const matchQuery =
      searchQuery.trim() === '' ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.mentionedSymbols.some((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    return matchCategory && matchQuery
  })

  const heroArticle = filteredArticles[0] ?? null
  const subFeaturedArticles = filteredArticles.slice(1, 4)
  const remainingArticles = filteredArticles.slice(4)

  return (
    <div className="news-portal">
      {/* --- Header Bar --- */}
      <section className="panel" style={{ marginTop: 0 }}>
        <div
          className="panel-head"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="panel-title">
              <IconNews size={16} />
              Warta &amp; Intelijen Pasar
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--t-micro)',
                color: 'var(--ink-mute)',
              }}
            >
              {articles.length} telaah
            </span>
          </div>
        </div>

        {/* --- Sub-nav Kategori & Cari --- */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--line)',
          }}
        >
          <div className="segmented" role="group" aria-label="Kategori Berita">
            {CATEGORIES.map((c) => {
              const count =
                c.id === 'semua'
                  ? articles.length
                  : articles.filter((a) => a.category === c.id).length
              return (
                <button
                  key={c.id}
                  type="button"
                  className="seg"
                  aria-pressed={selectedCategory === c.id}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  {c.label}
                  <span className="seg-count">{count}</span>
                </button>
              )
            })}
          </div>

          <div style={{ position: 'relative', width: 220 }}>
            <input
              type="text"
              placeholder="Saring topik atau simbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 10px',
                fontSize: 'var(--t-small)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--bg-card)',
                color: 'var(--ink)',
              }}
            />
          </div>
        </div>
      </section>

      {/* --- Showcase Berita Utama 2-Grid (60% Kiri Hero Card / 40% Kanan 3 Sub-Berita) --- */}
      {heroArticle && (
        <section className="news-headline-showcase">
          {/* Kolom Kiri: 60% Hero Card Persegi Panjang dengan Teks di Dalam Gambar */}
          <Link
            href={`/berita/${heroArticle.slug}`}
            className="news-headline-hero"
          >
            {heroArticle.featuredImage?.url ? (
              <img
                src={heroArticle.featuredImage.url}
                alt={heroArticle.featuredImage.alt ?? heroArticle.title}
                className="news-headline-hero-bg"
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--bg-subtle)',
                }}
              />
            )}
            <div className="news-headline-hero-overlay" />

            <div className="news-headline-hero-content">
              {/* Bagian Atas: Badge Lencana Kategori & Skor Dampak */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 'var(--t-micro)',
                  fontFamily: 'var(--mono)',
                  color: 'rgba(255, 255, 255, 0.9)',
                }}
              >
                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  BERITA UTAMA · {heroArticle.category.toUpperCase()}
                </span>
                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  DAMPAK {heroArticle.impactScore}/10
                </span>
                {heroArticle.featuredImage?.url?.includes('supabase.co') && (
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.4)',
                      border: '1px solid rgba(52, 211, 153, 0.5)',
                      color: '#a7f3d0',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backdropFilter: 'blur(4px)',
                      fontWeight: 600,
                    }}
                    title="Aset foto tersimpan di Supabase Storage"
                  >
                    Supabase Storage
                  </span>
                )}
                {heroArticle.youtubeVideo && (
                  <span
                    style={{
                      background: 'rgba(0, 0, 0, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    VIDEO TERSEDIA
                  </span>
                )}
              </div>

              {/* Bagian Bawah: Judul, Ringkasan, Simbol, Footer (Semua di dalam Gambar) */}
              <div>
                <h2 className="news-headline-hero-title">
                  {heroArticle.title}
                </h2>

                <p className="news-headline-hero-summary">
                  {heroArticle.summary}
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  {heroArticle.mentionedSymbols.map((sym) => (
                    <span
                      key={sym}
                      style={{
                        background: 'rgba(0, 0, 0, 0.65)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--mono)',
                        fontSize: 'var(--t-micro)',
                        fontWeight: 600,
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      ${sym}
                    </span>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--t-micro)',
                    fontFamily: 'var(--mono)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                    paddingTop: 10,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{heroArticle.author} · {heroArticle.readingTimeMinutes} mnt baca</span>
                    <span>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <IconEye size={12} />
                      {(heroArticle.viewsCount ?? 0).toLocaleString('id-ID')} tayangan
                    </span>
                  </span>
                  <span
                    style={{
                      color: '#ffffff',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Baca telaah lengkap →
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Kolom Kanan: 40% Berisi 3 Berita Tersusun Ke Bawah (Gambar Kiri, Info Kanan) */}
          <div className="news-headline-sidebar">
            {subFeaturedArticles.map((subArticle) => (
              <Link
                key={subArticle.id}
                href={`/berita/${subArticle.slug}`}
                className="news-sub-card"
              >
                <div className="news-sub-img-wrap">
                  {subArticle.featuredImage?.url ? (
                    <img
                      src={subArticle.featuredImage.url}
                      alt={subArticle.featuredImage.alt ?? subArticle.title}
                      className="news-sub-img"
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--bg-subtle)',
                      }}
                    />
                  )}
                </div>

                <div className="news-sub-body">
                  <div>
                    <div className="news-sub-meta">
                      <span style={{ textTransform: 'uppercase', color: 'var(--ink)' }}>
                        {subArticle.category}
                      </span>
                      <span>·</span>
                      <span>{subArticle.readingTimeMinutes} mnt baca</span>
                      <span>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--ink)' }}>
                        <IconEye size={11} />
                        {(subArticle.viewsCount ?? 0).toLocaleString('id-ID')}
                      </span>
                      {subArticle.featuredImage?.url?.includes('supabase.co') && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--positive, #10b981)', fontWeight: 600 }}>Supabase</span>
                        </>
                      )}
                    </div>

                    <h3 className="news-sub-title">
                      {subArticle.title}
                    </h3>

                    <p className="news-sub-summary">
                      {subArticle.summary}
                    </p>
                  </div>

                  <div className="news-sub-footer">
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {subArticle.mentionedSymbols.slice(0, 2).map((s) => (
                        <span key={s} className="badge-ticker">
                          ${s}
                        </span>
                      ))}
                    </div>
                    <span
                      className={`badge-tag ${
                        subArticle.sentiment === 'bullish'
                          ? 'badge-sentiment-bullish'
                          : subArticle.sentiment === 'bearish'
                            ? 'badge-sentiment-bearish'
                            : 'badge-sentiment-neutral'
                      }`}
                      style={{ fontSize: 9 }}
                    >
                      {subArticle.sentiment.toUpperCase()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* --- Grid Artikel Berita Lainnya (Mulai dari Berita ke-5) --- */}
      {remainingArticles.length > 0 ? (
        <section style={{ marginTop: 'var(--space-2)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-3)',
              paddingBottom: 6,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontFamily: 'var(--mono)',
              }}
            >
              Telaah Pasar &amp; Arsip Intelijen Lainnya
            </h3>
            <span
              style={{
                fontSize: 'var(--t-micro)',
                fontFamily: 'var(--mono)',
                color: 'var(--ink-mute)',
              }}
            >
              {remainingArticles.length} telaah tersedia
            </span>
          </div>

          <div className="news-grid">
            {remainingArticles.map((article) => (
              <Link
                key={article.id}
                href={`/berita/${article.slug}`}
                className="news-card"
              >
                <div className="news-card-img-wrap">
                  {article.featuredImage?.url ? (
                    <img
                      src={article.featuredImage.url}
                      alt={article.featuredImage.alt ?? article.title}
                      className="news-card-img"
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--bg-subtle)',
                      }}
                    />
                  )}
                </div>

                <div className="news-card-body">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                      fontSize: 'var(--t-micro)',
                      fontFamily: 'var(--mono)',
                      color: 'var(--ink-mute)',
                    }}
                  >
                    <span>{article.category.toUpperCase()}</span>
                    <span>·</span>
                    <span>{article.readingTimeMinutes} mnt</span>
                    {article.featuredImage?.url?.includes('supabase.co') && (
                      <>
                        <span>·</span>
                        <span style={{ color: 'var(--positive, #10b981)', fontWeight: 600 }}>Supabase</span>
                      </>
                    )}
                    {article.youtubeVideo && (
                      <>
                        <span>·</span>
                        <span>VIDEO</span>
                      </>
                    )}
                  </div>

                  <h3 className="news-card-title">{article.title}</h3>
                  <p className="news-card-summary">{article.summary}</p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                      marginTop: 'auto',
                      marginBottom: 10,
                    }}
                  >
                    {article.mentionedSymbols.slice(0, 4).map((sym) => (
                      <span key={sym} className="badge-ticker">
                        ${sym}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 'var(--t-micro)',
                      fontFamily: 'var(--mono)',
                      color: 'var(--ink-mute)',
                      borderTop: '1px solid var(--line)',
                      paddingTop: 8,
                    }}
                  >
                    <span>
                      {new Date(article.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <IconEye size={12} style={{ color: 'var(--ink-faint)' }} />
                      {(article.viewsCount ?? 0).toLocaleString('id-ID')}
                    </span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {article.sentiment}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        !heroArticle && (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              background: 'var(--bg-card)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink-mute)',
              fontSize: 'var(--t-small)',
            }}
          >
            Tidak ada telaah pasar yang cocok dengan filter saat ini.
          </div>
        )
      )}


      {/* --- Akses Terbuka untuk AI Lain --- */}
      <section
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--t-small)',
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 4,
            }}
          >
            Akses Mesin &amp; Umpan Terbuka (API / LLM Feed)
          </div>
          <p
            style={{
              fontSize: 'var(--t-small)',
              color: 'var(--ink-mute)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Data intelijen pasar ini dapat dikonsumsi langsung oleh agen AI atau bot
            trading via endpoint:{' '}
            <code style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
              /api/v1/news?format=llm
            </code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/api/v1/news?format=llm"
            target="_blank"
            rel="noreferrer"
            className="seg"
          >
            Format LLM
          </a>
          <a
            href="/api/v1/news"
            target="_blank"
            rel="noreferrer"
            className="seg"
          >
            JSON Mentah
          </a>
        </div>
      </section>
    </div>
  )
}

function clampText(min: number, max: number): string {
  return `clamp(${min}px, 2.5vw, ${max}px)`
}
