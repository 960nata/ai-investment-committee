'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconMegaphone, IconTrash } from '@/components/icons'
import { Tag } from '@/components/ui'

interface Item {
  id: number
  title: string
  body: string
  tone: string
  linkUrl: string | null
  linkLabel: string | null
  isActive: boolean
  startsAt: string
  endsAt: string | null
  createdAt: string
  dismissals: number
}

const TONES = [
  { id: 'info', label: 'Info', hint: 'Kabar biasa' },
  { id: 'beta', label: 'Beta', hint: 'Fitur yang masih diuji' },
  { id: 'penting', label: 'Penting', hint: 'Butuh perhatian / tindakan' },
] as const

/** Isian datetime-local memakai jam lokal peramban; dikirim ke server sebagai ISO. */
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function status(item: Item): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  const now = Date.now()
  if (!item.isActive) return { label: 'Nonaktif', tone: 'neutral' }
  if (new Date(item.startsAt).getTime() > now) return { label: 'Terjadwal', tone: 'warn' }
  if (item.endsAt && new Date(item.endsAt).getTime() <= now) return { label: 'Berakhir', tone: 'neutral' }
  return { label: 'Tayang', tone: 'ok' }
}

const BETA_TEMPLATE = {
  title: 'Fitur baru: Alat Investor (Beta)',
  body:
    'Watchlist, Portofolio, Alert, Screener, Bandingkan, Tanya Komite, Rekam Jejak Komite, Kepemilikan KSEI, dan Makro sekarang bisa dicoba dari menu kiri. Semuanya masih tahap Beta — tampilan dan perhitungannya bisa berubah. Kabari kami bila ada yang janggal.',
  tone: 'beta',
  linkUrl: '/watchlist',
  linkLabel: 'Coba Watchlist',
}

export function AnnouncementManager({ initial }: { initial: Item[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tone, setTone] = useState<string>('info')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function reload() {
    const res = await fetch('/api/v1/admin/announcements', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok) {
      setItems(
        data.data.map((r: Item & { startsAt: string; endsAt: string | null; createdAt: string }) => ({
          ...r,
          startsAt: new Date(r.startsAt).toISOString(),
          endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
          createdAt: new Date(r.createdAt).toISOString(),
        })),
      )
    }
    router.refresh()
  }

  async function create() {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      const res = await fetch('/api/v1/admin/announcements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          tone,
          linkUrl: linkUrl || null,
          linkLabel: linkLabel || null,
          isActive: true,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Gagal mengirim pengumuman.')
        return
      }
      setTitle('')
      setBody('')
      setLinkUrl('')
      setLinkLabel('')
      setStartsAt('')
      setEndsAt('')
      setOk('Pengumuman terkirim. Pengguna melihatnya saat membuka atau menyegarkan dashboard (paling lambat 2 menit).')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: Item) {
    const res = await fetch(`/api/v1/admin/announcements/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    })
    if (res.ok) await reload()
  }

  async function remove(item: Item) {
    if (!confirm(`Hapus pengumuman "${item.title}"?`)) return
    const res = await fetch(`/api/v1/admin/announcements/${item.id}`, { method: 'DELETE' })
    if (res.ok) await reload()
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="admin-card" style={{ background: 'var(--surface-1)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Tulis pengumuman</h3>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTitle(BETA_TEMPLATE.title)
              setBody(BETA_TEMPLATE.body)
              setTone(BETA_TEMPLATE.tone)
              setLinkUrl(BETA_TEMPLATE.linkUrl)
              setLinkLabel(BETA_TEMPLATE.linkLabel)
            }}
          >
            Isi templat &ldquo;Fitur Beta&rdquo;
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span className="field-label">Judul</span>
            <input className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Isi ({body.length}/1000)</span>
            <textarea className="textarea" rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="form-row">
            <label className="field" style={{ flex: '1 1 160px' }}>
              <span className="field-label">Nada</span>
              <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: '2 1 220px' }}>
              <span className="field-label">Tautan (opsional)</span>
              <input
                className="input"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="/watchlist atau https://…"
              />
            </label>
            <label className="field" style={{ flex: '1 1 160px' }}>
              <span className="field-label">Label tautan</span>
              <input className="input" maxLength={64} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Selengkapnya" />
            </label>
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="field-label">Mulai tayang (kosong = sekarang)</span>
              <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="field-label">Selesai (kosong = sampai dimatikan)</span>
              <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>

          {(title || body) && (
            <div>
              <span className="field-label">Pratinjau</span>
              <div className={`announce ${tone}`} style={{ marginTop: 6 }}>
                <IconMegaphone size={16} />
                <div className="announce-body">
                  <div className="announce-title">
                    {title || 'Judul'}
                    <Tag tone={tone === 'penting' ? 'down' : tone === 'beta' ? 'signal' : 'ok'}>
                      {TONES.find((t) => t.id === tone)?.label}
                    </Tag>
                  </div>
                  <p className="announce-text">{body}</p>
                  {linkUrl && <span className="announce-link">{linkLabel || 'Selengkapnya'} &rarr;</span>}
                </div>
              </div>
            </div>
          )}

          <div>
            <button type="button" className="btn btn-signal" onClick={create} disabled={busy || title.trim().length < 3 || body.trim().length < 3}>
              <IconMegaphone size={13} />
              {busy ? 'Mengirim…' : 'Kirim ke semua pengguna'}
            </button>
            {error && <p className="form-error">{error}</p>}
            {ok && (
              <p className="form-ok" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconCheck size={14} /> {ok}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-card-head">
          <div>
            <div className="admin-table-title">Riwayat pengumuman</div>
            <div className="admin-table-subtitle">{items.length} pengumuman</div>
          </div>
        </div>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Nada</th>
                <th>Status</th>
                <th>Tayang</th>
                <th>Ditutup</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--ink-mute)' }}>
                    Belum ada pengumuman.
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const s = status(item)
                return (
                  <tr key={item.id}>
                    <td style={{ maxWidth: 360 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                        {item.body.slice(0, 120)}
                        {item.body.length > 120 ? '…' : ''}
                      </div>
                    </td>
                    <td>
                      <Tag tone={item.tone === 'penting' ? 'down' : item.tone === 'beta' ? 'signal' : 'ok'}>{item.tone}</Tag>
                    </td>
                    <td>
                      <Tag tone={s.tone}>{s.label}</Tag>
                    </td>
                    <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmt(item.startsAt)}
                      <br />
                      <span style={{ color: 'var(--ink-faint)' }}>s/d {item.endsAt ? fmt(item.endsAt) : 'dimatikan'}</span>
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{item.dismissals} pengguna</td>
                    <td>
                      <span className="btn-row">
                        <button type="button" className="btn" style={{ padding: '3px 8px' }} onClick={() => toggle(item)}>
                          {item.isActive ? 'Matikan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '3px 7px' }}
                          onClick={() => remove(item)}
                          aria-label="Hapus pengumuman"
                        >
                          <IconTrash size={12} />
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
