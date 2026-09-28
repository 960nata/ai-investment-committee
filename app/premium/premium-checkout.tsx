'use client'

import { useMemo, useState } from 'react'
import { formatRupiah, type PremiumPlan } from '@/lib/premium/plans'

interface Channel {
  code: string
  name: string
  group: string
  feeFlat: number
  feePercent: number
}

/** Perkiraan biaya yang ditambahkan Tripay ke tagihan pembeli. */
function estimateFee(channel: Channel | undefined, amount: number): number {
  if (!channel) return 0
  return Math.ceil(channel.feeFlat + (amount * channel.feePercent) / 100)
}

export function PremiumCheckout({
  plans,
  channels,
  paymentReady,
}: {
  plans: PremiumPlan[]
  channels: Channel[]
  paymentReady: boolean
}) {
  const [planId, setPlanId] = useState(plans.find((p) => p.highlight)?.id ?? plans[0]?.id)
  const [method, setMethod] = useState(channels.find((c) => c.code === 'QRIS')?.code ?? channels[0]?.code)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = plans.find((p) => p.id === planId)
  const channel = channels.find((c) => c.code === method)
  const fee = plan ? estimateFee(channel, plan.price) : 0

  const groups = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const c of channels) map.set(c.group, [...(map.get(c.group) ?? []), c])
    return [...map.entries()]
  }, [channels])

  async function pay() {
    if (!plan || !method) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, method }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        return
      }
      setError(data.error || 'Gagal membuat tagihan. Coba lagi.')
    } catch {
      setError('Kesalahan koneksi. Coba lagi.')
    }
    setBusy(false)
  }

  return (
    <div className="premium-checkout">
      <div className="premium-plans" role="radiogroup" aria-label="Paket Premium">
        {plans.map((p) => {
          const perMonth = Math.round((p.price / p.days) * 30)
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === planId}
              className={`premium-plan${p.id === planId ? ' is-selected' : ''}${p.highlight ? ' is-highlight' : ''}`}
              onClick={() => setPlanId(p.id)}
            >
              {p.highlight && <span className="premium-plan-badge mono">PALING HEMAT</span>}
              <span className="premium-plan-label">{p.label}</span>
              <span className="premium-plan-price mono">{formatRupiah(p.price)}</span>
              {p.compareAt > p.price && (
                <span className="premium-plan-compare mono">
                  <s>{formatRupiah(p.compareAt)}</s> hemat {Math.round((1 - p.price / p.compareAt) * 100)}%
                </span>
              )}
              <span className="premium-plan-meta mono">
                {p.days} hari{p.days > 30 ? ` · ≈ ${formatRupiah(perMonth)}/bulan` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {!paymentReady || channels.length === 0 ? (
        <p className="donate-empty mono">Pembayaran belum dibuka. Silakan kembali lagi nanti.</p>
      ) : (
        <>
          <label className="premium-method mono">
            <span>Metode pembayaran</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {groups.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {plan && (
            <div className="premium-total mono">
              <span>Total</span>
              <strong>{formatRupiah(plan.price + fee)}</strong>
              {fee > 0 && <small>termasuk perkiraan biaya {channel?.name} {formatRupiah(fee)}</small>}
            </div>
          )}

          {error && (
            <p className="premium-error" role="alert">
              {error}
            </p>
          )}

          <button type="button" className="btn btn-primary premium-pay" disabled={busy || !plan} onClick={() => void pay()}>
            {busy ? 'Membuat tagihan…' : `Bayar ${plan ? formatRupiah(plan.price + fee) : ''}`}
          </button>
        </>
      )}
    </div>
  )
}
