'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconCheck,
  IconAlert,
  IconImage,
  IconVideo,
  IconPlus,
  IconClose,
  IconTrash,
  IconExternalLink,
} from '@/components/icons'
import type { MarketNewsRow } from '@/lib/db/schema'

interface NewsFormProps {
  initialData?: MarketNewsRow | null
  isEdit?: boolean
}

function extractYouTubeId(urlOrId: string): string {
  if (!urlOrId) return ''
  const trimmed = urlOrId.trim()
  // Jika sudah berupa ID 11 karakter
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

  // Ekstrak dari URL format youtube.com/watch?v=ID atau youtu.be/ID
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
  return match ? match[1] : trimmed
}

export function NewsForm({ initialData, isEdit = false }: NewsFormProps) {
  const router = useRouter()

  const [title, setTitle] = useState(initialData?.title || '')
  const [slug, setSlug] = useState(initialData?.slug || '')
  const [summary, setSummary] = useState(initialData?.summary || '')
  const [category, setCategory] = useState(initialData?.category || 'ekonomi-makro')
  const [sentiment, setSentiment] = useState(initialData?.sentiment || 'neutral')
  const [impactScore, setImpactScore] = useState<number>(initialData?.impactScore ?? 7)
  const [author, setAuthor] = useState(initialData?.author || 'AI Intelligence Desk')
  const [readingTime, setReadingTime] = useState<number>(initialData?.readingTimeMinutes ?? 3)
  const [contentMarkdown, setContentMarkdown] = useState(initialData?.contentMarkdown || '')

  // Featured Image
  const [imageUrl, setImageUrl] = useState(initialData?.featuredImage?.url || '')
  const [imageCaption, setImageCaption] = useState(initialData?.featuredImage?.caption || '')
  const [imageCredit, setImageCredit] = useState(initialData?.featuredImage?.credit || '')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // YouTube Video
  const [videoInput, setVideoInput] = useState(initialData?.youtubeVideo?.videoId || '')
  const [videoTitle, setVideoTitle] = useState(initialData?.youtubeVideo?.title || '')
  const [videoChannel, setVideoChannel] = useState(initialData?.youtubeVideo?.channel || '')

  // Key Takeaways
  const [takeaways, setTakeaways] = useState<string[]>(
    initialData?.keyTakeaways && initialData.keyTakeaways.length > 0
      ? initialData.keyTakeaways
      : [''],
  )

  // Form State
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Auto slugify on title change jika bukan edit
  function handleTitleChange(val: string) {
    setTitle(val)
    if (!isEdit && (!slug || slug === title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-'))) {
      const generated = val
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
      setSlug(generated)
    }
  }

  // Upload ke Supabase Storage
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploadingImage(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('prefix', slug || 'news')

      const res = await fetch('/api/v1/admin/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setUploadError(data.error || 'Gagal mengunggah gambar.')
        setUploadingImage(false)
        return
      }

      setImageUrl(data.publicUrl)
      if (!imageCredit) setImageCredit('Dokumen Redaksi / Supabase Storage')
    } catch (err) {
      setUploadError('Kesalahan jaringan saat mengunggah.')
    } finally {
      setUploadingImage(false)
    }
  }

  // Handle YouTube Video
  const parsedVideoId = extractYouTubeId(videoInput)

  function clearVideo() {
    setVideoInput('')
    setVideoTitle('')
    setVideoChannel('')
  }

  // Handle Takeaways
  function handleTakeawayChange(index: number, val: string) {
    const updated = [...takeaways]
    updated[index] = val
    setTakeaways(updated)
  }

  function addTakeaway() {
    setTakeaways([...takeaways, ''])
  }

  function removeTakeaway(index: number) {
    setTakeaways(takeaways.filter((_, i) => i !== index))
  }

  // Submit Form
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    const cleanTakeaways = takeaways.map((t) => t.trim()).filter(Boolean)

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim(),
      category,
      sentiment,
      impactScore: Number(impactScore),
      author: author.trim(),
      readingTimeMinutes: Number(readingTime),
      contentMarkdown,
      featuredImage: imageUrl
        ? {
            url: imageUrl.trim(),
            caption: imageCaption.trim() || undefined,
            credit: imageCredit.trim() || undefined,
            alt: title.trim(),
          }
        : null,
      youtubeVideo: parsedVideoId
        ? {
            videoId: parsedVideoId,
            title: videoTitle.trim() || 'Video Warta Terkait',
            channel: videoChannel.trim() || 'Kanal Terverifikasi',
          }
        : null,
      keyTakeaways: cleanTakeaways,
    }

    try {
      const endpoint = isEdit && initialData
        ? `/api/v1/admin/news/${initialData.id}`
        : '/api/v1/admin/news'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Gagal menyimpan artikel.')
        setSubmitting(false)
        return
      }

      setSuccess(isEdit ? 'Artikel berhasil diperbarui!' : 'Artikel warta baru berhasil diterbitkan!')
      setSubmitting(false)

      setTimeout(() => {
        router.push('/admin/berita')
        router.refresh()
      }, 1000)
    } catch (err) {
      setError('Gagal menghubungi server database.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--halted-dim)',
            border: '1px solid var(--halted)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--space-4)',
            fontSize: '13px',
          }}
        >
          <IconAlert size={16} style={{ color: 'var(--halted)' }} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--measured-dim)',
            border: '1px solid var(--measured)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--space-4)',
            fontSize: '13px',
          }}
        >
          <IconCheck size={16} style={{ color: 'var(--measured)' }} />
          <span>{success}</span>
        </div>
      )}

      {/* Bagian 1: Metadata Utama */}
      <div className="admin-card">
        <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }}>Metadata Artikel</h2>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
              Judul Warta:*
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Contoh: Ketegangan Geopolitik Selat Hormuz Dorong Harga Minyak & Emas..."
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Slug URL (Unik):*
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="slug-url-artikel"
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Kategori Warta:*
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              >
                <option value="ekonomi-makro">Ekonomi Makro &amp; Inflasi</option>
                <option value="geopolitik">Geopolitik &amp; Perang</option>
                <option value="komoditi-emas">Komoditi, Minyak &amp; Emas</option>
                <option value="kripto">Aset Kripto &amp; Likuiditas Global</option>
                <option value="saham-idx">Pasar Saham IDX &amp; Emiten</option>
                <option value="saham-us">Pasar Saham Wall Street (US)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Skor Dampak Harga (1-10):*
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={impactScore}
                onChange={(e) => setImpactScore(parseInt(e.target.value, 10))}
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              />
              <span className="mono" style={{ fontSize: '10px', color: 'var(--ink-faint)', marginTop: '2px', display: 'block' }}>
                ≥ 6 tampil di landing page publik
              </span>
            </div>

            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Sentimen Aset:*
              </label>
              <select
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              >
                <option value="neutral">Netral / Campuran</option>
                <option value="bullish">Bullish (Menguntungkan Harga)</option>
                <option value="bearish">Bearish (Menekan Harga / Koreksi)</option>
              </select>
            </div>

            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Nama Penulis:*
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>

          <div>
            <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
              Ringkasan Singkat (Lead / Abstract):*
            </label>
            <textarea
              required
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Intisari penting dampak peristiwa terhadap pergerakan pasar..."
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>
      </div>

      {/* Bagian 2: Gambar Sampul & Supabase Storage */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Gambar Sampul (Featured Image)</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              Unggah langsung ke Supabase Storage atau masukkan URL gambar
            </p>
          </div>
          <IconImage size={18} style={{ color: 'var(--ink-mute)' }} />
        </div>

        {uploadError && (
          <div className="mono" style={{ color: 'var(--halted)', fontSize: '12px', marginBottom: '12px' }}>
            {uploadError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: imageUrl ? '1fr 200px' : '1fr', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                Unggah File Gambar ke Supabase:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploadingImage}
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-mute)',
                }}
              />
              {uploadingImage && (
                <span className="mono" style={{ fontSize: '11px', color: 'var(--signal)', marginLeft: '8px' }}>
                  Mengunggah ke Supabase Storage...
                </span>
              )}
            </div>

            <div>
              <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                URL Gambar (Atau hasil unggah):
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                  Kredit Foto:
                </label>
                <input
                  type="text"
                  value={imageCredit}
                  onChange={(e) => setImageCredit(e.target.value)}
                  placeholder="Reuters / Supabase Storage"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--surface-0)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                  Keterangan (Caption):
                </label>
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="Deskripsi singkat foto"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--surface-0)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
          </div>

          {imageUrl && (
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                background: 'var(--surface-0)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <img
                src={imageUrl}
                alt="Preview"
                style={{ width: '100%', height: '120px', objectFit: 'cover' }}
              />
              <div style={{ padding: '6px 8px', fontSize: '10px', color: 'var(--ink-faint)' }} className="mono">
                Preview Sampul
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bagian 3: YouTube Video (Bisa Diisi / Dihapus untuk Sembunyikan Otomatis) */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Integrasi Video YouTube</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              Kosongkan jika tidak ada video. Player YouTube akan <strong>otomatis disembunyikan total</strong> di reader jika kosong.
            </p>
          </div>
          <IconVideo size={18} style={{ color: parsedVideoId ? 'var(--green)' : 'var(--ink-mute)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="mono" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                URL Video atau Video ID YouTube:
              </label>
              {parsedVideoId && (
                <button
                  type="button"
                  onClick={clearVideo}
                  className="mono"
                  style={{
                    fontSize: '11px',
                    color: 'var(--halted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <IconTrash size={12} />
                  <span>Hapus / Kosongkan Video</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              placeholder="Contoh: https://www.youtube.com/watch?v=dQw4w9WgXcQ atau dQw4w9WgXcQ"
              className="mono"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                fontSize: '13px',
              }}
            />
          </div>

          {parsedVideoId ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                padding: '12px',
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div>
                <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                  Judul Video:
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Judul video penjelas"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                  Nama Kanal:
                </label>
                <input
                  type="text"
                  value={videoChannel}
                  onChange={(e) => setVideoChannel(e.target.value)}
                  placeholder="Bloomberg / CNBC / Tim Analis"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="badge-live-pulse" style={{ backgroundColor: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
                <span className="mono" style={{ fontSize: '11px', color: 'var(--green)' }}>
                  Video ID Terdeteksi: {parsedVideoId} (Akan dirender di halaman baca)
                </span>
              </div>
            </div>
          ) : (
            <div
              className="mono"
              style={{
                fontSize: '11px',
                color: 'var(--ink-faint)',
                padding: '8px 12px',
                background: 'var(--surface-0)',
                border: '1px dashed var(--line)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Status: Tidak ada video. Komponen video di halaman reader akan 100% tersembunyi tanpa celah kosong.
            </div>
          )}
        </div>
      </div>

      {/* Bagian 4: Poin Kunci (Key Takeaways) */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Poin Kunci (Key Takeaways)</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              Sorotan utama untuk pembaca sebelum membaca narasi panjang
            </p>
          </div>
          <button
            type="button"
            onClick={addTakeaway}
            className="btn btn-quiet"
            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--line)' }}
          >
            <IconPlus size={12} />
            <span>Tambah Poin</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {takeaways.map((point, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', width: '20px' }}>
                #{idx + 1}
              </span>
              <input
                type="text"
                value={point}
                onChange={(e) => handleTakeawayChange(idx, e.target.value)}
                placeholder="Poin penting analisis pasar..."
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              />
              {takeaways.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTakeaway(idx)}
                  className="btn btn-quiet"
                  style={{ padding: '6px', color: 'var(--halted)' }}
                >
                  <IconClose size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bagian 5: Konten Markdown */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Konten Narasi Lengkap (Markdown)*</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              Mendukung heading, paragraf, list, blockquote, dan link analisis
            </p>
          </div>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
            {contentMarkdown.length} karakter
          </span>
        </div>

        <textarea
          required
          rows={14}
          value={contentMarkdown}
          onChange={(e) => setContentMarkdown(e.target.value)}
          placeholder="## Konteks Geopolitik & Makroekonomi&#10;&#10;Tulis analisis mendalam di sini..."
          className="mono"
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--surface-0)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--ink)',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        />
      </div>

      {/* Tombol Aksi Bawah */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '32px' }}>
        <Link
          href="/admin/berita"
          className="btn btn-quiet"
          style={{ border: '1px solid var(--line)', fontSize: '13px' }}
        >
          &larr; Kembali ke Daftar Berita
        </Link>

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
          style={{ padding: '10px 24px', fontSize: '13px', fontFamily: 'var(--mono)' }}
        >
          {submitting ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Terbitkan Warta Berita'}
          <IconCheck size={14} />
        </button>
      </div>
    </form>
  )
}
