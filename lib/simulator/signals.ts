/**
 * Radar sinyal dan pelacak bandar untuk desk simulator.
 *
 * Semua angka dihitung di sini secara deterministik, lalu diserahkan ke agen
 * sebagai blok fakta — sama seperti komite. Model bahasa tidak diminta
 * menghitung RSI atau membaca buku order; ia diminta menimbang hasilnya.
 *
 * "Bandar" di sini berarti jejak pemain besar yang bisa dibaca dari data
 * publik, bukan tuduhan manipulasi:
 *   - divergensi OBV / garis akumulasi-distribusi terhadap harga
 *     (volume masuk tapi harga ditahan = akumulasi senyap),
 *   - lonjakan volume dengan sumbu panjang (penyerapan di satu sisi),
 *   - ketimpangan buku order dan dinding besar (kripto, Binance),
 *   - perubahan porsi kepemilikan asing bulanan (IDX, KSEI).
 * Tiap temuan disertai angkanya supaya agen dan pengguna bisa memeriksanya.
 */

import {
  accumulationDistribution,
  atr,
  bollinger,
  ema,
  macd,
  obv,
  relativeVolume,
  rsi,
} from '@/lib/features/indicators'
import type { Bar, OrderBookSnapshot } from './prices'

export interface BandarReading {
  /** −100 (distribusi kuat) .. 100 (akumulasi kuat). */
  score: number
  label: 'akumulasi' | 'distribusi' | 'netral'
  evidence: string[]
}

export interface SignalReport {
  market: string
  symbol: string
  name: string
  timeframe: string
  price: number
  bars: number
  changePct: number | null
  trend: 'naik' | 'turun' | 'menyamping'
  rsi14: number | null
  macdHist: number | null
  atrPct: number | null
  bollingerPctB: number | null
  relVolume: number | null
  bandar: BandarReading
  /** −100..100, gabungan teknikal dan bandar. Positif = condong naik. */
  score: number
  bias: 'naik' | 'turun' | 'netral'
  suggestedStopPct: number | null
  suggestedTakePct: number | null
  /** Konteks tambahan yang tidak berasal dari candle (skor sistem, KSEI, dsb.). */
  context: string[]
}

export interface SignalExtras {
  orderBook?: OrderBookSnapshot | null
  /** Perubahan porsi asing 1 dan 3 bulan, dalam poin persen (IDX). */
  foreignChange1m?: number | null
  foreignChange3m?: number | null
  context?: string[]
}

const last = <T>(xs: (T | null)[]): T | null => {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null && xs[i] !== undefined) return xs[i]
  return null
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number | null, d = 2) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

