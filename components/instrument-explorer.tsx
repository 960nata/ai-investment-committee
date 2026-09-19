'use client'

/**
 * Penjelajah instrumen.
 *
 * Grafik memakai lebar penuh dan daftarnya ada di bawahnya, bukan di samping.
 * Grafik harga yang disempitkan jadi dua pertiga layar kehilangan justru hal
 * yang membuatnya berguna: bentuk pergerakan sepanjang waktu.
 *
 * Tab memilah menurut jenis aset, bukan menurut bursa. Orang mencari "emas",
 * bukan "kontrak berjangka di bursa global", dan emas kebetulan bisa dibeli di
 * dua tempat dengan kalender berbeda.
 */

import { useMemo, useState, useTransition } from 'react'
import { CandlestickChart, type Candle } from './candlestick-chart'
import { RegionFlag } from './flags'
import { IconAlert, IconCandles, IconRows } from './icons'
import { AssetIcon } from './asset-icons'
import { Blank } from './ui'
import { ScorePanel, type HorizonView } from './score-panel'

export interface ExplorerInstrument {
  id: number
  symbol: string
  name: string
  market: string
  assetClass: string
  region: string | null
  currency: string
  lastClose: number | null
  lastDate: string | null
  changePct: number | null
  candleCount: number
}

interface Props {
  instruments: ExplorerInstrument[]
  scores: Record<number, { asOf: string; horizons: HorizonView[] }>
  tabs: { id: string; label: string }[]
  initialInstrumentId: number | null
  initialCandles: Candle[]
}

export function InstrumentExplorer({ instruments, scores, tabs, initialInstrumentId, initialCandles }: Props) {
  const initial = instruments.find((i) => i.id === initialInstrumentId)
  const [tab, setTab] = useState(initial?.assetClass ?? tabs[0]?.id ?? 'crypto')
  const [selectedId, setSelectedId] = useState(initialInstrumentId)
  const [candles, setCandles] = useState(initialCandles)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const visible = useMemo(
    () => instruments.filter((i) => i.assetClass === tab),
    [instruments, tab],
  )

  const selected = instruments.find((i) => i.id === selectedId) ?? null

  function load(instrument: ExplorerInstrument) {
    setSelectedId(instrument.id)
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/v1/instruments/${instrument.id}/candles?from=${yearsAgo(2)}`, {
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const body = await response.json()
        setCandles(body.candles ?? [])
      } catch (err) {
        setCandles([])
        setError(
          err instanceof DOMException && err.name === 'TimeoutError'
            ? 'Server tidak menjawab dalam 15 detik.'
            : err instanceof Error
              ? err.message
              : String(err),
        )
      }
    })
  }

  function switchTab(next: string) {
    setTab(next)
    // Pindah tab langsung memuat instrumen pertamanya. Grafik yang menampilkan
    // aset dari tab sebelumnya adalah cara termudah salah membaca harga.
    const first = instruments.find((i) => i.assetClass === next)
    if (first && first.id !== selectedId) load(first)
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Jenis aset">
        {tabs.map((t) => {
          const count = instruments.filter((i) => i.assetClass === t.id).length
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              className="tab"
              onClick={() => switchTab(t.id)}
              disabled={count === 0}
            >
              {t.label}
              <span className="tab-count">{count}</span>
            </button>
          )
        })}
      </div>

      <section className="panel" style={{ marginTop: 0 }}>
        <div className="panel-head">
          <span className="panel-title">
            <IconCandles size={14} />
            {selected ? selected.symbol : 'Grafik'}
          </span>
          {selected && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-small)', color: 'var(--ink-mute)' }}>
              <RegionFlag region={selected.region} size={12} />
              {selected.name}
            </span>
          )}
          {selected?.lastClose != null && (
            <span className="quote">
              <span className="quote-price">
                {formatPrice(selected.lastClose, selected.currency)}
              </span>
              <Change value={selected.changePct} />
            </span>
          )}
          <span className="panel-meta">{pending ? 'memuat' : `${candles.length} candle`}</span>
        </div>

        <div className="chart chart-wide">
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

      <ScorePanel
        horizons={selected ? (scores[selected.id]?.horizons ?? []) : []}
        asOf={selected ? (scores[selected.id]?.asOf ?? null) : null}
      />

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconRows size={14} />
            {tabs.find((t) => t.id === tab)?.label ?? 'Instrumen'}
          </span>
          <span className="panel-meta">{visible.length} instrumen</span>
        </div>

        {visible.length === 0 ? (
          <Blank icon={<IconRows size={22} />} title="Belum ada instrumen di kelas ini">
            Jalankan <code>npm run db:seed</code> untuk mengisi katalognya.
          </Blank>
        ) : (
          <div className="cards">
            {visible.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                className="card-pick"
                aria-pressed={instrument.id === selectedId}
                onClick={() => load(instrument)}
              >
                <span className="card-pick-head">
                  <AssetIcon symbol={instrument.symbol} size={16} />
                  <RegionFlag region={instrument.region} size={13} />
                  <span className="card-pick-symbol">{display(instrument.symbol)}</span>
                  <Change value={instrument.changePct} />
                </span>
                <span className="card-pick-name">{instrument.name}</span>
                <span className="card-pick-foot">
                  {instrument.lastClose == null ? (
                    <span style={{ color: 'var(--ink-faint)' }}>belum ada harga</span>
                  ) : (
                    <>
                      <span className="card-pick-price">
                        {formatPrice(instrument.lastClose, instrument.currency)}
                      </span>
                      <span style={{ color: 'var(--ink-faint)' }}>
                        {instrument.candleCount} candle
                      </span>
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="change" />

  // Nol persen ditulis apa adanya, bukan diwarnai. Hari tanpa perubahan bukan
  // hari baik maupun buruk.
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return (
    <span className={`change ${tone}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

/** Simbol dirapikan untuk dibaca: akhiran bursa dan penanda kontrak dibuang. */
function display(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/\.JK$/, '').replace(/=F$/, '').replace(/^\^/, '')
}

function formatPrice(value: number, currency: string): string {
  // Rupiah tidak pernah ditulis berkoma; dolar dan sejenisnya perlu dua angka.
  const digits = currency === 'IDR' || currency === 'JPY' || currency === 'KRW' ? 0 : value < 10 ? 4 : 2
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`
}

function yearsAgo(n: number): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}
