'use client'

import { useState, type CSSProperties } from 'react'
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconHeart,
  IconImage,
  IconPlus,
  IconQr,
  IconTrash,
} from '@/components/icons'
import {
  PROVIDERS,
  PROVIDER_IDS,
  extractHandle,
  methodHref,
  type DonationMethod,
  type ProviderId,
} from '@/lib/donation/providers'

interface Initial {
  isEnabled: boolean
  title: string
  message: string
  methods: DonationMethod[]
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--surface-0)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--ink)',
  fontSize: '12px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--ink-soft)',
  marginBottom: '4px',
}

const newId = () => crypto.randomUUID()

const KIND_LABEL: Record<DonationMethod['kind'], string> = {
  provider: 'Platform donasi',
  qris: 'QRIS',
  copy: 'Rekening / dompet kripto',
  custom: 'Tautan lain',
}

function blank(kind: DonationMethod['kind']): DonationMethod {
  const base = { id: newId(), isActive: true, note: '' }
  switch (kind) {
    case 'provider':
      return { ...base, kind, provider: 'saweria', handle: '' }
    case 'qris':
      return { ...base, kind, label: 'QRIS (semua e-wallet & m-banking)', imageUrl: '' }
    case 'copy':
      return { ...base, kind, label: '', value: '' }
    case 'custom':
      return { ...base, kind, label: '', url: '' }
  }
}

