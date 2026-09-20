'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { MarketNewsRow } from '@/lib/db/schema'
import { IconClose, IconNews } from './icons'

interface Props {
  initialArticles: MarketNewsRow[]
}

const CATEGORIES = [
  { id: 'semua', label: 'Semua' },
  { id: 'teknologi-ai', label: 'Teknologi & AI' },
  { id: 'energi-komoditas', label: 'Energi & Komoditas' },
  { id: 'ekonomi-makro', label: 'Ekonomi Makro' },
  { id: 'saham-idx', label: 'Saham IDX' },
  { id: 'crypto-fintech', label: 'Kripto & Fintech' },
]

const HOT_PRESETS = [
  {
    topic: 'Krisis Listrik AI & Peluang Saham Panas Bumi BREN serta Tembaga AMMN',
    category: 'energi-komoditas' as const,
    symbols: ['NVDA', 'BREN.JK', 'AMMN.JK', 'TSM'],
  },
  {
    topic: 'Dampak Pemangkasan Suku Bunga The Fed & Bank Indonesia Terhadap Arus Modal Saham Big Cap IHSG',
    category: 'ekonomi-makro' as const,
    symbols: ['BBCA.JK', 'BBRI.JK', 'BTCUSDT', 'GOLD'],
  },
  {
    topic: 'Perang Chip Semikonduktor Global & Valuasi Saham AI Hardware vs Software',
    category: 'teknologi-ai' as const,
    symbols: ['NVDA', 'TSM', 'PLTR', 'ARM'],
  },
  {
    topic: 'Rekor Pembelian Emas Bank Sentral Global dan Perlindungan Portofolio Safe Haven',
    category: 'energi-komoditas' as const,
    symbols: ['GOLD', 'ANTM.JK'],
  },
]

