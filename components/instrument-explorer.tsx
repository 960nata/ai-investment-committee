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
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionFilter>('semua')
  const [selectedId, setSelectedId] = useState(initialInstrumentId)
  const [candles, setCandles] = useState(initialCandles)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const inTab = useMemo(
    () => instruments.filter((i) => i.assetClass === tab),
    [instruments, tab],
  )

  /**
   * Penyaring wilayah hanya muncul bila kelas ini benar-benar punya dua sisi.
   * Crypto dan komoditi seluruhnya global; menampilkan tombol "Indonesia" yang
   * selalu kosong di sana melatih orang untuk mengabaikan penyaringnya.
   */
  const regionSplit = useMemo(() => {
    let lokal = 0
    for (const i of inTab) if (isIndonesian(i)) lokal++
    return { lokal, asing: inTab.length - lokal }
  }, [inTab])

  const showRegions = regionSplit.lokal > 0 && regionSplit.asing > 0

  const visible = useMemo(
    () => inTab.filter((i) => matchesRegion(i, showRegions ? region : 'semua') && matchesQuery(i, query)),
    [inTab, region, showRegions, query],
  )

  /**
   * Berapa yang cocok di kelas aset lain.
   *
   * Pencarian sengaja dibatasi pada tab yang sedang dibuka — hasil yang melompat
   * antar kelas aset membuat grafik dan daftar bicara tentang hal berbeda. Tapi
   * pencarian yang berakhir kosong padahal barangnya ada di sebelah adalah jalan
   * buntu, jadi jumlahnya tetap ditunjukkan beserta jalan ke sana.
   */
  const elsewhere = useMemo(() => {
    if (query.trim() === '') return []
    return tabs
      .filter((t) => t.id !== tab)
      .map((t) => ({
        ...t,
        count: instruments.filter((i) => i.assetClass === t.id && matchesQuery(i, query)).length,
      }))
      .filter((t) => t.count > 0)
  }, [instruments, tabs, tab, query])

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
    const first = instruments.find(
      (i) => i.assetClass === next && matchesQuery(i, query),
    )
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
          <span className="panel-meta">
            {visible.length === inTab.length
              ? `${inTab.length} instrumen`
              : `${visible.length} dari ${inTab.length}`}
          </span>
        </div>

        <div className="filter-bar">
          <input
            type="search"
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari simbol, nama, atau negara"
            aria-label="Cari instrumen"
            autoComplete="off"
            spellCheck={false}
          />

          {showRegions && (
            <div className="segmented" role="group" aria-label="Wilayah">
              {(
                [
                  ['semua', 'Semua', inTab.length],
                  ['indonesia', 'Indonesia', regionSplit.lokal],
                  ['internasional', 'Internasional', regionSplit.asing],
                ] as [RegionFilter, string, number][]
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className="seg"
                  aria-pressed={region === id}
                  onClick={() => setRegion(id)}
                >
                  {label}
                  <span className="seg-count">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <Blank
            icon={<IconRows size={22} />}
            title={query ? `Tidak ada yang cocok dengan "${query}"` : 'Belum ada instrumen di kelas ini'}
          >
            {elsewhere.length > 0 ? (
              <>
                Ada di kelas lain:{' '}
                {elsewhere.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ', '}
                    <button type="button" className="link-inline" onClick={() => switchTab(t.id)}>
                      {t.label} ({t.count})
                    </button>
                  </span>
                ))}
                .
              </>
            ) : query ? (
              'Coba kata kunci lain, atau kosongkan pencarian.'
            ) : (
              <>
                Jalankan <code>npm run db:seed</code> untuk mengisi katalognya.
              </>
            )}
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

type RegionFilter = 'semua' | 'indonesia' | 'internasional'

/**
 * Indonesia ditentukan dari pasarnya lebih dulu, baru wilayahnya.
 *
 * `region` diisi dari katalog dan bisa kosong untuk instrumen yang masuk lewat
 * jalur lain; `market` selalu terisi karena kolomnya tidak boleh null. Memakai
 * wilayah saja akan menjatuhkan saham IDX yang wilayahnya belum sempat terisi
 * ke sisi internasional — kesalahan yang tidak terlihat sampai ada yang
 * menghitung jumlahnya.
 */
function isIndonesian(i: ExplorerInstrument): boolean {
  return i.market === 'IDX' || i.region === 'Indonesia'
}

function matchesRegion(i: ExplorerInstrument, filter: RegionFilter): boolean {
  if (filter === 'semua') return true
  return filter === 'indonesia' ? isIndonesian(i) : !isIndonesian(i)
}

/**
 * Pencarian mencakup simbol utuh, simbol yang sudah dirapikan, nama, dan negara.
 *
 * Simbol yang dirapikan ikut dicocokkan karena itulah yang tertulis di layar:
 * orang mengetik "BTC" setelah membaca "BTC", bukan "BTCUSDT". Negara ikut
 * dicocokkan supaya "jepang" mengembalikan seluruh bursa Tokyo tanpa perlu tahu
 * satu pun kode emitennya.
 */
function matchesQuery(i: ExplorerInstrument, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return (
    i.symbol.toLowerCase().includes(q) ||
    display(i.symbol).toLowerCase().includes(q) ||
    i.name.toLowerCase().includes(q) ||
    (i.region ?? '').toLowerCase().includes(q)
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
