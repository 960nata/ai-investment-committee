'use client'

import { useEffect, useState } from 'react'
import { CandlestickChart, IntradayChart, type Candle, type IntradayCandle } from './candlestick-chart'

/*
 * Grafik lilin live di beranda, lima contoh bertab.
 *
 * Komponen grafiknya sama persis dengan yang dipakai terminal — pembaca yang
 * mencoba grafik di sini melihat alat yang akan ia pakai sesudah masuk, bukan
 * gambar pemasaran.
 *
 * Datanya diambil langsung dari bursa, bukan dari basis data: lilin 5 menit
 * dari `/api/quotes/intraday`, lalu
 *   - kripto bergerak detik demi detik lewat WebSocket Binance, dan
 *   - saham, emas, komoditas, dan indeks diperbarui berkala lewat
 *     `/api/quotes/live` (Yahoo tidak menyediakan aliran langsung).
 * Karena tidak bergantung pada basis data, grafik ini tetap hidup meski basis
 * data sedang tidak terbaca. Deret harian dari basis data (`samples`) hanya
 * dipakai sebagai cadangan kalau sumber intraday gagal.
 */

export interface MarketSample {
  tab: string
  symbol: string
  name: string
  currency: string
  candles: Candle[]
}

interface LiveTab {
  tab: string
  symbol: string
  name: string
  kind: 'crypto' | 'idr' | 'usd' | 'index'
}

const TABS: LiveTab[] = [
  { tab: 'Kripto', symbol: 'BTCUSDT', name: 'Bitcoin', kind: 'crypto' },
  { tab: 'Saham', symbol: 'BBCA.JK', name: 'Bank Central Asia', kind: 'idr' },
  { tab: 'Emas', symbol: 'GC=F', name: 'Emas berjangka', kind: 'usd' },
  { tab: 'Komoditi', symbol: 'BZ=F', name: 'Minyak Brent', kind: 'usd' },
  { tab: 'Indeks', symbol: '^JKSE', name: 'IHSG', kind: 'index' },
]

/** Lilin terakhir lebih tua dari ini berarti bursanya sedang tutup. */
const STALE_SECONDS = 30 * 60
const QUOTE_POLL_MS = 15_000
const CANDLE_POLL_MS = 60_000

interface LiveQuote {
  price: number
  changePct: number
}

