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
}: {
  data: Candle[]
  range?: ChartRangeId
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const sortedRef = useRef<Candle[]>([])
  // Rentang terbaru disimpan di ref supaya grafik yang baru selesai dibuat
  // langsung memakai tab yang sedang aktif, tanpa ikut dibuat ulang tiap kali
  // tab berganti.
  const rangeRef = useRef(range)

  useEffect(() => {
    const container = containerRef.current
    if (!container || data.length === 0) return

    let disposed = false
    let cleanup: (() => void) | undefined

    // lightweight-charts menyentuh DOM, jadi dimuat hanya di browser.
    import('lightweight-charts').then(
      ({ createChart, ColorType, CandlestickSeries, HistogramSeries }) => {
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
        sortedRef.current = sorted
        applyRange(chart, sorted, rangeRef.current)

        const observer = new ResizeObserver(() => {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        })
        observer.observe(container)

        cleanup = () => {
          observer.disconnect()
          chartRef.current = null
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

export function IntradayChart({ data }: { data: IntradayCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || data.length === 0) return

    let disposed = false
    let cleanup: (() => void) | undefined

    import('lightweight-charts').then(
      ({ createChart, ColorType, CandlestickSeries, HistogramSeries }) => {
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

        const sorted = [...data].sort((a, b) => a.time - b.time)

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
            time: d.time as import('lightweight-charts').UTCTimestamp,
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
            time: d.time as import('lightweight-charts').UTCTimestamp,
            value: d.volume,
            color: d.close >= d.open ? UP_SOFT : DOWN_SOFT,
          })),
        )

        chart.timeScale().fitContent()
        chartRef.current = chart

        const observer = new ResizeObserver(() => {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        })
        observer.observe(container)

        cleanup = () => {
          observer.disconnect()
          chartRef.current = null
          chart.remove()
        }
      },
    )

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [data])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
