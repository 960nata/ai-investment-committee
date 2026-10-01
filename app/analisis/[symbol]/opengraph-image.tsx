import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/brand'
import { getLatestScoredModelVersion, getLatestScoresForSymbol, listInstrumentQuotes } from '@/lib/db/queries'
import { MODEL_VERSION } from '@/lib/scoring/weights'
import { formatPriceIn } from '@/lib/format/market'

/** Kartu pratinjau per instrumen: harga dan skor tiga horizon, siap dibagikan. */

export const alt = `Analisis instrumen — ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const HORIZON = { pendek: 'Pendek', menengah: 'Menengah', panjang: 'Panjang' } as const

export default async function Image({ params }: { params: Promise<{ symbol: string }> }) {
  let symbol = (await params).symbol
  try {
    symbol = decodeURIComponent(symbol)
  } catch {}
  symbol = symbol.toUpperCase()

  const quotes = await listInstrumentQuotes().catch(() => [])
  const quote = quotes.find((q) => q.symbol.toUpperCase() === symbol)
  const version = (await getLatestScoredModelVersion(MODEL_VERSION).catch(() => null)) ?? MODEL_VERSION
  const scored = quote ? await getLatestScoresForSymbol(quote.symbol, version).catch(() => null) : null
  const order = { pendek: 0, menengah: 1, panjang: 2 }
  const scores = [...(scored?.scores ?? [])].sort((a, b) => order[a.horizon] - order[b.horizon])
  const display = (quote?.symbol ?? symbol).replace(/\.JK$/, '')
  const change = quote?.changePct ?? null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(250,134,42,0.25), transparent 70%), #040202',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26 }}>
          <span style={{ color: '#fa862a', fontWeight: 700 }}>{SITE_NAME}</span>
          <span style={{ color: '#94a3b8' }}>Analisis probabilistik</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3 }}>{display}</div>
          <div style={{ fontSize: 32, color: '#94a3b8' }}>{quote?.name ?? ''}</div>
          {quote && (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 20, fontSize: 40, fontWeight: 700 }}>
              <span>{formatPriceIn(quote.lastClose, quote.currency)}</span>
              {change !== null && Number.isFinite(change) && (
                <span style={{ marginLeft: 20, color: change >= 0 ? '#4f9d8e' : '#d0655b' }}>
                  {change >= 0 ? '+' : '−'}
                  {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {scores.length === 0 ? (
            <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.45)' }}>Skor belum tersedia</div>
          ) : (
            scores.map((s) => (
              <div
                key={s.horizon}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '18px 26px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  minWidth: 240,
                }}
              >
                <span style={{ fontSize: 22, color: '#94a3b8' }}>Skor {HORIZON[s.horizon]}</span>
                <span style={{ fontSize: 44, fontWeight: 800, color: s.score >= 0 ? '#4f9d8e' : '#d0655b' }}>
                  {s.score >= 0 ? '+' : '−'}
                  {Math.abs(s.score).toFixed(2)}
                </span>
                <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.45)' }}>keyakinan {s.confidence}</span>
              </div>
            ))
          )}
        </div>
      </div>
    ),
    size,
  )
}
