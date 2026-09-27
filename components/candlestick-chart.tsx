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
import type { IChartApi } from 'lightweight-charts'
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
  const candleSeriesRef = useRef<any>(null)
  const volumeSeriesRef = useRef<any>(null)
  const priceLineRef = useRef<any>(null)
  const sortedRef = useRef<Candle[]>([])
  const lastCandleRef = useRef<Candle | null>(null)
  const rangeRef = useRef(range)
  const livePriceRef = useRef(livePrice)
  livePriceRef.current = livePrice

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

        const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
        })
        candleSeries.setData(
          sorted.map((d) => ({
            time: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          })),
        )

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
        volumeSeries.setData(
          sorted.map((d) => ({
            time: d.date,
            value: d.volume,
            color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
          })),
        )

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

        applyRange(chart, sorted, rangeRef.current)

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
    if (chartRef.current) applyRange(chartRef.current, sortedRef.current, range)
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

export function IntradayChart({
  data,
  livePrice = null,
}: {
  data: IntradayCandle[]
  livePrice?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<any>(null)
  const volumeSeriesRef = useRef<any>(null)
  const priceLineRef = useRef<any>(null)
  const sortedRef = useRef<IntradayCandle[]>([])
  const lastCandleRef = useRef<IntradayCandle | null>(null)
  const livePriceRef = useRef(livePrice)
  livePriceRef.current = livePrice

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
          timeScale: {
            borderColor: '#2e3532',
            timeVisible: true,
            secondsVisible: false,
            minBarSpacing: 1,
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

        if (data.length > 0) {
          const sorted = [...data].sort((a, b) => a.time - b.time)
          sortedRef.current = sorted
          lastCandleRef.current = { ...sorted[sorted.length - 1] }

          candleSeries.setData(
            sorted.map((d) => ({
              time: d.time as any,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
            })),
          )
          volumeSeries.setData(
            sorted.map((d) => ({
              time: d.time as any,
              value: d.volume,
              color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
            })),
          )
          chart.timeScale().fitContent()

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
    if (!chartRef.current || !candleSeriesRef.current || data.length === 0) return

    const sorted = [...data].sort((a, b) => a.time - b.time)
    // Riwayat penuh baru tiba setelah lilin tunggal dari stream — sesuaikan ulang zoom
    const needsFit = sortedRef.current.length < 2 && sorted.length > 1
    sortedRef.current = sorted
    lastCandleRef.current = { ...sorted[sorted.length - 1] }

    candleSeriesRef.current.setData(
      sorted.map((d) => ({
        time: d.time as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    )
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        sorted.map((d) => ({
          time: d.time as any,
          value: d.volume,
          color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
        })),
      )
    }
    if (needsFit) chartRef.current.timeScale().fitContent()
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
        time: last.time as any,
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
