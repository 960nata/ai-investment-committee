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

// Warna diredam dengan sengaja, dan sama dengan token status di seluruh
// antarmuka. Hijau menyala dan merah menyala membuat pembacanya merasa sedang
// menang atau kalah, padahal yang digambar cuma harga penutupan.
const UP = '#4f9d8e'
const DOWN = '#b3564e'
const UP_SOFT = 'rgba(79, 157, 142, 0.28)'
const DOWN_SOFT = 'rgba(179, 86, 78, 0.28)'

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
          timeScale: { borderColor: '#2e3532', timeVisible: false },
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
