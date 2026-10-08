'use client'

/**
 * Grafik trading simulator.
 *
 * Gaya dan warnanya sengaja kembar dengan grafik terminal
 * (`components/candlestick-chart.tsx`) supaya simulator terasa bagian dari
 * aplikasi yang sama. Bedanya: timeframe bisa diganti (1m–1w), kripto
 * bergerak per detik lewat WebSocket kline Binance, dan posisi terbuka
 * digambar sebagai garis harga — masuk, stop loss, dan target.
 */

import { useEffect, useRef, useState } from 'react'
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ChartInterval } from '@/lib/simulator/config'
import s from './simulator.module.css'

const UP = '#4f9d8e'
const DOWN = '#b3564e'
const UP_SOFT = 'rgba(79, 157, 142, 0.28)'
const DOWN_SOFT = 'rgba(179, 86, 78, 0.28)'

export interface ChartLine {
  price: number
  color: string
  title: string
  dashed?: boolean
}

interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const WIB_TIME = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const WIB_DATE = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })
const WIB_YEAR = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', month: 'short', year: '2-digit' })

function formatWib(unix: number, mode: 'time' | 'date' | 'full' | 'month'): string {
  const d = new Date(unix * 1000)
  if (mode === 'month') return WIB_YEAR.format(d)
  if (mode === 'date') return WIB_DATE.format(d)
  const time = WIB_TIME.format(d).replace('.', ':')
  return mode === 'full' ? `${WIB_DATE.format(d)} ${time}` : time
}

const INTRADAY = new Set<ChartInterval>(['1m', '5m', '15m', '1h', '4h'])

export function formatPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const digits = v >= 1000 ? 2 : v >= 1 ? 4 : 6
  return v.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })
}

function clean(bars: Bar[]): Bar[] {
  const byTime = new Map<number, Bar>()
  for (const b of bars) {
    if (![b.open, b.high, b.low, b.close].every((v) => typeof v === 'number' && Number.isFinite(v))) continue
    byTime.set(Math.floor(b.time / 1000), { ...b, time: Math.floor(b.time / 1000), volume: Number.isFinite(b.volume) ? b.volume : 0 })
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

const toCandle = (b: Bar) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })
const toVolume = (b: Bar) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? UP_SOFT : DOWN_SOFT })

