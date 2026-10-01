'use client'

/**
 * Grafik lilin.
 *
 * Ada dua mode:
 *
 * 1. **Harian** (default) — candle tertutup dari database. Harga realtime tidak
 *    masuk ke perhitungan skor: skor harus dihitung dari data yang persis sama
 *    dengan yang dipakai backtest.
 *
 * 2. **Intraday** — candle 5 menit dari API bursa, dimuat langsung di browser
 *    dan diperbarui tiap beberapa detik. Mode ini diaktifkan oleh tab 1D di
 *    penjelajah instrumen.
 */

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from 'lightweight-charts'
import { CHART_RANGES, type ChartRangeId } from '@/lib/format/chart-range'

export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IntradayCandle {
  time: number   // unix timestamp detik
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Warna diredam dengan sengaja, dan sama dengan token status di seluruh
// antarmuka. Hijau menyala dan merah menyala membuat pembacanya merasa sedang
// menang atau kalah, padahal yang digambar cuma harga penutupan.
const UP = '#4f9d8e'
const DOWN = '#b3564e'
const UP_SOFT = 'rgba(79, 157, 142, 0.28)'
const DOWN_SOFT = 'rgba(179, 86, 78, 0.28)'

/** Tanggal awal jendela, dihitung mundur dari candle terakhir — bukan dari hari ini,
 *  supaya pasar yang sedang libur tidak menampilkan jendela yang separuh kosong. */
function rangeStart(lastDate: string, id: ChartRangeId): string {
  const range = CHART_RANGES.find((r) => r.id === id) ?? CHART_RANGES[6] // fallback to 1Y
  const d = new Date(`${lastDate}T00:00:00Z`)
  if ('days' in range) d.setUTCDate(d.getUTCDate() - range.days)
  else d.setUTCMonth(d.getUTCMonth() - range.months)
  return d.toISOString().slice(0, 10)
}

/**
 * Buang lilin yang akan ditolak lightweight-charts.
 *
 * Pustaka itu tidak memaafkan: satu waktu kembar, urutan mundur, atau harga
 * NaN/null membuat `setData` melempar — dan galat di dalam effect menjatuhkan
 * seluruh halaman, bukan cuma grafiknya. Waktu kembar diambil yang terakhir.
 */
function cleanSeries<T extends { open: number; high: number; low: number; close: number; volume: number }>(
  data: T[],
  key: (d: T) => string | number,
): T[] {
  const byTime = new Map<string | number, T>()
  for (const d of data) {
    if (![d.open, d.high, d.low, d.close].every((v) => typeof v === 'number' && Number.isFinite(v))) continue
    const volume = typeof d.volume === 'number' && Number.isFinite(d.volume) ? d.volume : 0
    byTime.set(key(d), { ...d, volume })
  }
  return [...byTime.values()].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

// ---------------------------------------------------------------------------
// Grafik harian (mode lama)
// ---------------------------------------------------------------------------

export function CandlestickChart({
  data,
  range = '1Y',
  livePrice = null,
}: {
  data: Candle[]
  range?: ChartRangeId
  livePrice?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLineRef = useRef<IPriceLine | null>(null)
  const sortedRef = useRef<Candle[]>([])
  const lastCandleRef = useRef<Candle | null>(null)
  const rangeRef = useRef(range)
  const livePriceRef = useRef(livePrice)
  useEffect(() => { livePriceRef.current = livePrice }, [livePrice])

  useEffect(() => {
    const container = containerRef.current
    if (!container || data.length === 0) return

    let disposed = false
    let cleanup: (() => void) | undefined

    // lightweight-charts menyentuh DOM, jadi dimuat hanya di browser.
    import('lightweight-charts').then(
      ({ createChart, ColorType, CandlestickSeries, HistogramSeries, LineStyle }) => {
        if (disposed) return

        const chart = createChart(container, {
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#6d7772',
            fontFamily:
              'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 10,
          },
          grid: {
            vertLines: { color: 'rgba(233, 236, 233, 0.03)' },
            horzLines: { color: 'rgba(233, 236, 233, 0.03)' },
          },
          crosshair: {
            vertLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
            horzLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
          },
          // Jarak minimum bawaan 0,5px per candle membuat sepuluh tahun (±3.600
          // candle) tidak muat di lebar grafik biasa — tab 10 tahun diam-diam
          // hanya menampilkan empat atau lima tahun terakhir.
          timeScale: { borderColor: '#2e3532', timeVisible: false, minBarSpacing: 0.05 },
          rightPriceScale: { borderColor: '#2e3532' },
          width: container.clientWidth,
          height: container.clientHeight,
        })

        const sorted = cleanSeries(data, (d) => d.date)

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
        })
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

        try {
          candleSeries.setData(
            sorted.map((d) => ({
              time: d.date,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
            })),
          )
          volumeSeries.setData(
            sorted.map((d) => ({
              time: d.date,
              value: d.volume,
              color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
            })),
          )
        } catch (err) {
          console.error('[chart] data harian ditolak', err)
        }

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries
        sortedRef.current = sorted
        lastCandleRef.current = sorted.length > 0 ? { ...sorted[sorted.length - 1] } : null

        // Buat price line jika livePrice sudah ada
        const currentLive = livePriceRef.current
        if (currentLive != null && lastCandleRef.current) {
          const isUp = currentLive >= lastCandleRef.current.open
          priceLineRef.current = candleSeries.createPriceLine({
            price: currentLive,
            color: isUp ? UP : DOWN,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'LIVE',
          })
        }

        try {
          applyRange(chart, sorted, rangeRef.current)
        } catch {}

        const observer = new ResizeObserver(() => {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        })
        observer.observe(container)

        cleanup = () => {
          observer.disconnect()
          chartRef.current = null
          candleSeriesRef.current = null
          volumeSeriesRef.current = null
          priceLineRef.current = null
          chart.remove()
        }
      },
    )

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [data])

  useEffect(() => {
    rangeRef.current = range
    if (!chartRef.current) return
    try {
      applyRange(chartRef.current, sortedRef.current, range)
    } catch {}
  }, [range])

  // Update lilin terakhir dan horizontal price line secara realtime tiap kali harga berdenyut
  useEffect(() => {
    if (livePrice == null || !candleSeriesRef.current || !lastCandleRef.current) return

    const last = lastCandleRef.current
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)

    try {
      candleSeriesRef.current.update({
        time: last.date,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      })
    } catch {}

    const isUp = livePrice >= last.open
    const color = isUp ? UP : DOWN
    if (priceLineRef.current) {
      priceLineRef.current.applyOptions({ price: livePrice, color })
    } else if (candleSeriesRef.current) {
      try {
        priceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: livePrice,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'LIVE',
        })
      } catch {}
    }
  }, [livePrice])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

