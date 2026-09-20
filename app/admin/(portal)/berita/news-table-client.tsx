'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconEdit,
  IconTrash,
  IconExternalLink,
  IconSearch,
  IconCheck,
  IconAlert,
  IconVideo,
} from '@/components/icons'
import type { MarketNewsRow } from '@/lib/db/schema'

export function NewsTableClient({ initialNews }: { initialNews: MarketNewsRow[] }) {
  const router = useRouter()
  const [news, setNews] = useState<MarketNewsRow[]>(initialNews)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('semua')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Filter warta berdasarkan search & kategori
  const filtered = news.filter((item) => {
    const matchesCategory = categoryFilter === 'semua' || item.category === categoryFilter
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.summary.toLowerCase().includes(search.toLowerCase()) ||
      item.slug.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Hapus artikel "${title}" secara permanen? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.ok) {
        setNews((prev) => prev.filter((n) => n.id !== id))
        setFeedback(`Artikel #${id} berhasil dihapus.`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal menghapus artikel.')
      }
    } catch {
      alert('Kesalahan koneksi saat menghapus artikel.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: 'var(--measured-dim)',
            border: '1px solid var(--measured)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '16px',
            fontSize: '12px',
          }}
        >
          <IconCheck size={14} style={{ color: 'var(--measured)' }} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Cari berdasarkan judul, kata kunci, slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 30px',
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                fontSize: '12px',
              }}
            />
            <div style={{ position: 'absolute', left: '8px', color: 'var(--ink-mute)', pointerEvents: 'none' }}>
              <IconSearch size={14} />
            </div>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              background: 'var(--surface-0)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink)',
              fontSize: '12px',
            }}
          >
            <option value="semua">Semua Kategori</option>
            <option value="ekonomi-makro">Ekonomi Makro</option>
            <option value="geopolitik">Geopolitik</option>
            <option value="komoditi-emas">Komoditi &amp; Emas</option>
            <option value="kripto">Kripto</option>
            <option value="saham-idx">Saham IDX</option>
            <option value="saham-us">Saham US</option>
          </select>
        </div>

        <div className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
          Menampilkan {filtered.length} dari {news.length} warta
        </div>
      </div>

      {/* Tabel Data Berita */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
        <table className="admin-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>ID</th>
              <th>Judul Warta</th>
              <th>Kategori</th>
              <th>Dampak</th>
              <th>YouTube</th>
              <th>Tanggal Rilis</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="mono" style={{ color: 'var(--ink-faint)', fontSize: '11px' }}>
                  #{item.id}
                </td>
                <td style={{ maxWidth: '320px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                    {item.title}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
                    /{item.slug}
                  </div>
                </td>
                <td>
                  <span className="tag mono" style={{ fontSize: '10px' }}>
                    {item.category}
                  </span>
                </td>
                <td className="mono">
                  <span
                    style={{
                      color: item.impactScore >= 7 ? 'var(--signal)' : 'var(--ink-soft)',
                      fontWeight: item.impactScore >= 7 ? 600 : 400,
                    }}
                  >
                    {item.impactScore}/10
                  </span>
                </td>
                <td>
                  {item.youtubeVideo?.videoId ? (
                    <span
                      className="tag mono"
                      style={{ color: 'var(--green)', borderColor: 'rgba(34,197,94,0.3)', fontSize: '10px' }}
                      title={`Video: ${item.youtubeVideo.videoId}`}
                    >
                      Aktif ({item.youtubeVideo.videoId.slice(0, 5)}...)
                    </span>
                  ) : (
                    <span className="tag mono" style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                      Disembunyikan
                    </span>
                  )}
                </td>
                <td className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
                  {new Date(item.publishedAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Link
                      href={`/berita/${item.slug}`}
                      target="_blank"
                      className="btn btn-quiet"
                      style={{ padding: '3px 6px', fontSize: '11px' }}
                      title="Lihat di Reader Publik"
                    >
                      <IconExternalLink size={12} />
                    </Link>
                    <Link
                      href={`/admin/berita/${item.id}/edit`}
                      className="btn btn-quiet"
                      style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--line)' }}
                      title="Edit artikel ini"
                    >
                      <IconEdit size={12} />
                      <span>Edit</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={deletingId === item.id}
                      className="btn btn-quiet"
                      style={{ padding: '3px 6px', color: 'var(--halted)' }}
                      title="Hapus artikel"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-mute)' }}>
                  Tidak ada warta yang cocok dengan penyaring.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
