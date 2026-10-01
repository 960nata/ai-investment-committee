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

      {/* --- Grid Warta & Intelijen AI (Seragam 3 Kolom) --- */}
      {filteredArticles.length > 0 ? (
        <section className="news-grid-section">
          <div className="news-grid">
            {filteredArticles.map((article, index) => (
              <Link
                key={article.id}
                href={`/berita/${article.slug}`}
                className={`news-card${index === 0 ? ' is-lead' : ''}`}
              >
                <div className="news-card-img-wrap">
                  {article.featuredImage?.url ? (
                    <img
                      src={article.featuredImage.url}
                      alt={article.featuredImage.alt ?? article.title}
                      className="news-card-img"
                    />
                  ) : (
                    <div className="news-card-img-placeholder" />
                  )}

                  {/* Lencana Atas Foto */}
                  <div className="news-card-badges-top">
                    {index === 0 && (
                      <span className="badge-tag badge-tag-lead">
                        UTAMA
                      </span>
                    )}
                    <span className="badge-tag badge-tag-cat">
                      {article.category.toUpperCase()}
                    </span>
                    <span className="badge-tag badge-tag-impact">
                      DAMPAK {article.impactScore}/10
                    </span>
                    {article.youtubeVideo && (
                      <span className="badge-tag badge-tag-video">VIDEO</span>
                    )}
                    {article.featuredImage?.url?.includes('supabase.co') && (
                      <span className="badge-tag badge-tag-supabase">Supabase</span>
                    )}
                  </div>
                </div>

                <div className="news-card-body">
                  <div className="news-card-meta">
                    <span>{article.author}</span>
                    <span>·</span>
                    <span>{article.readingTimeMinutes} mnt baca</span>
                    <span>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <IconEye size={11} />
                      {(article.viewsCount ?? 0).toLocaleString('id-ID')}
                    </span>
                  </div>

                  <h3 className="news-card-title">{article.title}</h3>
                  <p className="news-card-summary">{article.summary}</p>

                  <div className="news-card-symbols">
                    {article.mentionedSymbols.slice(0, 4).map((sym) => (
                      <span key={sym} className="badge-ticker">
                        ${sym}
                      </span>
                    ))}
                  </div>

                  <div className="news-card-footer">
                    <span className="news-card-date">
                      {new Date(article.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span
                      className={`badge-tag ${
                        article.sentiment === 'bullish'
                          ? 'badge-sentiment-bullish'
                          : article.sentiment === 'bearish'
                            ? 'badge-sentiment-bearish'
                            : 'badge-sentiment-neutral'
                      }`}
                      style={{ fontSize: 9 }}
                    >
                      {article.sentiment.toUpperCase()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
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
      )}
    </div>
  )
}

function clampText(min: number, max: number): string {
  return `clamp(${min}px, 2.5vw, ${max}px)`
}