export function readBandar(bars: Bar[], extras: SignalExtras = {}): BandarReading {
  const evidence: string[] = []
  let score = 0
  const n = bars.length
  const L = Math.min(20, n - 1)

  if (L >= 5) {
    const close = bars.map((b) => b.close)
    const high = bars.map((b) => b.high)
    const low = bars.map((b) => b.low)
    const volume = bars.map((b) => b.volume)
    const volSum = volume.slice(n - L).reduce((s, v) => s + v, 0)

    if (volSum > 0) {
      const o = obv(close, volume)
      const ad = accumulationDistribution(high, low, close, volume)
      const obvNorm = ((o[n - 1] ?? 0) - (o[n - 1 - L] ?? 0)) / volSum
      const adNorm = ((ad[n - 1] ?? 0) - (ad[n - 1 - L] ?? 0)) / volSum
      const priceChg = (close[n - 1] / close[n - 1 - L] - 1) * 100
      const atrNow = last(atr(high, low, close, 14))
      const flatBand = atrNow ? (atrNow / close[n - 1]) * 100 * 1.5 : 1.5

      const flow = (obvNorm + adNorm) / 2
      if (flow > 0.12 && priceChg <= flatBand) {
        score += 40
        evidence.push(
          `Akumulasi senyap: arus volume bersih ${pct(flow * 100)} dari volume ${L} bar, harga hanya ${pct(priceChg)}.`,
        )
      } else if (flow < -0.12 && priceChg >= -flatBand) {
        score -= 40
        evidence.push(
          `Distribusi: arus volume bersih ${pct(flow * 100)} dari volume ${L} bar, harga ditahan di ${pct(priceChg)}.`,
        )
      } else if (Math.abs(flow) > 0.12) {
        score += flow > 0 ? 15 : -15
        evidence.push(`Arus volume searah harga: ${pct(flow * 100)} volume bersih, harga ${pct(priceChg)}.`)
      }

      // Lonjakan volume 10 bar terakhir: arah badan dan sumbu memberi tahu siapa yang menyerap.
      const rv = relativeVolume(volume, 20)
      let absorbBuy = 0
      let absorbSell = 0
      let spikeUp = 0
      let spikeDown = 0
      for (let i = Math.max(0, n - 10); i < n; i++) {
        const r = rv[i]
        if (r === null || r < 2.2) continue
        const b = bars[i]
        const range = b.high - b.low
        if (range <= 0) continue
        const body = Math.abs(b.close - b.open)
        const lowerWick = Math.min(b.open, b.close) - b.low
        const upperWick = b.high - Math.max(b.open, b.close)
        if (body / range < 0.35) {
          if (lowerWick > upperWick * 1.5) absorbBuy++
          else if (upperWick > lowerWick * 1.5) absorbSell++
        } else if (b.close > b.open) spikeUp++
        else spikeDown++
      }
      if (absorbBuy > 0) {
        score += 12 * absorbBuy
        evidence.push(`${absorbBuy} lonjakan volume (>2,2× rata-rata) bersumbu bawah panjang — tekanan jual diserap.`)
      }
      if (absorbSell > 0) {
        score -= 12 * absorbSell
        evidence.push(`${absorbSell} lonjakan volume bersumbu atas panjang — kenaikan dijual ke pembeli.`)
      }
      if (spikeUp + spikeDown > 0) {
        score += 8 * (spikeUp - spikeDown)
        evidence.push(`Bar volume besar: ${spikeUp} hijau vs ${spikeDown} merah dalam 10 bar terakhir.`)
      }
    }
  }

  const ob = extras.orderBook
  if (ob) {
    score += ob.imbalance * 35
    evidence.push(
      `Buku order ±1%: bid $${Math.round(ob.bidUsd).toLocaleString('en-US')} vs ask $${Math.round(ob.askUsd).toLocaleString('en-US')} (ketimpangan ${pct(ob.imbalance * 100)}).`,
    )
    if (ob.biggestWall && ob.biggestWall.multiple >= 6) {
      score += ob.biggestWall.side === 'bid' ? 8 : -8
      evidence.push(
        `Dinding ${ob.biggestWall.side === 'bid' ? 'beli' : 'jual'} $${Math.round(ob.biggestWall.usd).toLocaleString('en-US')} di ${ob.biggestWall.price} (${ob.biggestWall.multiple.toFixed(1)}× rata-rata level).`,
      )
    }
  }

  if (extras.foreignChange1m !== null && extras.foreignChange1m !== undefined) {
    const f1 = extras.foreignChange1m
    if (Math.abs(f1) >= 0.3) {
      score += clamp(f1 * 20, -30, 30)
      evidence.push(`KSEI: porsi asing ${f1 >= 0 ? 'naik' : 'turun'} ${Math.abs(f1).toFixed(2)} poin dalam 1 bulan.`)
    }
    const f3 = extras.foreignChange3m
    if (f3 !== null && f3 !== undefined && Math.abs(f3) >= 0.5) {
      evidence.push(`KSEI: porsi asing ${f3 >= 0 ? '+' : ''}${f3.toFixed(2)} poin dalam 3 bulan.`)
    }
  }

  score = Math.round(clamp(score, -100, 100))
  if (evidence.length === 0) evidence.push('Tidak ada jejak pemain besar yang menonjol.')
  return { score, label: score >= 25 ? 'akumulasi' : score <= -25 ? 'distribusi' : 'netral', evidence }
}

