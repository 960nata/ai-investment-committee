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
        padding: '10px 14px',
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--line)',
        margin: 'var(--space-4) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="seg"
          onClick={handleCopyPrompt}
          style={{
            fontWeight: 600,
            color: copiedPrompt ? 'var(--brand)' : 'var(--ink)',
          }}
        >
          {copiedPrompt ? 'Konteks Tersalin' : 'Salin Konteks AI'}
        </button>

        <button
          type="button"
          className="seg"
          onClick={handleCopyLink}
        >
          {copiedLink ? 'Tautan Tersalin' : 'Salin Tautan'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-mute)', fontFamily: 'var(--mono)' }}>Bagikan:</span>
        <a
          href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          className="seg"
          style={{ padding: '3px 8px', fontSize: 'var(--t-micro)', textDecoration: 'none' }}
        >
          X
        </a>
        <a
          href={`https://api.whatsapp.com/send?text=${shareText}%20${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          className="seg"
          style={{ padding: '3px 8px', fontSize: 'var(--t-micro)', textDecoration: 'none' }}
        >
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`}
          target="_blank"
          rel="noreferrer"
          className="seg"
          style={{ padding: '3px 8px', fontSize: 'var(--t-micro)', textDecoration: 'none' }}
        >
          Telegram
        </a>
      </div>
    </div>
  )
}
