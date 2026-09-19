'use client'

/**
 * Pemilih instrumen dan grafiknya.
 *
 * Satu-satunya bagian dashboard yang perlu jadi komponen klien. Instrumen awal
 * beserta candle-nya datang sudah terisi dari server, jadi halaman langsung
 * tergambar penuh; pengambilan data hanya terjadi saat pengguna mengklik, bukan
 * di dalam effect yang jalan sendiri setiap render.
 */

import { useState, useTransition } from 'react'
import { CandlestickChart, type Candle } from './candlestick-chart'

export interface ExplorerInstrument {
  id: number
  symbol: string
  name: string
  market: string
}

interface Props {
  instruments: ExplorerInstrument[]
  initialInstrumentId: number | null
  initialCandles: Candle[]
}

export function InstrumentExplorer({ instruments, initialInstrumentId, initialCandles }: Props) {
  const [selectedId, setSelectedId] = useState(initialInstrumentId)
  const [candles, setCandles] = useState(initialCandles)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = instruments.find((i) => i.id === selectedId) ?? null

  function select(instrument: ExplorerInstrument) {
    if (instrument.id === selectedId) return

    setSelectedId(instrument.id)
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/v1/instruments/${instrument.id}/candles`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        setCandles(data.candles ?? [])
      } catch (err) {
        setCandles([])
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="explorer-grid">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {selected ? `${selected.symbol} — ${selected.name}` : 'Pilih instrumen'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {pending ? 'memuat…' : `${candles.length} candle`}
          </span>
        </div>

        <div className="chart-container">
          {error ? (
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <div className="empty-state-title">Gagal memuat grafik</div>
              <div className="empty-state-text">{error}</div>
            </div>
          ) : candles.length > 0 ? (
            <CandlestickChart data={candles} />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📈</div>
              <div className="empty-state-title">Belum Ada Data</div>
              <div className="empty-state-text">
                Instrumen ini belum punya candle tersimpan. Tunggu dispatcher berjalan pada
                jam berikutnya, atau isi riwayatnya lebih dulu.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxHeight: 540, overflowY: 'auto' }}>
        <div className="card-header">
          <span className="card-title">Instrumen Crypto</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {instruments.length} aset
          </span>
        </div>

        {instruments.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
            <div className="empty-state-text">
              Belum ada instrumen. Jalankan <code>npm run db:seed</code> untuk memulai.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {instruments.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                onClick={() => select(instrument)}
                className={`instrument-row ${instrument.id === selectedId ? 'selected' : ''}`}
              >
                <span className="instrument-row-symbol">
                  {instrument.symbol.replace(/USDT$/, '')}
                </span>
                <span className="instrument-row-name">{instrument.name}</span>
                <span className={`market-badge ${instrument.market.toLowerCase()}`}>
                  {instrument.market}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