export function computeSignal(
  meta: { market: string; symbol: string; name: string; timeframe: string },
  bars: Bar[],
  extras: SignalExtras = {},
): SignalReport | null {
  if (bars.length < 30) return null
  const close = bars.map((b) => b.close)
  const high = bars.map((b) => b.high)
  const low = bars.map((b) => b.low)
  const n = close.length
  const price = close[n - 1]

  const emaFast = last(ema(close, 9))
  const emaSlow = last(ema(close, 26))
  const r = last(rsi(close, 14))
  const m = macd(close)
  const hist = last(m.histogram)
  const atrNow = last(atr(high, low, close, 14))
  const atrPct = atrNow ? (atrNow / price) * 100 : null
  const bb = last(bollinger(close, 20, 2).percentB)
  // Bar terakhir yang masih berjalan sering bervolume nol di Yahoo; pakai bar utuh terakhir.
  const rvSeries = relativeVolume(bars.map((b) => b.volume), 20)
  const rv = bars[n - 1].volume > 0 ? last(rvSeries) : (rvSeries[n - 2] ?? null)
  const roc = n > 10 ? (price / close[n - 11] - 1) * 100 : null

  let trend: SignalReport['trend'] = 'menyamping'
  if (emaFast !== null && emaSlow !== null) {
    const gap = ((emaFast - emaSlow) / emaSlow) * 100
    const band = atrPct ? atrPct * 0.25 : 0.1
    if (gap > band) trend = 'naik'
    else if (gap < -band) trend = 'turun'
  }

  const bandar = readBandar(bars, extras)

  let score = 0
  score += trend === 'naik' ? 25 : trend === 'turun' ? -25 : 0
  if (hist !== null) score += hist > 0 ? 15 : -15
  if (roc !== null) score += clamp(roc * 4, -15, 15)
  if (r !== null) {
    if (r > 75) score -= 12
    else if (r < 25) score += 12
  }
  if (bb !== null) {
    if (bb > 1) score -= 8
    else if (bb < 0) score += 8
  }
  score += bandar.score * 0.3
  score = Math.round(clamp(score, -100, 100))

  const stop = atrPct ? clamp(atrPct * 1.5, 0.3, 25) : null
  return {
    ...meta,
    price: Number(price.toPrecision(8)),
    bars: n,
    changePct: round(roc),
    trend,
    rsi14: round(r, 1),
    macdHist: round(hist, 6),
    atrPct: round(atrPct),
    bollingerPctB: round(bb),
    relVolume: round(rv),
    bandar,
    score,
    bias: score >= 20 ? 'naik' : score <= -20 ? 'turun' : 'netral',
    suggestedStopPct: round(stop),
    suggestedTakePct: round(stop ? stop * 2 : null),
    context: extras.context ?? [],
  }
}

/** Satu baris ringkas per instrumen untuk blok FAKTA agen. */
export function signalToPrompt(s: SignalReport): string {
  return [
    `### ${s.market}:${s.symbol} (${s.name}) — ${s.timeframe}, ${s.bars} bar`,
    `Harga ${s.price} | perubahan 10 bar ${s.changePct ?? 'tidak tersedia'}% | tren ${s.trend} | RSI14 ${s.rsi14 ?? '-'} | MACD hist ${s.macdHist ?? '-'} | ATR ${s.atrPct ?? '-'}% | %B ${s.bollingerPctB ?? '-'} | volume relatif ${s.relVolume ?? '-'}x`,
    `Skor radar ${s.score} (${s.bias}) | stop saran ${s.suggestedStopPct ?? '-'}% | target saran ${s.suggestedTakePct ?? '-'}%`,
    `Bandar: ${s.bandar.label} (${s.bandar.score}) — ${s.bandar.evidence.join(' ')}`,
    ...s.context.map((c) => `Konteks: ${c}`),
  ].join('\n')
}
