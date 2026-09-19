'use client'

/**
 * Grafik lilin.
 *
 * Yang digambar hanya candle tertutup dari database. Harga realtime tidak masuk
 * ke sini dan tidak akan pernah masuk ke perhitungan skor: skor harus dihitung
 * dari data yang persis sama dengan yang dipakai backtest, kalau tidak angkanya
 * tidak bisa dibandingkan dengan apa pun.
 */

import { useEffect, useRef } from 'react'

export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const UP = '#10b981'
const DOWN = '#ef4444'

export function CandlestickChart({ data }: { data: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

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
            textColor: '#94a3b8',
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
          },
          crosshair: {
            vertLine: { color: 'rgba(99, 102, 241, 0.3)', labelBackgroundColor: '#6366f1' },
            horzLine: { color: 'rgba(99, 102, 241, 0.3)', labelBackgroundColor: '#6366f1' },
          },
          timeScale: { borderColor: 'rgba(255, 255, 255, 0.06)', timeVisible: false },
          rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.06)' },
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
            color: d.close >= d.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          })),
        )

        chart.timeScale().fitContent()

        const observer = new ResizeObserver(() => {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        })
        observer.observe(container)

        cleanup = () => {
          observer.disconnect()
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
