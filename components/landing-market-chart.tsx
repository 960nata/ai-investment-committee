'use client'

import { useState } from 'react'
import { CandlestickChart, type Candle } from './candlestick-chart'

/*
 * Grafik lilin kecil di beranda, empat contoh bertab.
 *
 * Komponen grafiknya sama persis dengan yang dipakai terminal — pembaca yang
 * mencoba grafik di sini melihat alat yang akan ia pakai sesudah masuk, bukan
 * gambar pemasaran. Keempat deret dimuat sekali dari server; berpindah tab
 * tidak mengetuk server lagi.
 */

export interface MarketSample {
  tab: string
  symbol: string
  name: string
  currency: string
  candles: Candle[]
}

export function LandingMarketChart({ samples }: { samples: MarketSample[] }) {
  const [active, setActive] = useState(0)
  const sample = samples[active] ?? samples[0]
  if (!sample) return null

  const first = sample.candles[0]
  const last = sample.candles[sample.candles.length - 1]
  const change = first && last ? ((last.close - first.close) / first.close) * 100 : 0
  const tone = change >= 0 ? 'pos' : 'neg'

  return (
    <figure className="lp-market lp-reveal">
      <div className="lp-market-tabs" role="tablist" aria-label="Contoh grafik per kelas aset">
        {samples.map((s, i) => (
          <button
            key={s.symbol}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="lp-market-tab"
            onClick={() => setActive(i)}
          >
            {s.tab}
          </button>
        ))}
      </div>

      <figcaption className="lp-market-head">
        <div>
          <p className="lp-market-symbol">{sample.symbol}</p>
          <p className="lp-market-name">{sample.name}</p>
        </div>
        {last && (
          <div className="lp-market-last">
            <p className="lp-market-price">{formatPrice(last.close, sample.currency)}</p>
            <p className={`lp-market-change ${tone}`}>
              {change >= 0 ? '+' : '−'}
              {Math.abs(change).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% · 3 bulan
            </p>
          </div>
        )}
      </figcaption>

      <div className="lp-market-plot">
        {/* key memaksa grafik dibuat ulang per tab, supaya skala harganya ikut berganti. */}
        <CandlestickChart key={sample.symbol} data={sample.candles} range="3M" />
      </div>

      <p className="lp-market-foot">
        <span>1 lilin = 1 hari</span>
        <span>harga penutupan harian · bukan realtime</span>
      </p>
    </figure>
  )
}

function formatPrice(value: number, currency: string): string {
  const digits = value >= 1000 ? 0 : 2
  const text = value.toLocaleString('id-ID', { maximumFractionDigits: digits })
  if (currency === 'IDR') return `Rp${text}`
  return `$${text}`
}