export function LandingMarketChart({ samples = [] }: { samples?: MarketSample[] }) {
  const [active, setActive] = useState(0)
  const tab = TABS[active]

  const [candles, setCandles] = useState<IntradayCandle[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [quote, setQuote] = useState<LiveQuote | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Lilin 5 menit: dimuat saat tab dipilih, lalu disegarkan tiap menit.
  useEffect(() => {
    let alive = true

    async function loadCandles(initial: boolean) {
      try {
        const res = await fetch(`/api/quotes/intraday?symbol=${encodeURIComponent(tab.symbol)}`, {
          cache: 'no-store',
        })
        const body = res.ok ? ((await res.json()) as { candles?: IntradayCandle[] }) : null
        if (!alive) return
        if (body?.candles?.length) {
          setCandles(body.candles)
          setFailed(false)
        } else if (initial) {
          setFailed(true)
        }
      } catch {
        if (alive && initial) setFailed(true)
      } finally {
        if (alive && initial) setLoading(false)
      }
    }

    loadCandles(true)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadCandles(false)
    }, CANDLE_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [tab.symbol])

  // Harga dan perubahan harian dari bursa, berkala untuk semua jenis aset.
  useEffect(() => {
    let alive = true
    async function loadQuote() {
      try {
        const res = await fetch(`/api/quotes/live?symbols=${encodeURIComponent(tab.symbol)}`, { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { quotes?: Record<string, LiveQuote> }
        const q = body.quotes?.[tab.symbol]
        if (alive && q && Number.isFinite(q.price)) {
          setQuote(q)
          if (tab.kind !== 'crypto') setLivePrice(q.price)
        }
      } catch {
        // Diam: grafik tetap menampilkan lilin terakhir yang ada.
      }
    }
    loadQuote()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadQuote()
    }, QUOTE_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [tab.symbol, tab.kind])

  // Kripto: aliran lilin 5 menit dari Binance. Lilin terakhir diperbarui tiap
  // detik, dan lilin baru langsung muncul saat periode 5 menit berganti.
  useEffect(() => {
    if (tab.kind !== 'crypto') return
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${tab.symbol.toLowerCase()}@kline_5m`)
      ws.onmessage = (event) => {
        try {
          const k = JSON.parse(event.data)?.k
          if (!k) return
          const candle: IntradayCandle = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          }
          setLivePrice(candle.close)
          setCandles((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            if (candle.time === last.time) return [...prev.slice(0, -1), candle]
            if (candle.time > last.time) return [...prev.slice(-400), candle]
            return prev
          })
        } catch {
          // Pesan rusak dilewati.
        }
      }
    } catch {
      // WebSocket diblokir jaringan: polling harga di atas tetap berjalan.
    }
    return () => ws?.close()
  }, [tab.symbol, tab.kind])

  // Detak jam untuk label "pasar tutup" dan umur data.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  /** Pindah tab: kosongkan data tab lama di sini, bukan di dalam effect. */
  function choose(i: number) {
    if (i === active) return
    setActive(i)
    setLoading(true)
    setFailed(false)
    setCandles([])
    setQuote(null)
    setLivePrice(null)
  }

  const last = candles[candles.length - 1]
  const price = livePrice ?? quote?.price ?? last?.close ?? null
  const change = quote?.changePct ?? null
  const tone = (change ?? 0) >= 0 ? 'pos' : 'neg'
  const closed = last ? now / 1000 - last.time > STALE_SECONDS : false

  // Cadangan: deret harian dari basis data untuk tab yang sama.
  const daily = failed ? samples.find((s) => s.symbol === tab.symbol) : undefined

  return (
    <figure className="lp-market lp-reveal">
      <div className="lp-market-tabs" role="tablist" aria-label="Grafik live per kelas aset">
        {TABS.map((t, i) => (
          <button
            key={t.symbol}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="lp-market-tab"
            onClick={() => choose(i)}
          >
            {t.tab}
          </button>
        ))}
      </div>

      <figcaption className="lp-market-head">
        <div>
          <p className="lp-market-symbol">
            {tab.symbol}
            {!failed && candles.length > 0 && (
              <span className={`lp-market-live ${closed ? 'closed' : ''}`}>
                {closed ? 'pasar tutup' : 'live'}
              </span>
            )}
          </p>
          <p className="lp-market-name">{tab.name}</p>
        </div>
        {price !== null && (
          <div className="lp-market-last">
            <p className="lp-market-price">{formatPrice(price, tab.kind)}</p>
            {change !== null && (
              <p className={`lp-market-change ${tone}`}>
                {change >= 0 ? '+' : '−'}
                {Math.abs(change).toLocaleString('id-ID', { maximumFractionDigits: 2 })}% · hari ini
              </p>
            )}
          </div>
        )}
      </figcaption>

      <div className="lp-market-plot">
        {candles.length > 0 ? (
          // key: grafik dibuat ulang per tab supaya skala harganya ikut berganti.
          <IntradayChart key={tab.symbol} data={candles} livePrice={livePrice} />
        ) : daily ? (
          <CandlestickChart key={`daily-${tab.symbol}`} data={daily.candles} range="3M" />
        ) : (
          <div className="lp-market-empty">
            {loading ? 'Memuat grafik live…' : 'Grafik belum bisa dimuat. Coba lagi sebentar.'}
          </div>
        )}
      </div>

      <p className="lp-market-foot">
        {candles.length > 0 ? (
          <>
            <span>1 lilin = {tab.kind === 'crypto' ? 5 : 15} menit</span>
            <span>
              {tab.kind === 'crypto' ? 'live dari Binance, tiap detik' : 'dari Yahoo Finance, diperbarui tiap 15 detik'}
              {closed ? ' · menampilkan sesi terakhir' : ''}
            </span>
          </>
        ) : daily ? (
          <>
            <span>1 lilin = 1 hari</span>
            <span>harga penutupan harian · sumber live sedang tidak tersedia</span>
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </p>
    </figure>
  )
}

function formatPrice(value: number, kind: LiveTab['kind']): string {
  const digits = value >= 1000 ? 0 : 2
  const text = value.toLocaleString('id-ID', { maximumFractionDigits: digits })
  if (kind === 'idr') return `Rp${text}`
  if (kind === 'index') return text
  return `$${text}`
}