function applyRange(chart: IChartApi, sorted: Candle[], range: ChartRangeId) {
  if (sorted.length === 0) return
  const first = sorted[0].date
  const last = sorted[sorted.length - 1].date
  const from = rangeStart(last, range)

  // Riwayat yang lebih pendek dari rentang yang diminta ditampilkan utuh.
  // Memaksa jendela sepuluh tahun pada koin yang baru terdaftar dua tahun
  // lalu hanya menghasilkan bidang kosong di sisi kiri.
  if (from <= first) {
    chart.timeScale().fitContent()
    return
  }
  chart.timeScale().setVisibleRange({ from, to: last })
}

// ---------------------------------------------------------------------------
// Grafik intraday (mode 1D realtime)
// ---------------------------------------------------------------------------

const WIB_TIME = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const WIB_DATE = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })

/** Detik UNIX → jam WIB; `withDate` untuk label pergantian hari dan crosshair. */
function formatWib(unix: number, withDate: boolean): string {
  const d = new Date(unix * 1000)
  const time = WIB_TIME.format(d).replace('.', ':')
  return withDate ? `${WIB_DATE.format(d)} ${time}` : time
}

/**
 * Batang volume, dengan lonjakan dipotong.
 *
 * Lelang penutupan BEI bisa membukukan puluhan kali volume lilin biasa dalam
 * satu lilin 5 menit, dan skala volume mengikuti batang tertinggi — sisanya
 * jadi garis rata. Batang dipotong di 4× median supaya pola volume sesi tetap
 * terbaca; lilin yang dipotong tetap yang tertinggi.
 */
function intradayVolumes(sorted: IntradayCandle[]) {
  const nonZero = sorted.map((d) => d.volume).filter((v) => v > 0).sort((a, b) => a - b)
  const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 0
  const cap = median > 0 ? median * 4 : Infinity
  return sorted.map((d) => ({
    time: d.time as UTCTimestamp,
    value: Math.min(d.volume, cap),
    color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
  }))
}

/** Lilin yang terlihat saat grafik dibuka: ±3 sesi BEI dalam lilin 15 menit. */
const INTRADAY_VISIBLE_BARS = 80

/**
 * Buka tampilan di lilin-lilin terakhir dengan lebar lilin wajar. Riwayat
 * intraday berisi puluhan hari; fitContent memampatkan semuanya jadi garis
 * tipis, jadi sisanya dibiarkan di luar layar untuk digeser ke kiri.
 */