export function NewsPortalClient({ initialArticles }: Props) {
  const [articles, setArticles] = useState<MarketNewsRow[]>(initialArticles)
  const [selectedCategory, setSelectedCategory] = useState<string>('semua')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false)
  const [customTopic, setCustomTopic] = useState<string>('')
  const [selectedPreset, setSelectedPreset] = useState<number>(0)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  const gridArticles = heroArticle ? filteredArticles.slice(1) : []

  function copyLlmContext() {
    const context = articles
      .slice(0, 10)
      .map(
        (a, i) =>
          `[INTEL #${i + 1}] ${a.title}\nKategori: ${a.category} | Sentimen: ${a.sentiment.toUpperCase()} | Skor Dampak: ${a.impactScore}/10\nSimbol Terkait: ${a.mentionedSymbols.join(', ')}\nRingkasan: ${a.summary}\nPoin Kunci:\n${a.keyTakeaways.map((k) => `  - ${k}`).join('\n')}`,
      )
      .join('\n\n---\n\n')

    navigator.clipboard.writeText(context)
    setCopyFeedback('Konteks AI tersalin')
    setTimeout(() => setCopyFeedback(null), 3000)
  }

  async function handleTriggerGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const preset = HOT_PRESETS[selectedPreset]
      const topic = customTopic.trim() !== '' ? customTopic.trim() : preset.topic
      const category = preset.category
      const targetSymbols = preset.symbols

      const res = await fetch('/api/v1/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, category, targetSymbols }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Gagal membuat artikel baru')
      }

      if (data.article) {
        setArticles((prev) => [data.article, ...prev])
        setShowGenerateModal(false)
        setCustomTopic('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsGenerating(false)
    }
  }

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="seg"
              onClick={copyLlmContext}
              title="Salin ringkasan data untuk disuntikkan ke model AI"
            >
              {copyFeedback ?? 'Salin Konteks AI'}
            </button>

            <a
              href="/api/v1/news/rss"
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Akses feed RSS 2.0 XML"
            >
              RSS
            </a>

            <button
              type="button"
              className="seg"
              onClick={() => setShowGenerateModal(true)}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--ink)',
                borderColor: 'var(--ink-mute)',
                fontWeight: 600,
              }}
            >
              + Buat Analisis Baru
            </button>
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

      {/* --- Modal Generator Berita AI --- */}
      {showGenerateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              maxWidth: 560,
              width: '100%',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                Buat Analisis Pasar Baru
              </h3>
              <button
                type="button"
                onClick={() => !isGenerating && setShowGenerateModal(false)}
                disabled={isGenerating}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-mute)',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                <IconClose size={16} />
              </button>
            </div>

            <p
              style={{
                fontSize: 'var(--t-small)',
                color: 'var(--ink-mute)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Pilih tema atau ketik topik spesifik. Komite AI akan menyusun telaah
              makro dan korelasi saham terkait.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 600,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--mono)',
                }}
              >
                Pilihan Tema Riset:
              </label>
              {HOT_PRESETS.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedPreset(idx)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border:
                      selectedPreset === idx
                        ? '1px solid var(--ink-mute)'
                        : '1px solid var(--line)',
                    background:
                      selectedPreset === idx
                        ? 'var(--bg-subtle)'
                        : 'transparent',
                    cursor: 'pointer',
                    fontSize: 'var(--t-small)',
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{p.topic}</div>
                  <div
                    style={{
                      fontSize: 'var(--t-micro)',
                      color: 'var(--ink-mute)',
                      marginTop: 4,
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    Simbol: {p.symbols.join(', ')}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 600,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--mono)',
                }}
              >
                Atau Tulis Topik Mandiri:
              </label>
              <input
                type="text"
                placeholder="Misal: Dampak Kebijakan Ekspor Nikel ke Saham NCKL..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                disabled={isGenerating}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--ink)',
                  fontSize: 'var(--t-small)',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--line)',
                  color: '#f87171',
                  borderRadius: 4,
                  fontSize: 'var(--t-small)',
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                className="seg"
                onClick={() => setShowGenerateModal(false)}
                disabled={isGenerating}
              >
                Batal
              </button>
              <button
                type="button"
                className="seg"
                onClick={handleTriggerGenerate}
                disabled={isGenerating}
                style={{
                  background: 'var(--ink)',
                  color: 'var(--bg-card)',
                  borderColor: 'var(--ink)',
                  fontWeight: 600,
                }}
              >
                {isGenerating ? 'Menyusun Telaah...' : 'Terbitkan Analisis'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Fokus Intelijen (Hero Card) --- */}
          {heroArticle && (
            <article className="news-hero">
              <div className="news-hero-img-wrap">
                {heroArticle.featuredImage?.url ? (
                  <img
                    src={heroArticle.featuredImage.url}
                    alt={heroArticle.featuredImage.alt ?? heroArticle.title}
                    className="news-hero-img"
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

              <div className="news-hero-content">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      fontSize: 'var(--t-micro)',
                      fontFamily: 'var(--mono)',
                      color: 'var(--ink-mute)',
                    }}
                  >
                    <span>FOKUS UTAMA</span>
                    <span>·</span>
                    <span>{heroArticle.category.toUpperCase()}</span>
                    <span>·</span>
                    <span>DAMPAK {heroArticle.impactScore}/10</span>
                    {heroArticle.youtubeVideo && (
                      <>
                        <span>·</span>
                        <span>VIDEO TERSEDIA</span>
                      </>
                    )}
                  </div>

                  <Link
                    href={`/berita/${heroArticle.slug}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <h2
                      style={{
                        fontSize: clampText(18, 24),
                        fontWeight: 700,
                        lineHeight: 1.3,
                        margin: '0 0 10px 0',
                        color: 'var(--ink)',
                      }}
                    >
                      {heroArticle.title}
                    </h2>
                  </Link>

                  <p
                    style={{
                      fontSize: 'var(--t-small)',
                      lineHeight: 1.6,
                      color: 'var(--ink-mute)',
                      margin: '0 0 16px 0',
                    }}
                  >
                    {heroArticle.summary}
                  </p>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    {heroArticle.mentionedSymbols.map((sym) => (
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
                      paddingTop: 10,
                    }}
                  >
                    <span>
                      {heroArticle.author} · {heroArticle.readingTimeMinutes} mnt baca
                    </span>
                    <Link
                      href={`/berita/${heroArticle.slug}`}
                      style={{
                        color: 'var(--ink)',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      Baca telaah lengkap →
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* --- Grid Artikel Berita Lainnya --- */}
          {gridArticles.length > 0 ? (
            <div className="news-grid">
              {gridArticles.map((article) => (
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
                      <span>{article.readingTimeMinutes} mnt baca</span>
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
                      <span style={{ textTransform: 'capitalize' }}>
                        {article.sentiment}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
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