export function TradeChart({
  symbol,
  interval,
  lines,
  onPrice,
}: {
  symbol: string
  interval: ChartInterval
  lines: ChartLine[]
  onPrice?: (price: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const lastRef = useRef<Bar | null>(null)
  const onPriceRef = useRef(onPrice)
  const linesRef = useRef(lines)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<'loading' | 'live' | 'poll' | 'error'>('loading')
  const [legend, setLegend] = useState<Bar | null>(null)
  const [lastBar, setLastBar] = useState<Bar | null>(null)

  useEffect(() => {
    onPriceRef.current = onPrice
  }, [onPrice])

  // Pustaka grafik dimuat sekali; simbol dan timeframe hanya mengganti datanya.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let cleanup: (() => void) | undefined

    import('lightweight-charts').then(({ createChart, ColorType, CandlestickSeries, HistogramSeries, CrosshairMode }) => {
      if (disposed) return
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6d7772',
          fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(233, 236, 233, 0.03)' },
          horzLines: { color: 'rgba(233, 236, 233, 0.03)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
          horzLine: { color: 'rgba(224, 161, 60, 0.35)', labelBackgroundColor: '#e0a13c' },
        },
        localization: { timeFormatter: (t: number) => formatWib(t, 'full') },
        timeScale: { borderColor: '#2e3532', timeVisible: true, secondsVisible: false, rightOffset: 6, minBarSpacing: 0.5 },
        rightPriceScale: { borderColor: '#2e3532', scaleMargins: { top: 0.08, bottom: 0.22 } },
        width: container.clientWidth,
        height: container.clientHeight,
      })
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
      })
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

      chart.subscribeCrosshairMove((param) => {
        const d = param.seriesData.get(candles) as { open: number; high: number; low: number; close: number } | undefined
        if (d && typeof param.time === 'number') {
          const v = param.seriesData.get(volume) as { value: number } | undefined
          setLegend({ time: param.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: v?.value ?? 0 })
        } else setLegend(null)
      })

      const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }))
      observer.observe(container)

      chartRef.current = chart
      candleRef.current = candles
      volumeRef.current = volume
      setReady(true)
      cleanup = () => {
        observer.disconnect()
        chartRef.current = null
        candleRef.current = null
        volumeRef.current = null
        priceLinesRef.current = []
        chart.remove()
      }
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  // Riwayat + aliran realtime untuk simbol dan timeframe yang dipilih.
  useEffect(() => {
    if (!ready) return
    const chart = chartRef.current
    const candles = candleRef.current
    const volume = volumeRef.current
    if (!chart || !candles || !volume) return

    let cancelled = false
    let ws: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    const intraday = INTRADAY.has(interval)
    const isCrypto = symbol.endsWith('USDT')

    chart.applyOptions({
      timeScale: {
        timeVisible: intraday,
        tickMarkFormatter: (t: number, type: number) =>
          intraday ? formatWib(t, type < 3 ? 'date' : 'time') : formatWib(t, type < 2 ? 'month' : 'date'),
      },
    })

    const push = (bar: Bar) => {
      const last = lastRef.current
      if (last && bar.time < last.time) return
      lastRef.current = bar
      setLastBar(bar)
      try {
        candles.update(toCandle(bar))
        volume.update(toVolume(bar))
      } catch {
        // lilin di luar urutan dari aliran yang tersambung ulang; abaikan
      }
      onPriceRef.current?.(bar.close)
    }

    const load = async (initial: boolean) => {
      try {
        const res = await fetch(`/api/v1/simulator/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? 'gagal')
        if (cancelled) return
        const bars = clean(body.data as Bar[])
        if (bars.length === 0) throw new Error('kosong')
        candles.setData(bars.map(toCandle))
        volume.setData(bars.map(toVolume))
        lastRef.current = bars[bars.length - 1]
        setLastBar(bars[bars.length - 1])
        onPriceRef.current?.(bars[bars.length - 1].close)
        if (initial) {
          setStatus('poll')
          const last = bars.length - 1
          chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, last - 120), to: last + 6 })
        }
      } catch {
        if (!cancelled && initial) setStatus('error')
      }
    }

    const startPolling = () => {
      if (poll || cancelled) return
      setStatus('poll')
      poll = setInterval(() => {
        if (document.visibilityState === 'visible') void load(false)
      }, isCrypto ? 3_000 : 10_000)
    }

    setStatus('loading')
    lastRef.current = null
    void load(true).then(() => {
      if (cancelled) return
      if (!isCrypto) {
        startPolling()
        return
      }
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`)
        ws.onopen = () => !cancelled && setStatus('live')
        ws.onmessage = (ev) => {
          const k = JSON.parse(ev.data)?.k
          if (!k) return
          push({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })
        }
        // Sebagian ISP Indonesia memblokir stream.binance.com; jatuh ke polling.
        ws.onerror = () => startPolling()
        ws.onclose = () => !cancelled && startPolling()
      } catch {
        startPolling()
      }
    })

    return () => {
      cancelled = true
      if (ws) {
        ws.onclose = null
        ws.close()
      }
      if (poll) clearInterval(poll)
    }
  }, [ready, symbol, interval])

  // Garis posisi: dibangun ulang tiap kali daftar garis berubah.
  useEffect(() => {
    linesRef.current = lines
    const candles = candleRef.current
    if (!ready || !candles) return
    for (const l of priceLinesRef.current) {
      try {
        candles.removePriceLine(l)
      } catch {}
    }
    priceLinesRef.current = lines.map((l) =>
      candles.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.dashed ? 2 : 0,
        axisLabelVisible: true,
        title: l.title,
      }),
    )
  }, [ready, lines])

  const shown = legend ?? lastBar
  return (
    <div className={s.chartBox}>
      <div className={s.chartLegend}>
        {shown && (
          <>
            <span>O <b>{formatPrice(shown.open)}</b></span>
            <span>H <b>{formatPrice(shown.high)}</b></span>
            <span>L <b>{formatPrice(shown.low)}</b></span>
            <span>
              C <b className={shown.close >= shown.open ? s.up : s.down}>{formatPrice(shown.close)}</b>
            </span>
          </>
        )}
        <span className={s.chartStatus}>
          {status === 'live' ? '● LIVE' : status === 'poll' ? '● realtime' : status === 'loading' ? 'memuat…' : 'data tidak tersedia'}
        </span>
      </div>
      <div ref={containerRef} className={s.chartCanvas} />
    </div>
  )
}