function showRecent(chart: IChartApi, count: number) {
  const last = count - 1
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, last - INTRADAY_VISIBLE_BARS) - 0.5,
    to: last + 3,
  })
}

export function IntradayChart({
  data,
  livePrice = null,
}: {
  data: IntradayCandle[]
  livePrice?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLineRef = useRef<IPriceLine | null>(null)
  const sortedRef = useRef<IntradayCandle[]>([])
  const lastCandleRef = useRef<IntradayCandle | null>(null)
  const livePriceRef = useRef(livePrice)
  useEffect(() => { livePriceRef.current = livePrice }, [livePrice])

  // Inisialisasi chart hanya sekali saat container siap
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let cleanup: (() => void) | undefined

    import('lightweight-charts').then(
      ({ createChart, ColorType, CandlestickSeries, HistogramSeries, LineStyle }) => {
        if (disposed) return

        const chart = createChart(container, {
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#6d7772',
            fontFamily:
              'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 10,
          },
          grid: {
            vertLines: { color: 'rgba(233, 236, 233, 0.03)' },
            horzLines: { color: 'rgba(233, 236, 233, 0.03)' },
          },
          crosshair: {
            vertLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
            horzLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
          },
          // Bawaan pustaka ini UTC: sesi BEI 09:00–16:00 WIB tergambar sebagai
          // 02:00–09:00. Pembacanya di Indonesia, jadi semua jam ditulis WIB.
          localization: { timeFormatter: (t: number) => formatWib(t, true) },
          timeScale: {
            borderColor: '#2e3532',
            timeVisible: true,
            secondsVisible: false,
            minBarSpacing: 1,
            tickMarkFormatter: (t: number, type: number) => formatWib(t, type < 3),
          },
          rightPriceScale: { borderColor: '#2e3532' },
          width: container.clientWidth,
          height: container.clientHeight,
        })

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
        })

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries

        const sorted = cleanSeries(data, (d) => d.time)
        if (sorted.length > 0) {
          sortedRef.current = sorted
          lastCandleRef.current = { ...sorted[sorted.length - 1] }

          try {
            candleSeries.setData(
              sorted.map((d) => ({
                time: d.time as UTCTimestamp,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
              })),
            )
            volumeSeries.setData(intradayVolumes(sorted))
            showRecent(chart, sorted.length)
          } catch (err) {
            console.error('[chart] data intraday ditolak', err)
          }

          const currentLive = livePriceRef.current
          if (currentLive != null && lastCandleRef.current) {
            const isUp = currentLive >= lastCandleRef.current.open
            priceLineRef.current = candleSeries.createPriceLine({
              price: currentLive,
              color: isUp ? UP : DOWN,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'LIVE',
            })
          }
        }

        const observer = new ResizeObserver(() => {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        })
        observer.observe(container)

        cleanup = () => {
          observer.disconnect()
          chartRef.current = null
          candleSeriesRef.current = null
          volumeSeriesRef.current = null
          priceLineRef.current = null
          chart.remove()
        }
      },
    )

    return () => {
      disposed = true
      cleanup?.()
    }
  }, []) // inisialisasi satu kali

  // Perbarui data saat data baru masuk dari upstream tanpa menghancurkan chart
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return

    const sorted = cleanSeries(data, (d) => d.time)
    if (sorted.length === 0) return
    // Riwayat penuh baru tiba setelah lilin tunggal dari stream — sesuaikan ulang zoom
    const needsFit = sortedRef.current.length < 2 && sorted.length > 1
    sortedRef.current = sorted
    lastCandleRef.current = { ...sorted[sorted.length - 1] }

    try {
      candleSeriesRef.current.setData(
        sorted.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      )
      volumeSeriesRef.current?.setData(intradayVolumes(sorted))
      if (needsFit) showRecent(chartRef.current, sorted.length)
    } catch (err) {
      console.error('[chart] pembaruan intraday ditolak', err)
    }
  }, [data])

  // Update lilin 5m terakhir dan garis harga secara realtime
  useEffect(() => {
    if (livePrice == null || !candleSeriesRef.current || !lastCandleRef.current) return

    const last = lastCandleRef.current
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)

    try {
      candleSeriesRef.current.update({
        time: last.time as UTCTimestamp,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      })
    } catch {}

    const isUp = livePrice >= last.open
    const color = isUp ? UP : DOWN
    if (priceLineRef.current) {
      priceLineRef.current.applyOptions({ price: livePrice, color })
    } else if (candleSeriesRef.current) {
      try {
        priceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: livePrice,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'LIVE',
        })
      } catch {}
    }
  }, [livePrice])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
