/**
 * Playbook binary yang sudah diuji — satu-satunya pemicu entry binary.
 *
 * Kenapa ada berkas ini: skor radar (momentum + bandar) diuji ulang pada
 * candle 1 menit Binance, 10 koin, 7 hari (30 Sep–8 Okt 2026), dan hanya
 * menang ±50% — lempar koin. Binary dengan bayaran 85% butuh ≥ 54,1% hanya
 * untuk impas, jadi mengikuti skor radar dijamin pelan-pelan minus.
 *
 * Yang lolos uji justru kebalikannya: harga yang "kelewat jual/beli" dalam
 * hitungan menit cenderung memantul.
 *
 *   RSI14 (1m) < 30 → NAIK, RSI14 (1m) > 70 → TURUN,
 *   volume relatif < 2× (bukan lonjakan berita/likuidasi), kedaluwarsa 10 menit.
 *
 *   Uji 1 (30 Sep–8 Okt, ambang 25/75): 58,5% menang, tetapi hanya ±6 sinyal
 *   per jam di sepuluh koin — pasar tenang bisa sejam tanpa satu pun trade.
 *   Uji 2 (1–8 Okt, masuk telat 1 menit seperti sidang desk): ambang 30/70
 *   menang 56,1% (2.928 kejadian; paruh pertama 56,5%, paruh kedua 55,8%)
 *   dengan sinyal ±3× lebih sering, dan laba harian totalnya tertinggi.
 *   Ambang 33/67 sudah terlalu longgar (paruh kedua 53,9% — di bawah impas).
 *
 * Itu keunggulan kecil: ±6% laba per trade secara rata-rata, dengan kekalahan
 * beruntun yang tetap wajar terjadi. Karena itu stake dibatasi kecil (setengah
 * Kelly ≈ 3–4% kas) dan playbook dihentikan sendiri bila hasil nyatanya jatuh
 * di bawah impas.
 */

import type { SignalReport } from './signals'

export const PLAYBOOK = {
  id: 'rsi-ekstrem-10m',
  name: 'Pantulan RSI ekstrem',
  rsiLow: 30,
  rsiHigh: 70,
  maxRelVolume: 2,
  expirySeconds: 600,
  backtestWinRate: 56.1,
  backtestSamples: 2928,
  breakevenWinRate: 54.1,
  /** Persen kas maksimum per trade binary (±setengah Kelly untuk p=0,561, b=0,85 ≈ 2,2%). */
  maxStakePct: 3,
  /** Jumlah trade nyata minimum sebelum rem otomatis boleh menilai. */
  brakeMinTrades: 20,
  /** Di bawah ini (dari 30 trade terakhir) playbook berhenti sendiri. */
  brakeWinRate: 50,
} as const

export interface PlaybookSetup {
  symbol: string
  direction: 'up' | 'down'
  rsi: number
  relVolume: number | null
  reason: string
}

/** Setup aktif pada laporan sinyal 1 menit, atau null. */
export function binarySetup(sig: SignalReport): PlaybookSetup | null {
  if (sig.timeframe !== '1m' || sig.rsi14 === null) return null
  if (sig.relVolume !== null && sig.relVolume >= PLAYBOOK.maxRelVolume) return null
  const direction = sig.rsi14 < PLAYBOOK.rsiLow ? 'up' : sig.rsi14 > PLAYBOOK.rsiHigh ? 'down' : null
  if (!direction) return null
  return {
    symbol: sig.symbol,
    direction,
    rsi: sig.rsi14,
    relVolume: sig.relVolume,
    reason:
      direction === 'up'
        ? `RSI 1m ${sig.rsi14} < ${PLAYBOOK.rsiLow}: kelewat jual, peluang pantul naik`
        : `RSI 1m ${sig.rsi14} > ${PLAYBOOK.rsiHigh}: kelewat beli, peluang koreksi turun`,
  }
}

export interface PlaybookRecord {
  trades: number
  wins: number
  winRate: number | null
  paused: boolean
}

/** Rem otomatis: hasil nyata playbook di dompet ini. */
export function playbookRecord(closed: { side: string; pnlUsd: number; openedBy: string; note: string | null }[]): PlaybookRecord {
  const mine = closed.filter((c) => c.openedBy === 'ai' && (c.side === 'up' || c.side === 'down') && c.note?.includes('[playbook]')).slice(0, 30)
  const decided = mine.filter((c) => c.pnlUsd !== 0)
  const wins = decided.filter((c) => c.pnlUsd > 0).length
  const winRate = decided.length > 0 ? (wins / decided.length) * 100 : null
  return {
    trades: decided.length,
    wins,
    winRate,
    paused: decided.length >= PLAYBOOK.brakeMinTrades && winRate !== null && winRate < PLAYBOOK.brakeWinRate,
  }
}
