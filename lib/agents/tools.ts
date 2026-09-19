/**
 * Perkakas data pasar
 *
 * Inilah satu-satunya sumber angka bagi komite. Model bahasa tidak pernah
 * diminta menghitung imbal hasil, volatilitas, atau harga terakhir — ia hanya
 * menerima hasil fungsi di sini.
 *
 * Alasannya bukan soal ketelitian aritmetika saja. Model yang boleh menyebut
 * angka dari ingatannya akan menyebut harga yang masuk akal untuk saham yang
 * tidak ada datanya, dan tesis yang dibangun di atasnya terlihat persis seperti
 * tesis yang benar. Memisahkan fakta dari penalaran membuat kesalahan seperti
 * itu muncul sebagai "data tidak cukup", bukan sebagai keyakinan palsu.
 *
 * Modul ini yang menyentuh database; perhitungannya ada di `facts.ts` supaya
 * bisa diuji tanpa koneksi apa pun.
 */

import { getCandles, getInstrumentBySymbol } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { MIN_CANDLES, buildFacts, type MarketFacts, type PricePoint } from './facts'

export * from './facts'

/** Hari kalender riwayat yang ditarik untuk tiap analisis. */
const LOOKBACK_DAYS = 400

export class InsufficientDataError extends Error {
  constructor(symbol: string, detail: string) {
    super(`Data ${symbol} tidak cukup: ${detail}`)
    this.name = 'InsufficientDataError'
  }
}

/**
 * Kumpulkan seluruh fakta satu instrumen.
 *
 * Melempar `InsufficientDataError` alih-alih mengembalikan angka nol saat data
 * kurang. Nol yang dikirim ke model akan dibaca sebagai fakta.
 */
export async function gatherFacts(
  market: MarketCode,
  symbol: string,
  now: Date = new Date(),
): Promise<MarketFacts> {
  const instrument = await getInstrumentBySymbol(market, symbol)
  if (!instrument) {
    throw new InsufficientDataError(symbol, `belum terdaftar di pasar ${market}`)
  }

  const from = new Date(now)
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS)

  const rows = await getCandles(instrument.id, isoDate(from), isoDate(now))

  if (rows.length < MIN_CANDLES) {
    throw new InsufficientDataError(
      symbol,
      `baru ${rows.length} hari tersimpan, minimum ${MIN_CANDLES}`,
    )
  }

  // Nilai `numeric` keluar dari driver sebagai string. Konversi ke number hanya
  // terjadi di sini — lapisan analisis, bukan lapisan penyimpanan.
  const series: PricePoint[] = rows.map((r) => ({
    date: r.date,
    close: Number(r.close),
    volume: Number(r.volume),
  }))

  return buildFacts(instrument, series, now)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
