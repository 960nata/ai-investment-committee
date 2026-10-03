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

      <div className="article-actions-rows">
        {/* Grup Unduh Dokumen */}
        <div className="article-actions-group">
          <span className="article-actions-label mono">DOKUMEN:</span>
          <div className="segmented">
            <button
              type="button"
              className="seg"
              onClick={handleDownloadMarkdown}
              title="Unduh laporan lengkap dalam format Markdown (.md) untuk Obsidian / catatan lokal"
            >
              {downloadedMd ? <IconCheck size={13} style={{ color: 'var(--measured)' }} /> : <IconDownload size={13} />}
              <span>{downloadedMd ? 'Tersimpan (.md)' : 'Unduh .MD'}</span>
            </button>

            <button
              type="button"
              className="seg"
              onClick={handlePrintOrPdf}
              title="Cetak artikel atau simpan sebagai dokumen PDF resmi"
            >
              <IconPrinter size={13} />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>

        {/* Grup Salin & Prompt AI */}
        <div className="article-actions-group">
          <span className="article-actions-label mono">INTEGRASI:</span>
          <div className="segmented">
            <button
              type="button"
              className="seg"
              onClick={handleCopyPrompt}
              title="Salin ringkasan intelijen berformat prompt LLM siap pakai"
              style={{ color: copiedPrompt ? 'var(--brand)' : undefined }}
            >
              {copiedPrompt ? <IconCheck size={13} style={{ color: 'var(--brand)' }} /> : <IconBolt size={13} />}
              <span>{copiedPrompt ? 'Konteks Tersalin' : 'Konteks AI'}</span>
            </button>

            <button
              type="button"
              className="seg"
              onClick={handleCopyLink}
              title="Salin tautan resmi artikel publik"
              style={{ color: copiedLink ? 'var(--measured)' : undefined }}
            >
              {copiedLink ? <IconCheck size={13} style={{ color: 'var(--measured)' }} /> : <IconCopy size={13} />}
              <span>{copiedLink ? 'Tautan Tersalin' : 'Salin Tautan'}</span>
            </button>
          </div>
        </div>

        {/* Grup Bagikan Media Sosial */}
        <div className="article-actions-group">
          <span className="article-actions-label mono">BAGIKAN:</span>
          <div className="segmented">
            {hasNativeShare && (
              <button
                type="button"
                className="seg"
                onClick={handleNativeShare}
                title="Buka menu bagikan perangkat"
                style={{ fontWeight: 600, color: 'var(--ink)' }}
              >
                <IconShare size={13} />
                <span>Bagikan</span>
              </button>
            )}

            <a
              href={`https://api.whatsapp.com/send?text=${shareTextWhatsApp}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Bagikan ke WhatsApp"
            >
              <IconChat size={13} />
              <span>WhatsApp</span>
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${shareTextX}&url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Bagikan ke X (Twitter)"
            >
              <span>X</span>
            </a>

            <a
              href={`https://t.me/share/url?url=${encodedUrl}&text=${shareTextX}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Bagikan ke Telegram"
            >
              <span>Telegram</span>
            </a>

            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="seg"
              title="Bagikan ke LinkedIn"
            >
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
