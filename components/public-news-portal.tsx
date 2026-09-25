'use client'

/**
 * Portal warta untuk pengunjung yang belum masuk.
 *
 * Sengaja bukan komponen yang sama dengan portal warta di dalam terminal.
 * Keduanya memang menampilkan artikel yang sama, tetapi berbicara kepada orang
 * yang berbeda: yang ini kepada pembaca yang baru datang, jadi bahasanya
 * pengantar dan ujungnya ajakan membuat akun. Portal di dalam terminal
 * berbicara kepada analis yang sudah tahu apa yang dicarinya, dan padat dengan
 * penanda dampak serta simbol.
 *
 * Menyatukan keduanya di balik satu tumpukan `if` akan membuat setiap perubahan
 * kecil di salah satu sisi harus dipikirkan dua kali untuk sisi yang lain.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { MarketNewsRow } from '@/lib/db/schema'
import { IconNews, IconSearch, IconArrowRight, IconGauge, IconEye } from './icons'

const CATEGORIES = [
  { id: 'semua', label: 'Semua Warta' },
  { id: 'ekonomi-makro', label: 'Ekonomi Makro' },
  { id: 'energi-komoditas', label: 'Energi & Komoditas' },
  { id: 'teknologi-ai', label: 'Teknologi & AI' },
  { id: 'saham-idx', label: 'Saham IDX' },
  { id: 'crypto-fintech', label: 'Kripto & Fintech' },
]

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function PublicNewsPortal({
  articles,
  initialCategory = 'semua',
  initialQuery = '',
}: {
  articles: MarketNewsRow[]
  initialCategory?: string
  initialQuery?: string
}) {
  const [category, setCategory] = useState(initialCategory)
  const [query, setQuery] = useState(initialQuery)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return articles.filter((article) => {
      if (category !== 'semua' && article.category !== category) return false
      if (!needle) return true

      return (
        article.title.toLowerCase().includes(needle) ||
        article.summary.toLowerCase().includes(needle) ||
        article.mentionedSymbols.some((symbol) => symbol.toLowerCase().includes(needle))
      )
    })
  }, [articles, category, query])

  // Artikel teratas diangkat jadi sorotan, sisanya masuk kisi. Kalau hasil
  // saringan tinggal satu, tidak ada gunanya menyisakan kisi kosong di bawahnya.
  const [lead, ...rest] = filtered

  return (
    <>
      {/* ----------------------------------------------------------------
          KEPALA HALAMAN
          ---------------------------------------------------------------- */}
      <section className="landing-section" style={{ paddingTop: '48px', paddingBottom: '8px' }}>
        <div className="landing-section-container">
          <div className="landing-badge">
            <span className="badge-live-pulse" />
            <span className="landing-badge-text mono">WARTA INTELIJEN TERBUKA</span>
          </div>

          <h1 className="landing-title" style={{ marginTop: '14px' }}>
            Warta &amp; <span className="landing-title-accent">Intelijen Pasar</span>
          </h1>
          <p className="landing-lead" style={{ maxWidth: '680px' }}>
            Laporan harian komite AI soal ekonomi makro, energi, chip, dan emiten IDX. Seluruh warta
            di halaman ini terbuka untuk umum — grafik harga, putusan empat agen, dan katalog
            instrumen ada di dalam terminal.
          </p>

          {/* Pencarian + saringan kategori */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              marginTop: '24px',
            }}
          >
            <label
              className="landing-search-trigger"
              style={{ cursor: 'text', flex: '1 1 260px', maxWidth: '360px' }}
            >
              <IconSearch size={14} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari judul, ringkasan, atau simbol..."
                aria-label="Cari warta"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--ink)',
                  fontSize: '13px',
                  minWidth: 0,
                }}
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="mono"
                  onClick={() => setCategory(item.id)}
                  aria-pressed={category === item.id}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    borderRadius: 'var(--radius-xs)',
                    cursor: 'pointer',
                    background: category === item.id ? 'var(--surface-2)' : 'transparent',
                    color: category === item.id ? 'var(--ink)' : 'var(--ink-mute)',
                    border: `1px solid ${category === item.id ? 'var(--line-strong)' : 'var(--line)'}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          SOROTAN
          ---------------------------------------------------------------- */}
      {lead && (
        <section className="landing-section" style={{ paddingTop: '28px', paddingBottom: '8px' }}>
          <div className="landing-section-container">
            <article
              className={`landing-news-card pub-lead-card${lead.featuredImage?.url ? ' landing-news-card--media' : ''}`}
            >
              {lead.featuredImage?.url && (
                <Link
                  href={`/warta/${lead.slug}`}
                  className="news-card-media pub-lead-media"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lead.featuredImage.url} alt="" loading="eager" decoding="async" />
                </Link>
              )}

              <div className="news-card-content">
              <div className="news-card-meta">
                <span className="tag mono news-card-cat">{lead.category}</span>
                <span className="mono news-card-impact">Dampak: {lead.impactScore}/10</span>
                <span className="mono news-card-date">{formatDate(lead.publishedAt)}</span>
              </div>

              <h2 className="news-card-title" style={{ fontSize: '24px', lineHeight: 1.25 }}>
                <Link href={`/warta/${lead.slug}`}>{lead.title}</Link>
              </h2>

              <p className="news-card-summary" style={{ fontSize: '14px', lineHeight: 1.65 }}>
                {lead.summary}
              </p>

              <div className="news-card-footer">
                <span
                  className="mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    color: 'var(--ink-faint)',
                  }}
                >
                  <IconEye size={12} />
                  {lead.viewsCount} dibaca · {lead.readingTimeMinutes} menit
                </span>
                <Link href={`/warta/${lead.slug}`} className="news-read-link">
                  Baca laporan lengkap &rarr;
                </Link>
              </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------
          KISI WARTA
          ---------------------------------------------------------------- */}
      <section className="landing-section" style={{ paddingTop: '20px' }}>
        <div className="landing-section-container">
          {rest.length > 0 && (
            <div className="landing-section-head">
              <h2 className="landing-section-title">Warta Lainnya</h2>
              <p className="landing-section-desc">
                {filtered.length} laporan
                {category === 'semua' ? '' : ` pada kategori ${category}`}
                {query.trim() ? ` cocok dengan "${query.trim()}"` : ''}.
              </p>
            </div>
          )}

          <div className="landing-news-grid">
            {rest.map((article) => (
              <article
                key={article.id}
                className={`landing-news-card${article.featuredImage?.url ? ' landing-news-card--media' : ''}`}
              >
                {article.featuredImage?.url && (
                  <Link
                    href={`/warta/${article.slug}`}
                    className="news-card-media"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={article.featuredImage.url} alt="" loading="lazy" decoding="async" />
                  </Link>
                )}

                <div className="news-card-content">
                  <div className="news-card-meta">
                    <span className="tag mono news-card-cat">{article.category}</span>
                    <span className="mono news-card-impact">Dampak: {article.impactScore}/10</span>
                  </div>
                  <h3 className="news-card-title">
                    <Link href={`/warta/${article.slug}`}>{article.title}</Link>
                  </h3>
                  <p className="news-card-summary">{article.summary}</p>
                  <div className="news-card-footer">
                    <span className="mono news-card-date">{formatDate(article.publishedAt)}</span>
                    <Link href={`/warta/${article.slug}`} className="news-read-link">
                      Baca analisis &rarr;
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="panel">
              <div className="panel-body">
                <div className="blank">
                  <IconNews size={20} />
                  <div className="blank-title">Tidak ada warta yang cocok</div>
                  <div className="blank-body">
                    Coba kata kunci lain, atau kembalikan saringan ke seluruh kategori.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <PublicTerminalCta />
    </>
  )
}

/**
 * Ajakan masuk terminal.
 *
 * Diletakkan di kaki daftar, bukan di tengah bacaan. Pembaca yang sampai ke
 * bawah sudah menilai sendiri mutu wartanya, dan ajakan yang datang setelah itu
 * jauh lebih jujur daripada yang memotong di tengah.
 */
export function PublicTerminalCta() {
  return (
    <section className="landing-section landing-section-alt">
      <div className="landing-section-container">
        <div className="pub-cta-card">
          <h2 className="pub-cta-title">Warta ini hanya separuh ceritanya</h2>
          <p className="pub-cta-lead">
            Grafik harga langsung, putusan empat agen AI, katalog 400+ instrumen, dan laboratorium
            backtest ada di dalam terminal. Buat akun gratis untuk membukanya.
          </p>

          <div className="pub-cta-actions">
            <Link href="/daftar" className="btn btn-primary landing-btn-hero">
              <IconGauge size={15} />
              <span>Daftar &amp; Buka Terminal</span>
              <IconArrowRight size={14} />
            </Link>
            <Link href="/login" className="btn btn-quiet landing-btn-hero landing-btn-outline">
              <span>Sudah punya akun? Masuk</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
