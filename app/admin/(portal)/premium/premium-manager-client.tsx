'use client'

import { useState, type CSSProperties } from 'react'
import { IconCheck, IconCrown, IconExternalLink, IconPlus, IconTrash } from '@/components/icons'
import { formatRupiah, MIN_PRICE, type PremiumPlan, type TierLimits } from '@/lib/premium/plans'
import type { AdminOrderView, PremiumStats } from '@/lib/db/premium-queries'

interface Initial {
  isEnabled: boolean
  title: string
  message: string
  benefits: string[]
  plans: PremiumPlan[]
  limits: { free: TierLimits; premium: TierLimits }
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

const LIMIT_LABEL: Record<keyof TierLimits, string> = {
  askPerDay: 'Tanya Komite / hari',
  watchlist: 'Maks. watchlist',
  alerts: 'Maks. alert',
}

const STATUS_COLOR: Record<string, string> = {
  PAID: 'var(--green)',
  GRANTED: 'var(--signal)',
  UNPAID: 'var(--ink-mute)',
  EXPIRED: 'var(--ink-mute)',
  FAILED: 'var(--halted)',
  REFUND: 'var(--halted)',
}

function blankPlan(): PremiumPlan {
  return {
    id: `paket-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    days: 30,
    price: 39_000,
    compareAt: 0,
    highlight: false,
    isActive: true,
  }
}

export function PremiumManagerClient({
  initial,
  orders,
  stats,
  tripay,
}: {
  initial: Initial
  orders: AdminOrderView[]
  stats: PremiumStats
  tripay: { ready: boolean; mode: 'production' | 'sandbox' }
}) {
  const [isEnabled, setIsEnabled] = useState(initial.isEnabled)
  const [title, setTitle] = useState(initial.title)
  const [message, setMessage] = useState(initial.message)
  const [benefits, setBenefits] = useState(initial.benefits.join('\n'))
  const [plans, setPlans] = useState<PremiumPlan[]>(initial.plans)
  const [limits, setLimits] = useState(initial.limits)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const [grantEmail, setGrantEmail] = useState('')
  const [grantDays, setGrantDays] = useState(30)
  const [granting, setGranting] = useState(false)

  function updatePlan(index: number, patch: Partial<PremiumPlan>) {
    setPlans((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function setLimit(tier: 'free' | 'premium', key: keyof TierLimits, value: number) {
    setLimits((prev) => ({ ...prev, [tier]: { ...prev[tier], [key]: value } }))
  }

  async function save(nextEnabled = isEnabled) {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/v1/admin/premium', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled: nextEnabled,
          title,
          message,
          benefits: benefits
            .split('\n')
            .map((b) => b.trim())
            .filter(Boolean),
          plans,
          limits,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setIsEnabled(data.data.isEnabled)
        setPlans(data.data.plans)
        setFeedback({
          ok: true,
          text: data.data.isEnabled
            ? 'Tersimpan. Halaman /premium sekarang TAMPIL untuk publik.'
            : 'Tersimpan. Halaman /premium masih TERSEMBUNYI.',
        })
      } else {
        setFeedback({ ok: false, text: data.error || 'Gagal menyimpan.' })
        setIsEnabled(isEnabled)
      }
    } catch {
      setFeedback({ ok: false, text: 'Kesalahan koneksi saat menyimpan.' })
      setIsEnabled(isEnabled)
    } finally {
      setSaving(false)
    }
  }

  async function grant(days: number) {
    if (!grantEmail.trim()) return
    if (days === 0 && !confirm(`Cabut Premium dari ${grantEmail}?`)) return
    setGranting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/v1/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: grantEmail.trim(), days }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        const until = data.data.premiumUntil
        setFeedback({
          ok: true,
          text: until
            ? `Premium ${grantEmail} aktif sampai ${new Date(until).toLocaleString('id-ID')}.`
            : `Premium ${grantEmail} dicabut.`,
        })
        setGrantEmail('')
      } else {
        setFeedback({ ok: false, text: data.error || 'Gagal mengubah Premium.' })
      }
    } catch {
      setFeedback({ ok: false, text: 'Kesalahan koneksi.' })
    } finally {
      setGranting(false)
    }
  }

  const activePlans = plans.filter((p) => p.isActive).length

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

      {/* Ringkasan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Member Premium aktif', value: stats.activeMembers.toLocaleString('id-ID') },
          { label: 'Pendapatan 30 hari', value: formatRupiah(stats.revenue30d) },
          { label: 'Transaksi lunas 30 hari', value: stats.paid30d.toLocaleString('id-ID') },
          {
            label: 'Gerbang Tripay',
            value: tripay.ready ? (tripay.mode === 'production' ? 'PRODUKSI' : 'SANDBOX') : 'BELUM DISET',
            color: tripay.ready ? (tripay.mode === 'production' ? 'var(--green)' : 'var(--signal)') : 'var(--halted)',
          },
        ].map((s) => (
          <div key={s.label} className="admin-card" style={{ background: 'var(--surface-1)' }}>
            <span className="mono" style={{ fontSize: '10px', color: 'var(--ink-mute)' }}>{s.label.toUpperCase()}</span>
            <div className="mono" style={{ fontSize: '18px', fontWeight: 600, marginTop: '4px', color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {!tripay.ready && (
        <div className="admin-card" style={{ background: 'var(--surface-1)', border: '1px solid var(--halted)', fontSize: '12px', lineHeight: 1.6 }}>
          <strong>Tripay belum dikonfigurasi.</strong> Isi <code>TRIPAY_API_KEY</code>, <code>TRIPAY_PRIVATE_KEY</code>,{' '}
          <code>TRIPAY_MERCHANT_CODE</code>, dan <code>TRIPAY_MODE</code> di env, lalu daftarkan URL callback{' '}
          <code>/api/v1/payment/tripay/callback</code> di dashboard merchant Tripay. Selama belum diset, tombol bayar
          menampilkan &quot;pembayaran belum dibuka&quot;.
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
              {isEnabled ? '● TAMPIL (DIJUAL)' : '○ TERSEMBUNYI (OFF)'}
            </span>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '6px 0 2px' }}>Halaman /premium</h3>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
              Saat tersembunyi, /premium menjawab 404 dan checkout ditolak. {activePlans} paket aktif.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a
              href="/premium?pratinjau=1"
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
          <label className="mono" style={labelStyle} htmlFor="premium-title">Judul halaman</label>
          <input id="premium-title" style={inputStyle} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mono" style={labelStyle} htmlFor="premium-message">Pesan pembuka</label>
          <textarea
            id="premium-message"
            rows={3}
            style={{ ...inputStyle, lineHeight: 1.5 }}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div>
          <label className="mono" style={labelStyle} htmlFor="premium-benefits">Keuntungan (satu per baris, maks. 12)</label>
          <textarea
            id="premium-benefits"
            rows={5}
            style={{ ...inputStyle, lineHeight: 1.5 }}
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </div>
      </div>

      {/* Paket & harga */}
      <div style={{ display: 'grid', gap: '12px' }}>
        <h3 className="mono" style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0 }}>PAKET &amp; HARGA</h3>
        {plans.length === 0 && (
          <p className="mono" style={{ fontSize: '12px', color: 'var(--ink-mute)', margin: 0 }}>Belum ada paket.</p>
        )}
        {plans.map((p, i) => (
          <div
            key={i}
            className="admin-card"
            style={{
              background: 'var(--surface-1)',
              opacity: p.isActive ? 1 : 0.6,
              border: p.highlight ? '1px solid var(--signal)' : undefined,
              display: 'grid',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                #{i + 1} · {p.label || 'Paket baru'} · {formatRupiah(p.price || 0)} / {p.days} hari
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label className="mono" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)' }}>
                  Unggulan
                  <span className="admin-switch">
                    <input type="checkbox" checked={p.highlight} onChange={(e) => updatePlan(i, { highlight: e.target.checked })} />
                    <span className="admin-slider" />
                  </span>
                </label>
                <label className="mono" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)' }}>
                  Dijual
                  <span className="admin-switch">
                    <input type="checkbox" checked={p.isActive} onChange={(e) => updatePlan(i, { isActive: e.target.checked })} />
                    <span className="admin-slider" />
                  </span>
                </label>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--halted)' }}
                  onClick={() => setPlans((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Hapus paket"
                >
                  <IconTrash size={12} />
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div>
                <label className="mono" style={labelStyle}>Nama paket</label>
                <input style={inputStyle} value={p.label} maxLength={60} placeholder="1 Bulan" onChange={(e) => updatePlan(i, { label: e.target.value })} />
              </div>
              <div>
                <label className="mono" style={labelStyle}>Kode (huruf kecil, tanpa spasi)</label>
                <input
                  className="mono"
                  style={inputStyle}
                  value={p.id}
                  maxLength={40}
                  onChange={(e) => updatePlan(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                />
              </div>
              <div>
                <label className="mono" style={labelStyle}>Durasi (hari)</label>
                <input
                  className="mono"
                  type="number"
                  min={1}
                  max={3650}
                  style={inputStyle}
                  value={p.days}
                  onChange={(e) => updatePlan(i, { days: Math.round(Number(e.target.value)) })}
                />
              </div>
              <div>
                <label className="mono" style={labelStyle}>Harga (Rp, min. {MIN_PRICE.toLocaleString('id-ID')})</label>
                <input
                  className="mono"
                  type="number"
                  min={MIN_PRICE}
                  step={1000}
                  style={inputStyle}
                  value={p.price}
                  onChange={(e) => updatePlan(i, { price: Math.round(Number(e.target.value)) })}
                />
              </div>
              <div>
                <label className="mono" style={labelStyle}>Harga coret (0 = tidak ada)</label>
                <input
                  className="mono"
                  type="number"
                  min={0}
                  step={1000}
                  style={inputStyle}
                  value={p.compareAt}
                  onChange={(e) => updatePlan(i, { compareAt: Math.round(Number(e.target.value)) })}
                />
              </div>
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn"
            disabled={plans.length >= 6}
            onClick={() => setPlans((p) => [...p, blankPlan()])}
            style={{ fontSize: '12px' }}
          >
            <IconPlus size={12} /> Tambah paket
          </button>
        </div>
      </div>

      {/* Batas per tingkat */}
      <div className="admin-card" style={{ background: 'var(--surface-1)', display: 'grid', gap: '12px' }}>
        <h3 className="mono" style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0 }}>BATAS AKUN GRATIS vs PREMIUM</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {(Object.keys(LIMIT_LABEL) as (keyof TierLimits)[]).map((key) => (
            <div key={key} style={{ display: 'grid', gap: '6px' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--ink)' }}>{LIMIT_LABEL[key]}</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {(['free', 'premium'] as const).map((tier) => (
                  <div key={tier}>
                    <label className="mono" style={labelStyle}>{tier === 'free' ? 'Gratis' : 'Premium'}</label>
                    <input
                      className="mono"
                      type="number"
                      min={1}
                      max={1000}
                      style={inputStyle}
                      value={limits[tier][key]}
                      onChange={(e) => setLimit(tier, key, Math.round(Number(e.target.value)))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
          Tanya Komite tetap dibatasi pagu global harian (LLM_DAILY_CEILING). Pengguna Premium memakai model
          PREMIUM_LLM_MODEL lebih dulu bila kuncinya diset.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save()}
          style={{ padding: '8px 16px', fontSize: '12px', fontFamily: 'var(--mono)' }}
        >
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan Premium'}
          <IconCheck size={12} />
        </button>
      </div>

      {/* Beri / cabut manual */}
      <div className="admin-card" style={{ background: 'var(--surface-1)', display: 'grid', gap: '12px' }}>
        <h3 className="mono" style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0 }}>
          <IconCrown size={12} /> BERI / CABUT PREMIUM MANUAL
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(100px, 1fr) auto auto', gap: '8px', alignItems: 'end' }}>
          <div>
            <label className="mono" style={labelStyle}>Email akun</label>
            <input style={inputStyle} type="email" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="nama@contoh.com" />
          </div>
          <div>
            <label className="mono" style={labelStyle}>Tambah hari</label>
            <input
              className="mono"
              type="number"
              min={1}
              max={3650}
              style={inputStyle}
              value={grantDays}
              onChange={(e) => setGrantDays(Math.round(Number(e.target.value)))}
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={granting || !grantEmail} onClick={() => void grant(grantDays)} style={{ fontSize: '12px' }}>
            Beri
          </button>
          <button type="button" className="btn" disabled={granting || !grantEmail} onClick={() => void grant(0)} style={{ fontSize: '12px', color: 'var(--halted)' }}>
            Cabut
          </button>
        </div>
        <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
          Untuk hadiah, penguji, atau pembayaran yang callback-nya tidak sampai. Hari ditambahkan ke sisa Premium yang berjalan.
        </p>
      </div>

      {/* Pesanan terbaru */}
      <div className="admin-card" style={{ background: 'var(--surface-1)', overflowX: 'auto' }}>
        <h3 className="mono" style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: '0 0 10px' }}>PESANAN TERBARU</h3>
        {orders.length === 0 ? (
          <p className="mono" style={{ fontSize: '12px', color: 'var(--ink-mute)', margin: 0 }}>Belum ada pesanan.</p>
        ) : (
          <table className="mono" style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-mute)' }}>
                <th style={{ padding: '6px' }}>Waktu</th>
                <th style={{ padding: '6px' }}>Akun</th>
                <th style={{ padding: '6px' }}>Paket</th>
                <th style={{ padding: '6px' }}>Nominal</th>
                <th style={{ padding: '6px' }}>Metode</th>
                <th style={{ padding: '6px' }}>Status</th>
                <th style={{ padding: '6px' }}>Ref</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.merchantRef} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{new Date(o.createdAt).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '6px' }}>{o.email}</td>
                  <td style={{ padding: '6px' }}>{o.planLabel}</td>
                  <td style={{ padding: '6px' }}>{formatRupiah(o.amount)}</td>
                  <td style={{ padding: '6px' }}>{o.method}</td>
                  <td style={{ padding: '6px', color: STATUS_COLOR[o.status] ?? 'var(--ink)' }}>{o.status}</td>
                  <td style={{ padding: '6px', color: 'var(--ink-mute)' }}>{o.merchantRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