export function DonationManagerClient({ initial }: { initial: Initial }) {
  const [isEnabled, setIsEnabled] = useState(initial.isEnabled)
  const [title, setTitle] = useState(initial.title)
  const [message, setMessage] = useState(initial.message)
  const [methods, setMethods] = useState<DonationMethod[]>(initial.methods)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  function update(id: string, patch: Partial<DonationMethod>) {
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, ...patch } as DonationMethod) : m)),
    )
  }

  function move(index: number, delta: number) {
    setMethods((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function uploadQris(id: string, file: File) {
    setUploading(id)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('prefix', 'donasi')
      const res = await fetch('/api/v1/admin/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok && data.ok) update(id, { imageUrl: data.publicUrl })
      else setFeedback({ ok: false, text: data.error || 'Gagal mengunggah gambar QRIS.' })
    } catch {
      setFeedback({ ok: false, text: 'Kesalahan koneksi saat mengunggah.' })
    } finally {
      setUploading(null)
    }
  }

  async function save(nextEnabled = isEnabled) {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/v1/admin/donation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: nextEnabled, title, message, methods }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setIsEnabled(data.data.isEnabled)
        setMethods(data.data.methods)
        setFeedback({
          ok: true,
          text: data.data.isEnabled
            ? 'Tersimpan. Halaman /donasi sekarang TAMPIL untuk publik.'
            : 'Tersimpan. Halaman /donasi masih TERSEMBUNYI.',
        })
      } else {
        setFeedback({ ok: false, text: data.error || 'Gagal menyimpan.' })
        // Sakelar yang gagal disimpan dikembalikan, supaya tampilan tidak
        // berbohong soal keadaan halaman publik. `isEnabled` di sini masih
        // nilai sebelum sakelar diubah.
        setIsEnabled(isEnabled)
      }
    } catch {
      setFeedback({ ok: false, text: 'Kesalahan koneksi saat menyimpan.' })
      setIsEnabled(isEnabled)
    } finally {
      setSaving(false)
    }
  }

  const activeCount = methods.filter((m) => m.isActive).length

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {feedback && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: feedback.ok ? 'var(--measured-dim)' : 'var(--halted-dim)',
            border: `1px solid ${feedback.ok ? 'var(--measured)' : 'var(--halted)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
          }}
        >
          <IconCheck size={16} style={{ color: feedback.ok ? 'var(--measured)' : 'var(--halted)' }} />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Sakelar tampil / sembunyi */}
      <div
        className="admin-card"
        style={{ border: `1px solid ${isEnabled ? 'var(--green)' : 'var(--line)'}`, background: 'var(--surface-1)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span
              className="tag mono"
              style={{
                fontSize: '10px',
                color: isEnabled ? 'var(--green)' : 'var(--ink-mute)',
                borderColor: isEnabled ? 'rgba(34,197,94,0.3)' : 'var(--line)',
              }}
            >
              {isEnabled ? '● TAMPIL (AKTIF)' : '○ TERSEMBUNYI (OFF)'}
            </span>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '6px 0 2px' }}>Halaman /donasi</h3>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
              Saat tersembunyi, /donasi menjawab 404 dan tautannya hilang dari kaki halaman.{' '}
              {activeCount} metode aktif.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a
              href="/donasi?pratinjau=1"
              target="_blank"
              rel="noopener"
              className="btn"
              style={{ padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--mono)' }}
            >
              Pratinjau <IconExternalLink size={12} />
            </a>
            <label className="admin-switch" title="Simpan sekaligus mengubah tampil / sembunyi">
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={saving}
                onChange={(e) => {
                  setIsEnabled(e.target.checked)
                  void save(e.target.checked)
                }}
              />
              <span className="admin-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* Teks halaman */}
      <div className="admin-card" style={{ background: 'var(--surface-1)', display: 'grid', gap: '12px' }}>
        <div>
          <label className="mono" style={labelStyle} htmlFor="donation-title">Judul halaman</label>
          <input id="donation-title" style={inputStyle} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mono" style={labelStyle} htmlFor="donation-message">Pesan untuk pendukung</label>
          <textarea
            id="donation-message"
            rows={4}
            style={{ ...inputStyle, lineHeight: 1.5 }}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>

      {/* Daftar metode */}
      <div style={{ display: 'grid', gap: '12px' }}>
        {methods.length === 0 && (
          <p className="mono" style={{ fontSize: '12px', color: 'var(--ink-mute)', margin: 0 }}>
            Belum ada metode donasi. Tambahkan di bawah.
          </p>
        )}

        {methods.map((m, i) => {
          const href = methodHref(m)
          return (
            <div
              key={m.id}
              className="admin-card"
              style={{ background: 'var(--surface-1)', opacity: m.isActive ? 1 : 0.6, display: 'grid', gap: '12px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  #{i + 1} · {KIND_LABEL[m.kind]}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naikkan">↑</button>
                  <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => move(i, 1)} disabled={i === methods.length - 1} aria-label="Turunkan">↓</button>
                  <label className="mono" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)' }}>
                    Tampil
                    <span className="admin-switch">
                      <input type="checkbox" checked={m.isActive} onChange={(e) => update(m.id, { isActive: e.target.checked })} />
                      <span className="admin-slider" />
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--halted)' }}
                    onClick={() => setMethods((prev) => prev.filter((x) => x.id !== m.id))}
                    aria-label="Hapus metode"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {m.kind === 'provider' && (
                  <>
                    <div>
                      <label className="mono" style={labelStyle}>Platform</label>
                      <select
                        style={inputStyle}
                        value={m.provider}
                        onChange={(e) => update(m.id, { provider: e.target.value as ProviderId })}
                      >
                        <optgroup label="Indonesia">
                          {PROVIDER_IDS.filter((p) => PROVIDERS[p].region === 'id').map((p) => (
                            <option key={p} value={p}>{PROVIDERS[p].label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Internasional">
                          {PROVIDER_IDS.filter((p) => PROVIDERS[p].region === 'intl').map((p) => (
                            <option key={p} value={p}>{PROVIDERS[p].label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="mono" style={labelStyle}>Nama pengguna (atau tempel tautannya)</label>
                      <input
                        className="mono"
                        style={inputStyle}
                        value={m.handle}
                        placeholder={PROVIDERS[m.provider].example}
                        onChange={(e) => update(m.id, { handle: e.target.value })}
                        onBlur={(e) => update(m.id, { handle: extractHandle(m.provider, e.target.value) })}
                      />
                    </div>
                  </>
                )}

                {m.kind === 'custom' && (
                  <>
                    <div>
                      <label className="mono" style={labelStyle}>Nama tautan</label>
                      <input style={inputStyle} value={m.label} placeholder="Contoh: Wise, Stripe" onChange={(e) => update(m.id, { label: e.target.value })} />
                    </div>
                    <div>
                      <label className="mono" style={labelStyle}>Alamat (https://)</label>
                      <input className="mono" type="url" style={inputStyle} value={m.url} placeholder="https://..." onChange={(e) => update(m.id, { url: e.target.value })} />
                    </div>
                  </>
                )}

                {m.kind === 'copy' && (
                  <>
                    <div>
                      <label className="mono" style={labelStyle}>Nama</label>
                      <input style={inputStyle} value={m.label} placeholder="BCA a.n. Nama / USDT (TRC20)" onChange={(e) => update(m.id, { label: e.target.value })} />
                    </div>
                    <div>
                      <label className="mono" style={labelStyle}>Nomor rekening / alamat dompet</label>
                      <input className="mono" style={inputStyle} value={m.value} onChange={(e) => update(m.id, { value: e.target.value })} />
                    </div>
                  </>
                )}

                {m.kind === 'qris' && (
                  <>
                    <div>
                      <label className="mono" style={labelStyle}>Judul</label>
                      <input style={inputStyle} value={m.label} onChange={(e) => update(m.id, { label: e.target.value })} />
                    </div>
                    <div>
                      <label className="mono" style={labelStyle}>Gambar QRIS</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt="QRIS" style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', borderRadius: 4 }} />
                        ) : (
                          <span style={{ width: 56, height: 56, display: 'grid', placeItems: 'center', border: '1px dashed var(--line)', borderRadius: 4 }}>
                            <IconQr size={20} />
                          </span>
                        )}
                        <label className="btn" style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>
                          <IconImage size={12} /> {uploading === m.id ? 'Mengunggah...' : m.imageUrl ? 'Ganti gambar' : 'Unggah gambar'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            hidden
                            disabled={uploading === m.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) void uploadQris(m.id, file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="mono" style={labelStyle}>Catatan (opsional)</label>
                  <input
                    style={inputStyle}
                    value={m.note}
                    maxLength={160}
                    placeholder="Contoh: bisa dari luar negeri, kartu kredit"
                    onChange={(e) => update(m.id, { note: e.target.value })}
                  />
                </div>
              </div>

              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '11px', color: 'var(--signal)', wordBreak: 'break-all' }}>
                  {href} <IconExternalLink size={10} />
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Tambah metode */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setMethods((p) => [...p, blank('provider')])} style={{ fontSize: '12px' }}>
          <IconHeart size={12} /> Platform (Saweria, Ko-fi, PayPal…)
        </button>
        <button type="button" className="btn" onClick={() => setMethods((p) => [...p, blank('qris')])} style={{ fontSize: '12px' }}>
          <IconQr size={12} /> QRIS
        </button>
        <button type="button" className="btn" onClick={() => setMethods((p) => [...p, blank('copy')])} style={{ fontSize: '12px' }}>
          <IconCopy size={12} /> Rekening / kripto
        </button>
        <button type="button" className="btn" onClick={() => setMethods((p) => [...p, blank('custom')])} style={{ fontSize: '12px' }}>
          <IconPlus size={12} /> Tautan lain
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save()}
          style={{ padding: '8px 16px', fontSize: '12px', fontFamily: 'var(--mono)' }}
        >
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan Donasi'}
          <IconCheck size={12} />
        </button>
      </div>
    </div>
  )
}
