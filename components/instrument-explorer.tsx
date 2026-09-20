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
 *
 * Tab yang punya lebih dari satu kelas aset (seperti Crypto, yang mencakup
 * crypto dan meme coin) memperlihatkan sub-filter supaya pengguna bisa melihat
 * masing-masing secara terpisah.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CandlestickChart, type Candle } from './candlestick-chart'
import { RegionFlag } from './flags'
import { IconAlert, IconCandles, IconClose, IconCourt, IconRows } from './icons'
import { AssetIcon } from './asset-icons'
import { Blank } from './ui'
import { ScorePanel, type HorizonView } from './score-panel'
import { CommitteeBoardroom } from './committee-boardroom'
import type { TabGroup } from '@/lib/db/schema'

interface LiveQuoteData {
  price: number
  changePct: number
  time: number
  source: 'binance' | 'yahoo'
}

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
  tabs: TabGroup[]
  initialInstrumentId: number | null
  initialCandles: Candle[]
}

export function InstrumentExplorer({ instruments, scores, tabs, initialInstrumentId, initialCandles }: Props) {
  const initial = instruments.find((i) => i.id === initialInstrumentId)

  // Cari tab group mana yang memuat instrumen pembuka.
  const initialTab =
    tabs.find((t) => t.children.some((c) => c.id === initial?.assetClass))?.id ??
    tabs[0]?.id ??
    'crypto'

  const [tab, setTab] = useState(initialTab)
  const [subtab, setSubtab] = useState<string>('semua')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionFilter>('semua')
  const [selectedId, setSelectedId] = useState(initialInstrumentId)
  const [candles, setCandles] = useState(initialCandles)
  const [showBoardroom, setShowBoardroom] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuoteData>>({})

  const activeGroup = tabs.find((t) => t.id === tab)
  const childIds = useMemo(
    () => activeGroup?.children.map((c) => c.id) ?? [],
    [activeGroup],
  )
  const showSubtabs = (activeGroup?.children.length ?? 0) > 1

  const inTab = useMemo(
    () => instruments.filter((i) => (childIds as string[]).includes(i.assetClass)),
    [instruments, childIds],
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
    () =>
      inTab.filter((i) => {
        if (showSubtabs && subtab !== 'semua' && i.assetClass !== subtab) return false
        if (showRegions && !matchesRegion(i, region)) return false
        return matchesQuery(i, query)
      }),
    [inTab, showSubtabs, subtab, showRegions, region, query],
  )

  const selected = instruments.find((i) => i.id === selectedId) ?? null

  // Polling kutipan harga realtime untuk instrumen terpilih dan baris yang sedang terlihat
  useEffect(() => {
    const symbols = new Set<string>()
    if (selected) symbols.add(selected.symbol)
    for (const item of visible.slice(0, 24)) {
      symbols.add(item.symbol)
    }
    if (symbols.size === 0) return

    let cancelled = false
    async function fetchLive() {
      try {
        const queryStr = Array.from(symbols).join(',')
        const res = await fetch(`/api/quotes/live?symbols=${encodeURIComponent(queryStr)}`)
        if (!res.ok) return
        const body = (await res.json()) as { quotes?: Record<string, LiveQuoteData> }
        if (!cancelled && body.quotes) {
          setLiveQuotes((prev) => ({ ...prev, ...body.quotes }))
        }
      } catch {
        // Abaikan galat jaringan, tetap tampilkan harga candle historis
      }
    }

    fetchLive()
    const timer = setInterval(fetchLive, 8_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [visible, selected])

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
        count: instruments.filter(
          (i) => t.children.some((c) => c.id === i.assetClass) && matchesQuery(i, query),
        ).length,
      }))
      .filter((t) => t.count > 0)
  }, [instruments, tabs, tab, query])

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
    setSubtab('semua')
    setRegion('semua')

    // Pindah tab langsung memuat instrumen pertamanya. Grafik yang menampilkan
    // aset dari tab sebelumnya adalah cara termudah salah membaca harga.
    //
    // Yang dipilih adalah instrumen pertama yang PUNYA riwayat, bukan yang
    // pertama menurut abjad. Kelas aset yang baru ditambahkan berisi instrumen
    // yang sudah terdaftar tetapi belum pernah ditarik datanya, dan membuka tab
    // pada salah satunya menampilkan bidang kosong — yang terbaca sebagai
    // "grafiknya rusak", padahal datanya memang ada di instrumen sebelah.
    // Aturan ini sama dengan yang dipakai halaman saat memilih instrumen
    // pembuka; sebelumnya aturan itu hanya berlaku pada muatan pertama.
    const group = tabs.find((t) => t.id === next)
    const nextChildIds = group?.children.map((c) => c.id) ?? []
    const candidates = instruments.filter(
      (i) => (nextChildIds as string[]).includes(i.assetClass) && matchesQuery(i, query),
    )
    const first = candidates.find((i) => i.candleCount > 0) ?? candidates[0]

    if (first && first.id !== selectedId) load(first)
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Jenis aset">
        {tabs.map((t) => {
          const count = instruments.filter((i) =>
            t.children.some((c) => c.id === i.assetClass),
          ).length
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
              {selected.assetClass === 'crypto' || selected.assetClass === 'memecoin' ? (
                <AssetIcon symbol={selected.symbol} size={14} />
              ) : (
                <RegionFlag region={selected.region} size={12} />
              )}
              {selected.name}
            </span>
          )}
          {(() => {
            const live = selected ? liveQuotes[selected.symbol] : null
            const price = live?.price ?? selected?.lastClose
            const change = live?.changePct ?? selected?.changePct ?? null
            if (price == null) return null
            return (
              <span className="quote">
                <span className="quote-price">
                  {formatPrice(price, selected?.currency ?? '')}
                </span>
                <Change value={change} />
                {live && (
                  <span className="live-pill" title="Harga diperbarui langsung dari bursa">
                    <span className="live-dot" />
                    Live
                  </span>
                )}
              </span>
            )
          })()}
          <span className="panel-meta">{pending ? 'memuat' : `${candles.length} candle`}</span>
          {selected && (
            <button
              type="button"
              className={`seg ${showBoardroom ? 'active' : ''}`}
              onClick={() => setShowBoardroom((prev) => !prev)}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 'var(--t-micro)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: showBoardroom ? 'var(--tint-brand)' : 'var(--bg-card)',
                color: showBoardroom ? 'var(--brand)' : 'var(--ink-mute)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Tampilkan / sembunyikan transkrip debat rapat komite AI"
            >
              <IconCourt size={14} />
              <span>{showBoardroom ? 'Tutup Rapat Komite' : 'Rapat Komite AI'}</span>
            </button>
          )}
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
              {selected
                ? `Belum ada data harga tersimpan untuk ${selected.symbol}. Jalankan ingest untuk memuatnya.`
                : 'Pilih instrumen di bawah untuk melihat grafiknya.'}
            </Blank>
          )}
        </div>
      </section>

      {/* --- panel skor terkalibrasi -------------------------------------- */}
      {selected && scores[selected.id] && (
        <ScorePanel
          asOf={scores[selected.id].asOf}
          horizons={scores[selected.id].horizons}
        />
      )}

      {/* --- panel rapat komite AI (Live Boardroom) ------------------------ */}
      {selected && showBoardroom && (
        <CommitteeBoardroom
          market={selected.market}
          symbol={selected.symbol}
          name={selected.name}
          currency={selected.currency}
        />
      )}

      {/* --- daftar instrumen --------------------------------------------- */}
      <section className="panel" style={{ marginTop: 'var(--space-3)' }}>
        <div className="panel-head">
          <span className="panel-title">
            <IconRows size={14} />
            {activeGroup?.label ?? 'Instrumen'}
          </span>
          {showSubtabs && (
            <div className="segmented" role="group" aria-label="Kategori">
              {[
                { id: 'semua', label: 'Semua', count: inTab.length },
                ...activeGroup!.children.map((child) => ({
                  id: child.id,
                  label: child.label,
                  count: inTab.filter((i) => (i.assetClass as string) === child.id).length,
                })),
              ].map(({ id, label, count }) => (
                <button
                  key={id}
                  type="button"
                  className="seg"
                  aria-pressed={subtab === id}
                  onClick={() => setSubtab(id)}
                >
                  {label}
                  <span className="seg-count">{count}</span>
                </button>
              ))}
            </div>
          )}

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

          {/* Kolom Pencarian Simbol / Emiten */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', minWidth: 210 }}>
              <input
                type="text"
                placeholder="Cari simbol atau emiten..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 26px 4px 10px',
                  fontSize: 'var(--t-small)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-card)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ink-mute)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 4px',
                    lineHeight: 1,
                  }}
                  title="Kosongkan pencarian"
                >
                  <IconClose size={12} />
                </button>
              )}
            </div>
          </div>
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
            {visible.map((instrument) => {
              const live = liveQuotes[instrument.symbol]
              const price = live?.price ?? instrument.lastClose
              const change = live?.changePct ?? instrument.changePct
              return (
                <button
                  key={instrument.id}
                  type="button"
                  className="card-pick"
                  aria-pressed={instrument.id === selectedId}
                  onClick={() => load(instrument)}
                >
                  <span className="card-pick-head">
                    {instrument.assetClass === 'crypto' || instrument.assetClass === 'memecoin' ? (
                      <AssetIcon symbol={instrument.symbol} size={16} />
                    ) : (
                      <RegionFlag region={instrument.region} size={13} />
                    )}
                    <span className="card-pick-symbol">{display(instrument.symbol)}</span>
                    <Change value={change} />
                  </span>
                  <span className="card-pick-name">{instrument.name}</span>
                  <span className="card-pick-foot">
                    {price == null ? (
                      <span style={{ color: 'var(--ink-faint)' }}>belum ada harga</span>
                    ) : (
                      <>
                        <span className="card-pick-price">
                          {formatPrice(price, instrument.currency)}
                          {live && (
                            <span
                              className="live-dot"
                              style={{ display: 'inline-block', marginLeft: 5, verticalAlign: 'middle' }}
                              title="Harga realtime"
                            />
                          )}
                        </span>
                        <span style={{ color: 'var(--ink-faint)' }}>
                          {instrument.candleCount} candle
                        </span>
                      </>
                    )}
                  </span>
                </button>
              )
            })}
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
  if (value === 0) return `0 ${currency}`
  // Rupiah tidak pernah ditulis berkoma
  if (currency === 'IDR' || currency === 'JPY' || currency === 'KRW') {
    return `${Math.round(value).toLocaleString('id-ID')} ${currency}`
  }
  // Koin mikro atau meme coin dengan harga di bawah 0.01 tidak boleh dibulatkan jadi 0,0000
  let minDigits = 2
  let maxDigits = 2
  if (value < 0.0001) {
    minDigits = 6
    maxDigits = 8
  } else if (value < 0.01) {
    minDigits = 4
    maxDigits = 6
  } else if (value < 10) {
    minDigits = 2
    maxDigits = 4
  }
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits })} ${currency}`
}

function yearsAgo(n: number): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}
