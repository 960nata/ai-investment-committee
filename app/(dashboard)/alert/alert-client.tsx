'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconBell, IconPlus, IconTrash } from '@/components/icons'
import { Blank, Tag } from '@/components/ui'
import { InstrumentPicker } from '@/components/member/instrument-picker'
import { formatPriceIn } from '@/lib/format/market'
import { verdictLabel } from '@/lib/format/verdict'
import type { MarketRow } from '@/lib/member/market-view'

type Kind = 'harga_di_atas' | 'harga_di_bawah' | 'skor_di_atas' | 'skor_di_bawah' | 'putusan_berubah'

const KIND_LABEL: Record<Kind, string> = {
  harga_di_atas: 'Harga naik ke atas',
  harga_di_bawah: 'Harga turun ke bawah',
  skor_di_atas: 'Skor naik ke atas',
  skor_di_bawah: 'Skor turun ke bawah',
  putusan_berubah: 'Putusan komite berubah',
}

interface AlertView {
  id: number
  instrumentId: number
  kind: string
  threshold: number | null
  horizon: string | null
  lastVerdict: string | null
  isActive: boolean
  triggeredAt: string | null
}

interface NotificationView {
  id: number
  title: string
  body: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
}

function parseNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, '')
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return Number(cleaned)
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AlertClient({
  alerts,
  notifications,
  market,
  limit,
}: {
  alerts: AlertView[]
  notifications: NotificationView[]
  market: MarketRow[]
  limit: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const byId = useMemo(() => new Map(market.map((m) => [m.id, m])), [market])

  const [instrumentId, setInstrumentId] = useState<number | null>(null)
  const [kind, setKind] = useState<Kind>('harga_di_atas')
  const [threshold, setThreshold] = useState('')
  const [horizon, setHorizon] = useState<'pendek' | 'menengah' | 'panjang'>('menengah')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const picked = instrumentId !== null ? byId.get(instrumentId) : undefined
  const needsThreshold = kind !== 'putusan_berubah'
  const isScore = kind.startsWith('skor')

  const refresh = () => startTransition(() => router.refresh())

  async function create() {
    setError(null)
    if (instrumentId === null) return setError('Pilih instrumen lebih dulu.')
    const value = needsThreshold ? parseNumber(threshold) : null
    if (needsThreshold && !Number.isFinite(value)) return setError('Ambang harus berupa angka.')
    setBusy(true)
    try {
      const res = await fetch('/api/v1/user/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instrumentId, kind, threshold: value, horizon: isScore ? horizon : null }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'Gagal membuat alert.')
        return
      }
      setThreshold('')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(a: AlertView) {
    const res = await fetch(`/api/v1/user/alerts/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !a.isActive }),
    })
    if (res.ok) refresh()
  }

  async function remove(a: AlertView) {
    if (!confirm('Hapus alert ini?')) return
    const res = await fetch(`/api/v1/user/alerts/${a.id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  async function markAllRead() {
    const res = await fetch('/api/v1/user/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    })
    if (res.ok) refresh()
  }

  function describe(a: AlertView): string {
    const m = byId.get(a.instrumentId)
    if (a.kind === 'putusan_berubah') {
      return a.lastVerdict ? `Sekarang: ${verdictLabel(a.lastVerdict)}` : 'Menunggu putusan pertama'
    }
    if (a.kind.startsWith('harga')) return formatPriceIn(a.threshold, m?.currency ?? '')
    return `${a.threshold?.toFixed(2) ?? '—'} (${a.horizon ?? 'menengah'})`
  }

  function current(a: AlertView): string {
    const m = byId.get(a.instrumentId)
    if (!m) return '—'
    if (a.kind.startsWith('harga')) return formatPriceIn(m.lastClose, m.currency)
    if (a.kind.startsWith('skor')) {
      const s = m.scores[(a.horizon ?? 'menengah') as 'pendek' | 'menengah' | 'panjang']?.score
      return s === undefined ? '—' : s.toFixed(2)
    }
    return m.verdict ? verdictLabel(m.verdict.verdict) : '—'
  }

  const unread = notifications.filter((n) => !n.readAt).length

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconPlus size={14} />
            Alert baru
          </span>
          <span className="panel-meta">
            {alerts.length}/{limit}
          </span>
        </div>
        <div className="panel-body">
          <div className="form-row">
            <div className="field" style={{ flex: '2 1 260px' }}>
              <span className="field-label">Instrumen</span>
              <InstrumentPicker
                options={market.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, assetClass: m.assetClass }))}
                value={instrumentId}
                onChange={setInstrumentId}
              />
            </div>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="field-label">Kondisi</span>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {isScore && (
              <label className="field" style={{ flex: '1 1 120px' }}>
                <span className="field-label">Horizon</span>
                <select className="select" value={horizon} onChange={(e) => setHorizon(e.target.value as typeof horizon)}>
                  <option value="pendek">Pendek</option>
                  <option value="menengah">Menengah</option>
                  <option value="panjang">Panjang</option>
                </select>
              </label>
            )}
            {needsThreshold && (
              <label className="field" style={{ flex: '1 1 150px' }}>
                <span className="field-label">{isScore ? 'Ambang skor (−10..10)' : `Ambang harga${picked ? ` (${picked.currency})` : ''}`}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={isScore ? 'mis. 3' : 'mis. 10.000'}
                />
              </label>
            )}
            <button type="button" className="btn btn-signal" onClick={create} disabled={busy}>
              <IconBell size={13} />
              Pasang
            </button>
          </div>
          {picked && (
            <p className="kpi-note" style={{ marginTop: 8 }}>
              Sekarang: {formatPriceIn(picked.lastClose, picked.currency)} per {picked.lastDate ?? '—'}
              {picked.scores[horizon] && isScore && ` · skor ${horizon} ${picked.scores[horizon]!.score.toFixed(2)}`}
              {picked.verdict && ` · komite: ${verdictLabel(picked.verdict.verdict)}`}
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconBell size={14} />
            Alert saya
          </span>
        </div>
        {alerts.length === 0 ? (
          <Blank icon={<IconBell size={22} />} title="Belum ada alert">
            Pasang alert pertama lewat formulir di atas.
          </Blank>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Simbol</th>
                  <th>Kondisi</th>
                  <th className="num">Ambang</th>
                  <th className="num">Sekarang</th>
                  <th>Keadaan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const m = byId.get(a.instrumentId)
                  return (
                    <tr key={a.id}>
                      <td className="key">{m?.symbol ?? '—'}</td>
                      <td>{KIND_LABEL[a.kind as Kind] ?? a.kind}</td>
                      <td className="num">{describe(a)}</td>
                      <td className="num">{current(a)}</td>
                      <td>
                        {a.isActive ? (
                          <Tag tone="ok">aktif</Tag>
                        ) : a.triggeredAt ? (
                          <Tag tone="signal">terpicu {when(a.triggeredAt)}</Tag>
                        ) : (
                          <Tag>nonaktif</Tag>
                        )}
                      </td>
                      <td>
                        <span className="btn-row">
                          <button type="button" className="btn" style={{ padding: '3px 8px' }} onClick={() => toggle(a)}>
                            {a.isActive ? 'Matikan' : 'Hidupkan'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '3px 7px' }}
                            onClick={() => remove(a)}
                            aria-label="Hapus alert"
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
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconBell size={14} />
            Notifikasi
          </span>
          <span className="panel-meta">
            {unread > 0 ? (
              <button type="button" className="btn" style={{ padding: '3px 8px' }} onClick={markAllRead}>
                Tandai {unread} dibaca
              </button>
            ) : (
              'semua sudah dibaca'
            )}
          </span>
        </div>
        {notifications.length === 0 ? (
          <Blank icon={<IconBell size={22} />} title="Belum ada notifikasi" />
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="dim" style={{ whiteSpace: 'nowrap' }}>
                      {when(n.createdAt)}
                    </td>
                    <td>
                      <div style={{ color: n.readAt ? 'var(--ink-soft)' : 'var(--ink)', fontWeight: n.readAt ? 400 : 600 }}>
                        {n.linkUrl ? <Link href={n.linkUrl}>{n.title}</Link> : n.title}
                      </div>
                      <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                        {n.body}
                      </div>
                    </td>
                    <td>{!n.readAt && <Tag tone="signal">baru</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
