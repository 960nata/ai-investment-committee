'use client'

import React, { useState, useSyncExternalStore } from 'react'
import {
  IconCopy,
  IconCheck,
  IconDownload,
  IconPrinter,
  IconShare,
  IconBolt,
  IconChat,
} from '@/components/icons'
import { DEFAULT_SITE_URL } from '@/lib/brand'

export interface ArticleActionsProps {
  title: string
  summary?: string
  slug: string
  keyTakeaways?: string[]
  symbols?: string[]
  contentMarkdown?: string
  author?: string
  publishedAt?: string | Date
  category?: string
  sentiment?: string
  impactScore?: number
  mode?: 'full' | 'compact'
  className?: string
}

export function ArticleActions({
  title,
  summary = '',
  slug,
  keyTakeaways = [],
  symbols = [],
  contentMarkdown = '',
  author = 'AI Investment Committee',
  publishedAt,
  category,
  sentiment,
  impactScore,
  mode = 'full',
  className = '',
}: ArticleActionsProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [downloadedMd, setDownloadedMd] = useState(false)
  const hasNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  )

  // Menggunakan URL kanonikal publik (/warta/[slug]) agar siapapun yang menerima tautan
  // dapat langsung membaca tanpa terhalang dinding login terminal.
  const articleUrl =
    typeof window !== 'undefined'
      ? window.location.pathname.includes('/warta/')
        ? window.location.href
        : `${window.location.origin}/warta/${slug}`
      : `${DEFAULT_SITE_URL}/warta/${slug}`

  const pubDateFormatted = publishedAt
    ? typeof publishedAt === 'string'
      ? publishedAt
      : new Date(publishedAt).toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
    : new Date().toLocaleDateString('id-ID')

  function handleCopyPrompt() {
    const promptLines = [
      'Berikut adalah data intelijen pasar dari AI Investdesk:',
      `Judul: ${title}`,
      `Sumber: ${articleUrl}`,
      symbols.length > 0 ? `Aset Terkait: ${symbols.join(', ')}` : '',
      category ? `Kategori: ${category.toUpperCase()}` : '',
      impactScore ? `Skor Dampak: ${impactScore}/10` : '',
      sentiment ? `Sentimen: ${sentiment.toUpperCase()}` : '',
      `Ringkasan: ${summary}`,
    ].filter(Boolean)

    if (keyTakeaways.length > 0) {
      promptLines.push('Poin Kunci Intelijen:')
      keyTakeaways.forEach((k) => promptLines.push(`- ${k}`))
    }

    promptLines.push(
      '',
      'Tugas untuk LLM: Berdasarkan intelijen di atas, berikan evaluasi risiko mendalam, skenario bull/bear, serta implikasi terhadap alokasi portofolio.'
    )

    navigator.clipboard.writeText(promptLines.join('\n'))
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(articleUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  function handleDownloadMarkdown() {
    const mdLines = [
      `# ${title}`,
      '',
      `> **Sumber:** [AI Investdesk](${articleUrl})  `,
      `> **Waktu Publikasi:** ${pubDateFormatted}  `,
      `> **Analis / Kontributor:** ${author}  `,
      category ? `> **Kategori:** ${category.toUpperCase()}  ` : '',
      symbols.length > 0 ? `> **Aset Terkait:** ${symbols.join(', ')}  ` : '',
      impactScore ? `> **Skor Dampak:** ${impactScore}/10  ` : '',
      sentiment ? `> **Sentimen:** ${sentiment.toUpperCase()}  ` : '',
      '',
      '## Ringkasan Eksekutif',
      summary || 'Tidak ada ringkasan teks.',
      '',
    ]

    if (keyTakeaways.length > 0) {
      mdLines.push('## Poin Kunci Intelijen')
      keyTakeaways.forEach((k) => mdLines.push(`- ${k}`))
      mdLines.push('')
    }

    if (contentMarkdown) {
      mdLines.push('## Analisis Pasar Lengkap')
      mdLines.push(contentMarkdown)
      mdLines.push('')
    }

    mdLines.push('---')
    mdLines.push(
      `*Laporan intelijen ini dihasilkan oleh [AI Investdesk](https://aiinvestdesk.com). Data probabilistik kuantitatif disajikan untuk tujuan riset dan pemantauan pasar, bukan anjuran atau saran finansial resmi.*`
    )

    const fullContent = mdLines.filter((l) => l !== undefined).join('\n')
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${slug || 'analisis-intelijen'}-aiinvestdesk.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)

    setDownloadedMd(true)
    setTimeout(() => setDownloadedMd(false), 2500)
  }

  function handlePrintOrPdf() {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  async function handleNativeShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${title} — AI Investdesk`,
          text: summary ? `${summary.slice(0, 150)}...` : title,
          url: articleUrl,
        })
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          handleCopyLink()
        }
      }
    } else {
      handleCopyLink()
    }
  }

  const encodedUrl = encodeURIComponent(articleUrl)
  const shareTextWhatsApp = encodeURIComponent(`*${title}*\n\n${summary ? `${summary.slice(0, 160)}...\n\n` : ''}${articleUrl}`)
  const shareTextX = encodeURIComponent(`${title} — Analisis Intelijen AI:`)

  // Tampilan Ringkas (Compact Mode) — Untuk ditaruh di bawah judul artikel
  if (mode === 'compact') {
    return (
      <div className={`article-actions-compact ${className}`}>
        <div className="segmented">
          <button
            type="button"
            className="seg"
            onClick={handleDownloadMarkdown}
            title={downloadedMd ? 'Laporan berhasil diunduh (.md)' : 'Unduh laporan dalam format Markdown (.md)'}
            aria-label={downloadedMd ? 'Laporan Tersimpan (.md)' : 'Unduh .MD'}
          >
            {downloadedMd ? <IconCheck size={13} style={{ color: 'var(--measured)' }} /> : <IconDownload size={13} />}
            <span className="seg-label">{downloadedMd ? 'Tersimpan' : 'Unduh .MD'}</span>
          </button>

          <button
            type="button"
            className="seg"
            onClick={handlePrintOrPdf}
            title="Cetak artikel atau simpan sebagai PDF"
            aria-label="Cetak / PDF"
          >
            <IconPrinter size={13} />
            <span className="seg-label">Cetak / PDF</span>
          </button>

          <button
            type="button"
            className="seg"
            onClick={handleCopyLink}
            title={copiedLink ? 'Tautan berhasil disalin' : 'Salin tautan artikel'}
            aria-label={copiedLink ? 'Tautan Tersalin' : 'Salin Tautan'}
            style={{ color: copiedLink ? 'var(--measured)' : undefined }}
          >
            {copiedLink ? <IconCheck size={13} style={{ color: 'var(--measured)' }} /> : <IconCopy size={13} />}
            <span className="seg-label">{copiedLink ? 'Tersalin' : 'Salin Tautan'}</span>
          </button>

          {hasNativeShare ? (
            <button
              type="button"
              className="seg"
              onClick={handleNativeShare}
              title="Bagikan artikel lewat menu perangkat"
              aria-label="Bagikan artikel"
              style={{ fontWeight: 600, color: 'var(--ink)' }}
            >
              <IconShare size={13} />
              <span className="seg-label">Bagikan</span>
            </button>
          ) : (
            <a
              href={`https://api.whatsapp.com/send?text=${shareTextWhatsApp}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Bagikan ke WhatsApp"
              aria-label="Bagikan ke WhatsApp"
            >
              <IconChat size={13} />
              <span className="seg-label">WhatsApp</span>
            </a>
          )}
        </div>
      </div>
    )
  }

  // Tampilan Lengkap (Full Mode) — Untuk ditaruh di akhir artikel
  return (
    <div className={`article-actions-box ${className}`}>
      <div className="article-actions-header">
        <div className="article-actions-kicker mono">
          <span className="live-dot" />
          <span>UNDUH & DISTRIBUSI INTELIJEN</span>
        </div>
        <span className="article-actions-note mono">AI INVESTDESK</span>
      </div>

      {/* Hanya ikon: nama tiap aksi ada di tooltip dan aria-label. */}
      <div className="article-actions-rows">
        <div className="article-actions-group" role="group" aria-label="Dokumen">
          <div className="segmented">
            <button
              type="button"
              className="seg"
              onClick={handleDownloadMarkdown}
              title={downloadedMd ? 'Tersimpan (.md)' : 'Unduh .MD'}
              aria-label={downloadedMd ? 'Laporan tersimpan (.md)' : 'Unduh laporan .MD'}
            >
              {downloadedMd ? <IconCheck size={16} /> : <IconDownload size={16} />}
            </button>

            <button
              type="button"
              className="seg"
              onClick={handlePrintOrPdf}
              title="Cetak / PDF"
              aria-label="Cetak atau simpan sebagai PDF"
            >
              <IconPrinter size={16} />
            </button>
          </div>
        </div>

        <div className="article-actions-group" role="group" aria-label="Integrasi">
          <div className="segmented">
            <button
              type="button"
              className="seg"
              onClick={handleCopyPrompt}
              title={copiedPrompt ? 'Konteks tersalin' : 'Salin konteks AI'}
              aria-label={copiedPrompt ? 'Konteks AI tersalin' : 'Salin konteks AI untuk LLM'}
            >
              {copiedPrompt ? <IconCheck size={16} /> : <IconBolt size={16} />}
            </button>

            <button
              type="button"
              className="seg"
              onClick={handleCopyLink}
              title={copiedLink ? 'Tautan tersalin' : 'Salin tautan'}
              aria-label={copiedLink ? 'Tautan tersalin' : 'Salin tautan artikel'}
            >
              {copiedLink ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </button>
          </div>
        </div>

        <div className="article-actions-group" role="group" aria-label="Bagikan">
          <div className="segmented">
            {hasNativeShare && (
              <button
                type="button"
                className="seg"
                onClick={handleNativeShare}
                title="Bagikan"
                aria-label="Buka menu bagikan perangkat"
              >
                <IconShare size={16} />
              </button>
            )}

            <a
              href={`https://api.whatsapp.com/send?text=${shareTextWhatsApp}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="WhatsApp"
              aria-label="Bagikan ke WhatsApp"
            >
              <BrandIcon name="whatsapp" />
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${shareTextX}&url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="X"
              aria-label="Bagikan ke X"
            >
              <BrandIcon name="x" />
            </a>

            <a
              href={`https://t.me/share/url?url=${encodedUrl}&text=${shareTextX}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Telegram"
              aria-label="Bagikan ke Telegram"
            >
              <BrandIcon name="telegram" />
            </a>

            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="LinkedIn"
              aria-label="Bagikan ke LinkedIn"
            >
              <BrandIcon name="linkedin" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Logo media sosial satu warna; mengikuti warna teks tombolnya. */
function BrandIcon({ name, size = 16 }: { name: 'whatsapp' | 'x' | 'telegram' | 'linkedin'; size?: number }) {
  const paths = {
    whatsapp: (
      <>
        <path
          d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M8.9 7.2c-.3 0-.7.1-1 .5-.4.4-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4l-.6-.4-2-1c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.5-.5.3-.5v-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.5Z" />
      </>
    ),
    x: <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.84-6.32L5.46 21H2.39l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.18h1.7L7.4 4.73H5.58l11.09 14.45Z" />,
    telegram: (
      <path d="M21.2 3.3 2.9 10.4c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.5c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.8-1.6-1.4ZM8.6 13.1l9.7-6.1c.5-.3.9-.1.5.2l-8.2 7.4-.3 3.4-1.7-4.9Z" />
    ),
    linkedin: (
      <path d="M4.98 3.5a2.48 2.48 0 1 1 0 4.96 2.48 2.48 0 0 1 0-4.96ZM2.86 9.75h4.24V21H2.86V9.75Zm6.9 0h4.06v1.54h.06c.57-1.07 1.95-2.2 4-2.2 4.29 0 5.08 2.82 5.08 6.49V21h-4.23v-4.83c0-1.15-.02-2.63-1.6-2.63-1.61 0-1.86 1.25-1.86 2.55V21H9.76V9.75Z" />
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}
