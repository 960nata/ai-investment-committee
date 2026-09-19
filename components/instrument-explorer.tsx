'use client'

/**
 * Pemilih instrumen dan grafiknya.
 *
 * Satu-satunya bagian ringkasan yang perlu berjalan di klien. Instrumen pertama
 * beserta candle-nya datang sudah terisi dari server, jadi halaman langsung
 * tergambar penuh; pengambilan data hanya terjadi ketika seseorang mengklik,
 * bukan di dalam effect yang jalan sendiri tiap render.
 */

import { useState, useTransition } from 'react'
import { CandlestickChart, type Candle } from './candlestick-chart'
import { IconAlert, IconCandles, IconRows } from './icons'
import { Blank, Tag } from './ui'

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
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const body = await response.json()
        setCandles(body.candles ?? [])
      } catch (err) {
        setCandles([])
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="split" style={{ marginTop: 'var(--space-4)' }}>
      <section className="panel" style={{ marginTop: 0 }}>
        <div className="panel-head">
          <span className="panel-title">
            <IconCandles size={14} />
            {selected ? selected.symbol : 'Grafik'}
          </span>
          {selected && (
            <span style={{ fontSize: 'var(--t-small)', color: 'var(--ink-mute)' }}>
              {selected.name}
            </span>
          )}
          <span className="panel-meta">
            {pending ? 'memuat' : `${candles.length} candle`}
          </span>
        </div>

        <div className="chart">
          {error ? (
            <Blank icon={<IconAlert size={22} />} title="Grafik gagal dimuat">
              Coba muat ulang halaman. Kalau terus berulang, periksa apakah pipa data masih
              berjalan di halaman Pipeline.
            </Blank>
          ) : candles.length > 0 ? (
            <CandlestickChart data={candles} />
          ) : (
            <Blank icon={<IconCandles size={22} />} title="Belum ada candle">
              Instrumen ini belum punya riwayat tersimpan. Tunggu dispatcher berjalan pada jam
              berikutnya, atau isi riwayatnya lebih dulu.
            </Blank>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 0 }}>
        <div className="panel-head">
          <span className="panel-title">
            <IconRows size={14} />
            Instrumen
          </span>
          <span className="panel-meta">{instruments.length}</span>
        </div>

        {instruments.length === 0 ? (
          <Blank icon={<IconRows size={22} />} title="Belum ada instrumen">
            Jalankan <code>npm run db:seed</code> untuk mengisi daftar awal.
          </Blank>
        ) : (
          <div className="picker">
            {instruments.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                className="pick"
                aria-pressed={instrument.id === selectedId}
                onClick={() => select(instrument)}
              >
                <span className="pick-symbol">{instrument.symbol.replace(/USDT$/, '')}</span>
                <span className="pick-name">{instrument.name}</span>
                <span className="pick-tail">
                  <Tag>{instrument.market}</Tag>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
