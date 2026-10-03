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

import { getCandles, getFundamentalsAsOf, getInstrumentBySymbol, getLatestFeature, getLatestScoresForSymbol } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { fundamentalsApply, MODEL_VERSION } from '@/lib/scoring/weights'
import { FUNDAMENTAL_FACTS, MIN_CANDLES, buildFacts, type MarketFacts, type PricePoint } from './facts'

export * from './facts'

/**
 * Hari kalender riwayat yang ditarik untuk tiap analisis — lima tahun plus
 * sedikit ruang supaya imbal hasil 5 tahun masih punya candle pembanding.
 * Database menyimpan riwayat sejak 2015; jendela 400 hari membuat komite
 * menilai tren "jangka panjang" dari satu tahun saja.
 */
const LOOKBACK_DAYS = 5 * 365 + 10

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
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
  }))

  const facts = buildFacts(instrument, series, now)

  // Fakta non-harga. Pelengkap: kegagalannya tidak boleh membatalkan rapat,
  // cukup tercatat sebagai peringatan supaya komite tahu apa yang tidak ada.
  const [feature, scores, reports] = await Promise.all([
    getLatestFeature(instrument.id, FEATURE_SET_VERSION).catch(() => null),
    getLatestScoresForSymbol(symbol, MODEL_VERSION).catch(() => null),
    fundamentalsApply(instrument.assetClass)
      ? getFundamentalsAsOf(instrument.id, facts.asOf, 1).catch(() => null)
      : Promise.resolve([]),
  ])

  if (!fundamentalsApply(instrument.assetClass)) {
    facts.fundamentals = null
    facts.financialReport = null
  } else if (feature) {
    const values = Object.fromEntries(
      FUNDAMENTAL_FACTS.map((d) => [d.key, (feature.values as Record<string, number | null>)[d.key] ?? null]),
    )
    facts.fundamentals = { asOf: feature.date, values }
    if (Object.values(values).every((v) => v === null)) {
      facts.warnings.push('Laporan keuangan belum tersedia untuk emiten ini.')
    }
  } else {
    facts.warnings.push('Fitur fundamental belum dihitung untuk emiten ini.')
  }

  if (fundamentalsApply(instrument.assetClass)) {
    const report = reports?.[0]
    facts.financialReport = report
      ? {
          period: report.period,
          periodEnd: report.periodEnd,
          reportedAt: report.reportedAt,
          sourceId: report.sourceId,
          accession: report.sourceAccession,
          currency: report.currency,
          completeness: report.completeness,
          items: report.items,
          missingItems: report.missingItems,
        }
      : null
    if (reports === null) facts.warnings.push('Basis data laporan keuangan gagal dibaca untuk analisis ini.')
    else if (!report) facts.warnings.push('Belum ada laporan keuangan yang terbit sebelum candle terakhir.')
    else if (Math.floor((Date.parse(facts.asOf) - Date.parse(report.reportedAt)) / 86_400_000) > 550) {
      facts.warnings.push(`Laporan keuangan terakhir sudah lama: terbit ${report.reportedAt}.`)
    }
  }

  facts.systemScores = (scores?.scores ?? []).map((s) => ({
    horizon: s.horizon,
    asOf: s.date,
    score: s.score,
    confidence: s.confidence,
  }))

  return facts
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
