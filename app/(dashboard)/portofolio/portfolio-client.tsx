'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconEdit, IconPlus, IconTrash, IconWallet } from '@/components/icons'
import { Blank } from '@/components/ui'
import { InstrumentPicker } from '@/components/member/instrument-picker'
import { ScoreText, VerdictTag } from '@/components/member/cells'
import { formatPct, formatPriceIn } from '@/lib/format/market'
import type { PositionView } from '@/lib/db/member-queries'
import type { MarketRow } from '@/lib/member/market-view'
import { ASSET_CLASS_LABEL } from '@/lib/member/labels'

/** Warna alokasi dari token yang sudah ada, bukan palet baru. */
const CLASS_COLOR: Record<string, string> = {
  saham: 'var(--measured)',
  crypto: 'var(--signal)',
  memecoin: 'var(--degraded)',
  emas: '#c9b26b',
  komoditi: 'var(--ink-mute)',
  indeks: 'var(--ink-soft)',
}

interface Row extends PositionView {
  instrument: MarketRow | undefined
  cost: number
  value: number | null
  pnl: number | null
  pnlPct: number | null
}

interface FormState {
  id: number | null
  instrumentId: number | null
  quantity: string
  avgPrice: string
  openedAt: string
  note: string
}

const EMPTY: FormState = { id: null, instrumentId: null, quantity: '', avgPrice: '', openedAt: '', note: '' }

/**
 * Angka ketikan pengguna. Koma dibaca sebagai desimal ala Indonesia ("0,25"),
 * dan titik pemisah ribuan ("1.500.000") dibuang. Titik tunggal tanpa pola
 * ribuan ("0.25") tetap desimal, karena begitulah harga crypto biasa disalin.
 */
function parseNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, '')
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return Number(cleaned)
}

/** Angka yang diisikan ke formulir ditulis dengan koma desimal agar tidak terbaca sebagai ribuan. */
function toInput(n: number): string {
  return String(n).replace('.', ',')
}

