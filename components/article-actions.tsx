'use client'

import React, { useState } from 'react'

interface Props {
  title: string
  summary: string
  slug: string
  keyTakeaways: string[]
  symbols: string[]
}

export function ArticleActions({ title, summary, slug, keyTakeaways, symbols }: Props) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const articleUrl = typeof window !== 'undefined' ? window.location.href : `https://investasi.ai/berita/${slug}`

  function handleCopyPrompt() {
    const promptText = `Berikut adalah data intelijen pasar dari AI Investment Committee:
Judul: ${title}
Aset Terkait: ${symbols.join(', ')}
Ringkasan: ${summary}
Poin Kunci:
${keyTakeaways.map((k) => ` - ${k}`).join('\n')}

Tugas untuk LLM: Berdasarkan intelijen di atas, berikan rekomendasi alokasi portofolio atau analisis risiko tambahan.`

    navigator.clipboard.writeText(promptText)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(articleUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const shareText = encodeURIComponent(`${title} — Analisis Intelijen AI:`)
  const encodedUrl = encodeURIComponent(articleUrl)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--line)',
        margin: 'var(--space-5) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handleCopyPrompt}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 'var(--t-small)',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            background: copiedPrompt ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.1)',
            color: copiedPrompt ? '#34d399' : '#38bdf8',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🤖</span>
          <span>{copiedPrompt ? 'Tersalin ke Clipboard!' : 'Salin Format untuk AI / Prompt'}</span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 'var(--t-small)',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            background: 'var(--bg-card)',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
        >
          <span>🔗</span>
          <span>{copiedLink ? 'Tautan Tersalin!' : 'Salin Tautan'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-mute)' }}>Bagikan:</span>
        <a
          href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          className="badge-tag"
          style={{ background: 'var(--bg-card)', color: 'var(--ink)', textDecoration: 'none' }}
        >
          𝕏 / Twitter
        </a>
        <a
          href={`https://api.whatsapp.com/send?text=${shareText}%20${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          className="badge-tag"
          style={{ background: 'var(--bg-card)', color: '#34d399', textDecoration: 'none' }}
        >
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`}
          target="_blank"
          rel="noreferrer"
          className="badge-tag"
          style={{ background: 'var(--bg-card)', color: '#38bdf8', textDecoration: 'none' }}
        >
          Telegram
        </a>
      </div>
    </div>
  )
}
