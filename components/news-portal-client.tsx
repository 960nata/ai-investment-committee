'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import type { MarketNewsRow } from '@/lib/db/schema'
import { IconAlert, IconNews, IconPulse } from './icons'

interface Props {
  initialArticles: MarketNewsRow[]
}

const CATEGORIES = [
  { id: 'semua', label: 'Semua Kategori' },
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
  const [pending, startTransition] = useTransition()

  // Filter artikel berdasarkan kategori dan pencarian
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

  // Salin ringkasan siap-pakai untuk AI / LLM
  function copyLlmContext() {
    const context = articles
      .slice(0, 10)
      .map(
        (a, i) =>
          `[INTEL #${i + 1}] ${a.title}\nKategori: ${a.category} | Sentimen: ${a.sentiment.toUpperCase()} | Skor Dampak: ${a.impactScore}/10\nSimbol Terkait: ${a.mentionedSymbols.join(', ')}\nRingkasan: ${a.summary}\nPoin Kunci:\n${a.keyTakeaways.map((k) => `  - ${k}`).join('\n')}`,
      )
      .join('\n\n---\n\n')

    navigator.clipboard.writeText(context)
    setCopyFeedback('Prompt konteks AI berhasil disalin!')
    setTimeout(() => setCopyFeedback(null), 3000)
  }

  // Pemicu pembuatan artikel baru oleh AI
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
            <span className="panel-title" style={{ fontSize: 'var(--t-body)' }}>
              <IconNews size={18} />
              Warta & Intelijen Pasar AI
            </span>
            <span
              className="pill-inline"
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: 11,
              }}
            >
              SEO & AI-Ready
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="seg"
              onClick={copyLlmContext}
              title="Salin ringkasan data terstruktur untuk disuntikkan ke ChatGPT / Claude / Bot lain"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 'var(--t-small)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--bg-subtle)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <span>🤖</span>
              <span>{copyFeedback ?? 'Format untuk AI / Prompt'}</span>
            </button>

            <a
              href="/api/v1/news/rss"
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Akses feed RSS 2.0 XML resmi"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 'var(--t-small)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--bg-subtle)',
                color: 'var(--ink-mute)',
                textDecoration: 'none',
              }}
            >
              <span>📡</span>
              <span>RSS</span>
            </a>

            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 'var(--t-small)',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)',
              }}
            >
              <span>⚡</span>
              <span>Minta AI Analisis Baru</span>
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
            background: 'var(--bg-subtle)',
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
              placeholder="Cari topik / simbol ($NVDA)..."
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
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
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
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: 'var(--radius-md)',
              maxWidth: 580,
              width: '100%',
              padding: 'var(--space-5)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
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
                  fontSize: 18,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>⚡</span>
                <span>Pemicu Agen Intelijen Jurnalis AI</span>
              </h3>
              <button
                type="button"
                onClick={() => !isGenerating && setShowGenerateModal(false)}
                disabled={isGenerating}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-mute)',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ✕
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
              Pilih salah satu tema hangat atau tulis topik khusus. Agen Jurnalis AI
              akan langsung meriset angka pasar, membedah korelasi saham, mengurasi
              media foto &amp; video YouTube, lalu menerbitkannya ke portal.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 700,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                }}
              >
                Pilihan Tema Riset Hangat:
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
                        ? '1px solid #38bdf8'
                        : '1px solid var(--line)',
                    background:
                      selectedPreset === idx
                        ? 'rgba(56, 189, 248, 0.1)'
                        : 'var(--bg-subtle)',
                    cursor: 'pointer',
                    fontSize: 'var(--t-small)',
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.topic}</div>
                  <div
                    style={{
                      fontSize: 'var(--t-micro)',
                      color: 'var(--ink-mute)',
                      marginTop: 4,
                    }}
                  >
                    Simbol Terkait: {p.symbols.join(', ')}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 700,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                }}
              >
                Atau Tulis Topik Kustom:
              </label>
              <input
                type="text"
                placeholder="Misal: Dampak Kebijakan Ekspor Nikel Terhadap Saham NCKL dan Baterai EV..."
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
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
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
                onClick={() => setShowGenerateModal(false)}
                disabled={isGenerating}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--ink-mute)',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleTriggerGenerate}
                disabled={isGenerating}
                style={{
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: isGenerating
                    ? 'var(--ink-mute)'
                    : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isGenerating ? (
                  <>
                    <span className="live-dot" />
                    <span>AI Sedang Menganalisis &amp; Menulis...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Riset &amp; Terbitkan Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Breaking News Spotlight (Hero Card) --- */}
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-mute)',
                }}
              >
                Warta Intelijen Pasar
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'flex',
                gap: 6,
              }}
            >
              <span
                className="badge-tag"
                style={{
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: '#fff',
                  backdropFilter: 'blur(4px)',
                }}
              >
                🔥 SOROTAN UTAMA
              </span>
              <span
                className="badge-tag"
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  color: '#38bdf8',
                  backdropFilter: 'blur(4px)',
                }}
              >
                ⚡ Dampak {heroArticle.impactScore}/10
              </span>
            </div>
          </div>

          <div className="news-hero-content">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <span className="badge-tag badge-category">
                  {heroArticle.category.toUpperCase()}
                </span>
                <span
                  className={`badge-tag badge-sentiment-${heroArticle.sentiment}`}
                >
                  {heroArticle.sentiment.toUpperCase()}
                </span>
                {heroArticle.youtubeVideo && (
                  <span
                    className="badge-tag"
                    style={{
                      background: 'rgba(255, 0, 0, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(255, 0, 0, 0.3)',
                    }}
                  >
                    ▶ VIDEO YOUTUBE
                  </span>
                )}
              </div>

              <Link
                href={`/berita/${heroArticle.slug}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <h2
                  style={{
                    fontSize: clampText(20, 26),
                    fontWeight: 800,
                    lineHeight: 1.3,
                    margin: '0 0 12px 0',
                    color: 'var(--ink)',
                  }}
                >
                  {heroArticle.title}
                </h2>
              </Link>

              <p
                style={{
                  fontSize: 'var(--t-body)',
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
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--t-micro)',
                    color: 'var(--ink-mute)',
                    marginRight: 4,
                  }}
                >
                  Aset Terkait:
                </span>
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
                  fontSize: 'var(--t-small)',
                  color: 'var(--ink-mute)',
                  borderTop: '1px solid var(--line)',
                  paddingTop: 12,
                }}
              >
                <span>
                  {heroArticle.author} · {heroArticle.readingTimeMinutes} mnt baca
                </span>
                <Link
                  href={`/berita/${heroArticle.slug}`}
                  style={{
                    fontWeight: 700,
                    color: '#38bdf8',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>Baca Analisis Lengkap</span>
                  <span>→</span>
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
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    display: 'flex',
                    gap: 6,
                  }}
                >
                  <span className="badge-tag badge-category">
                    {article.category}
                  </span>
                  <span
                    className={`badge-tag badge-sentiment-${article.sentiment}`}
                  >
                    {article.sentiment}
                  </span>
                </div>
                {article.youtubeVideo && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      background: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>▶</span>
                    <span>Video</span>
                  </div>
                )}
              </div>

              <div className="news-card-body">
                <h3 className="news-card-title">{article.title}</h3>
                <p className="news-card-summary">{article.summary}</p>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: 'auto',
                    marginBottom: 12,
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
                    color: 'var(--ink-mute)',
                    borderTop: '1px solid var(--line)',
                    paddingTop: 8,
                  }}
                >
                  <span>
                    {new Date(article.publishedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span>{article.readingTimeMinutes} mnt baca</span>
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
            }}
          >
            <p>Tidak ada artikel yang cocok dengan filter saat ini.</p>
          </div>
        )
      )}

      {/* --- Kotak Akses Terbuka untuk Bot & AI Lain --- */}
      <section
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.7) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
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
              fontWeight: 700,
              color: '#38bdf8',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>🤖</span>
            <span>API Terbuka &amp; Machine-Readable Feed untuk Agen AI / Bot Lain</span>
          </div>
          <p
            style={{
              fontSize: 'var(--t-small)',
              color: 'var(--ink-mute)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Sistem eksternal, bot trading, dan agen AI lain dapat langsung mengonsumsi intelijen ini
            tanpa scraping melalui endpoint: <code style={{ color: '#34d399' }}>/api/v1/news?format=llm</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/api/v1/news?format=llm"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.1)',
              color: '#38bdf8',
              fontSize: 'var(--t-small)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Buka API LLM Feed
          </a>
          <a
            href="/api/v1/news"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              background: 'var(--bg-subtle)',
              color: 'var(--ink)',
              fontSize: 'var(--t-small)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            JSON Standar
          </a>
        </div>
      </section>
    </div>
  )
}

function clampText(min: number, max: number): string {
  return `clamp(${min}px, 3vw, ${max}px)`
}