export function PortfolioClient({
  positions,
  market,
  limit,
}: {
  positions: PositionView[]
  market: MarketRow[]
  limit: number
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const byId = useMemo(() => new Map(market.map((m) => [m.id, m])), [market])

  const rows: Row[] = positions.map((p) => {
    const instrument = byId.get(p.instrumentId)
    const cost = p.quantity * p.avgPrice
    const value = instrument?.lastClose != null ? p.quantity * instrument.lastClose : null
    const pnl = value === null ? null : value - cost
    return { ...p, instrument, cost, value, pnl, pnlPct: pnl === null || cost === 0 ? null : (pnl / cost) * 100 }
  })

  // Ringkasan per mata uang.
  const byCurrency = new Map<string, { cost: number; value: number; missing: number; classes: Map<string, number> }>()
  for (const r of rows) {
    const cur = r.instrument?.currency ?? '—'
    const g = byCurrency.get(cur) ?? { cost: 0, value: 0, missing: 0, classes: new Map() }
    if (r.value === null) {
      g.missing++
    } else {
      g.cost += r.cost
      g.value += r.value
      const cls = r.instrument?.assetClass ?? 'lainnya'
      g.classes.set(cls, (g.classes.get(cls) ?? 0) + r.value)
    }
    byCurrency.set(cur, g)
  }

  const negative = rows.filter((r) => r.instrument?.verdict?.verdict === 'jual').length

  async function submit() {
    setError(null)
    if (form.instrumentId === null && form.id === null) return setError('Pilih instrumen lebih dulu.')
    const quantity = parseNumber(form.quantity)
    const avgPrice = parseNumber(form.avgPrice)
    if (!(quantity > 0)) return setError('Jumlah harus angka lebih dari nol.')
    if (!(avgPrice > 0)) return setError('Harga rata-rata harus angka lebih dari nol.')

    setBusy(true)
    try {
      const payload = { quantity, avgPrice, openedAt: form.openedAt || null, note: form.note || null }
      const res = await fetch(form.id ? `/api/v1/user/portfolio/${form.id}` : '/api/v1/user/portfolio', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form.id ? payload : { ...payload, instrumentId: form.instrumentId }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'Gagal menyimpan posisi.')
        return
      }
      setForm(EMPTY)
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Hapus posisi ini dari catatan?')) return
    const res = await fetch(`/api/v1/user/portfolio/${id}`, { method: 'DELETE' })
    if (res.ok) startTransition(() => router.refresh())
  }

  const editingRow = form.id ? rows.find((r) => r.id === form.id) : null

  return (
    <>
      {rows.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <IconWallet size={14} />
              Ringkasan
            </span>
            <span className="panel-meta">
              {rows.length}/{limit} posisi
              {negative > 0 && ` · ${negative} dengan bukti negatif`}
            </span>
          </div>
          <div className="kpis">
            {[...byCurrency.entries()].map(([cur, g]) => {
              const pnl = g.value - g.cost
              const pct = g.cost > 0 ? (pnl / g.cost) * 100 : null
              return (
                <div key={cur} className="kpi">
                  <div className="kpi-label">Nilai · {cur}</div>
                  <div className="kpi-value">{formatPriceIn(g.value, cur)}</div>
                  <div className={`kpi-note`} style={{ color: pnl > 0 ? 'var(--measured)' : pnl < 0 ? 'var(--halted)' : undefined }}>
                    {pnl >= 0 ? '+' : ''}
                    {formatPriceIn(pnl, cur)} ({formatPct(pct)})
                  </div>
                  {g.missing > 0 && <div className="kpi-note">{g.missing} posisi belum punya harga</div>}
                  {g.value > 0 && (
                    <>
                      <div className="bar" style={{ marginTop: 10 }}>
                        {[...g.classes.entries()].map(([cls, v]) => (
                          <span
                            key={cls}
                            style={{ width: `${(v / g.value) * 100}%`, background: CLASS_COLOR[cls] ?? 'var(--line-strong)' }}
                            title={`${ASSET_CLASS_LABEL[cls] ?? cls} ${((v / g.value) * 100).toFixed(1)}%`}
                          />
                        ))}
                      </div>
                      <div className="legend">
                        {[...g.classes.entries()].map(([cls, v]) => (
                          <span key={cls}>
                            <i style={{ background: CLASS_COLOR[cls] ?? 'var(--line-strong)' }} />
                            {ASSET_CLASS_LABEL[cls] ?? cls} {((v / g.value) * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            {form.id ? <IconEdit size={14} /> : <IconPlus size={14} />}
            {form.id ? `Sunting posisi ${editingRow?.instrument?.symbol ?? ''}` : 'Catat posisi'}
          </span>
        </div>
        <div className="panel-body">
          <div className="form-row">
            {!form.id && (
              <div className="field" style={{ flex: '2 1 260px' }}>
                <span className="field-label">Instrumen</span>
                <InstrumentPicker
                  options={market.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, assetClass: m.assetClass }))}
                  value={form.instrumentId}
                  onChange={(id) => {
                    const m = byId.get(id)
                    setForm((f) => ({
                      ...f,
                      instrumentId: id,
                      avgPrice: f.avgPrice || (m?.lastClose ? toInput(m.lastClose) : ''),
                    }))
                  }}
                />
              </div>
            )}
            <label className="field" style={{ flex: '1 1 130px' }}>
              <span className="field-label">Jumlah (unit)</span>
              <input
                className="input"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="mis. 500 lembar / 0,25 BTC"
              />
            </label>
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span className="field-label">Harga rata-rata</span>
              <input
                className="input"
                inputMode="decimal"
                value={form.avgPrice}
                onChange={(e) => setForm({ ...form, avgPrice: e.target.value })}
              />
            </label>
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span className="field-label">Tanggal beli</span>
              <input
                className="input"
                type="date"
                value={form.openedAt}
                onChange={(e) => setForm({ ...form, openedAt: e.target.value })}
              />
            </label>
            <label className="field" style={{ flex: '2 1 200px' }}>
              <span className="field-label">Catatan</span>
              <input
                className="input"
                maxLength={280}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="opsional"
              />
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-signal" onClick={submit} disabled={busy}>
                {form.id ? 'Simpan' : 'Catat'}
              </button>
              {form.id && (
                <button type="button" className="btn" onClick={() => setForm(EMPTY)}>
                  Batal
                </button>
              )}
            </div>
          </div>
          <p className="kpi-note" style={{ marginTop: 8 }}>
            Saham IDX dicatat per lembar, bukan per lot (1 lot = 100 lembar).
          </p>
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconWallet size={14} />
            Posisi
          </span>
        </div>
        {rows.length === 0 ? (
          <Blank icon={<IconWallet size={22} />} title="Belum ada posisi">
            Catat posisi pertama Anda lewat formulir di atas.
          </Blank>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Simbol</th>
                  <th className="num hide-sm">Jumlah</th>
                  <th className="num hide-sm">Rata-rata</th>
                  <th className="num hide-sm">Penutupan</th>
                  <th className="num">Nilai</th>
                  <th className="num">Untung/rugi</th>
                  <th className="num hide-sm">Skor menengah</th>
                  <th>Putusan komite</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cur = r.instrument?.currency ?? ''
                  return (
                    <tr key={r.id}>
                      <td className="key">
                        {r.instrument ? (
                          <Link href={`/ringkasan?symbol=${encodeURIComponent(r.instrument.symbol)}`}>{r.instrument.symbol}</Link>
                        ) : (
                          '—'
                        )}
                        {r.note && <div className="dim" style={{ fontFamily: 'var(--sans)', fontWeight: 400, fontSize: 11 }}>{r.note}</div>}
                      </td>
                      <td className="num hide-sm">{r.quantity.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</td>
                      <td className="num hide-sm">{formatPriceIn(r.avgPrice, cur)}</td>
                      <td className="num hide-sm">{formatPriceIn(r.instrument?.lastClose ?? null, cur)}</td>
                      <td className="num">{formatPriceIn(r.value, cur)}</td>
                      <td className="num" style={{ color: r.pnl === null ? undefined : r.pnl >= 0 ? 'var(--measured)' : 'var(--halted)' }}>
                        {r.pnl === null ? '—' : `${formatPriceIn(r.pnl, cur)} (${formatPct(r.pnlPct)})`}
                      </td>
                      <td className="num hide-sm">
                        <ScoreText value={r.instrument?.scores.menengah?.score} />
                      </td>
                      <td>
                        <VerdictTag verdict={r.instrument?.verdict?.verdict} />
                      </td>
                      <td>
                        <span className="btn-row">
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '3px 7px' }}
                            onClick={() =>
                              setForm({
                                id: r.id,
                                instrumentId: r.instrumentId,
                                quantity: toInput(r.quantity),
                                avgPrice: toInput(r.avgPrice),
                                openedAt: r.openedAt ?? '',
                                note: r.note ?? '',
                              })
                            }
                            aria-label="Sunting posisi"
                          >
                            <IconEdit size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '3px 7px' }}
                            onClick={() => remove(r.id)}
                            aria-label="Hapus posisi"
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
    </>
  )
}
