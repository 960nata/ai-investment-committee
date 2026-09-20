'use client'

import React from 'react'
import Link from 'next/link'
import type { MarketNewsRow } from '@/lib/db/schema'
import { IconClock, IconNews } from './icons'

export const POPULAR_TAGS = [
  '#Semikonduktor',
  '#AI',
  '#NVIDIA',
  '#EnergiListrik',
  '#TheFed',
  '#IHSG',
  '#Emas',
  '#Bitcoin',
  '#DataCenter',
  '#BigTech',
  '#PanasBumi',
  '#BankIndonesia',
]

interface NewsSidebarProps {
  recentArticles?: Pick<
    MarketNewsRow,
    'id' | 'slug' | 'title' | 'category' | 'publishedAt' | 'readingTimeMinutes'
  >[]
  activeTag?: string | null
  onSelectTag?: (tag: string) => void
}

export function NewsSidebar({
  recentArticles = [],
  activeTag,
  onSelectTag,
}: NewsSidebarProps) {
  return (
    <aside className="news-sidebar">
      {/* --- Widget 1: Berita Terkini --- */}
      <div className="sidebar-widget">
        <div className="sidebar-widget-head">
          <span className="sidebar-widget-title">
            <IconNews size={14} />
            Berita Terkini
          </span>
          <span className="sidebar-widget-badge">LIVE INTEL</span>
        </div>

        <div className="sidebar-recent-list">
          {recentArticles.length === 0 ? (
            <p className="sidebar-empty">Belum ada pembaruan telaah.</p>
          ) : (
            recentArticles.slice(0, 5).map((art) => (
              <Link
                key={art.id}
                href={`/berita/${art.slug}`}
                className="sidebar-recent-item"
              >
                <div className="sidebar-recent-meta">
                  <span className="sidebar-recent-cat">
                    {art.category.replace('-', ' ').toUpperCase()}
                  </span>
                  <span>·</span>
                  <span className="sidebar-recent-time">
                    <IconClock size={11} />
                    {new Date(art.publishedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <h4 className="sidebar-recent-title">{art.title}</h4>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* --- Widget 2: Tag Populer --- */}
      <div className="sidebar-widget">
        <div className="sidebar-widget-head">
          <span className="sidebar-widget-title">Tag Populer</span>
          <span className="sidebar-widget-sub">TREN PASAR</span>
        </div>

        <div className="sidebar-tags-grid">
          {POPULAR_TAGS.map((tag) => {
            const clean = tag.replace('#', '')
            const isSelected = activeTag === clean || activeTag === tag

            return onSelectTag ? (
              <button
                key={tag}
                type="button"
                className={`sidebar-tag-pill ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectTag(clean)}
              >
                {tag}
              </button>
            ) : (
              <Link
                key={tag}
                href={`/berita?tag=${encodeURIComponent(clean)}`}
                className={`sidebar-tag-pill ${isSelected ? 'active' : ''}`}
              >
                {tag}
              </Link>
            )
          })}
        </div>
      </div>

      {/* --- Widget 3: Slot Iklan / Sponsor Partner --- */}
      <div className="sidebar-widget ad-sponsor-widget">
        <div className="ad-sponsor-head">
          <span className="ad-sponsor-label">RUANG MITRA</span>
          <span className="ad-sponsor-tag">IKLAN</span>
        </div>

        <div className="ad-sponsor-body">
          <div className="ad-sponsor-badge-mark">MITRA RESMI</div>
          <h4 className="ad-sponsor-title">
            Terminal Riset Kuantitatif &amp; AI Komite Institusional
          </h4>
          <p className="ad-sponsor-desc">
            Jangkau analis, pengelola dana, dan investor modal institusi.
            Tempatkan publikasi riset, pengumuman emiten, atau platform keuangan
            Anda di sini.
          </p>

          <a
            href="mailto:partnership@ai-investment-committee.internal?subject=Kerjasama%20Penempatan%20Iklan%20%26%20Sponsor"
            className="ad-sponsor-btn"
          >
            Pasang Iklan / Kemitraan →
          </a>
        </div>

        <div className="ad-sponsor-foot">
          <span>Penempatan Terverifikasi · Bebas Spam</span>
        </div>
      </div>
    </aside>
  )
}
