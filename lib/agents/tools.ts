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

import { latestMacro, macroRange } from '@/lib/db/macro-queries'
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

  if (instrument.assetClass === 'mata_uang' || instrument.assetClass === 'obligasi') {
    facts.macroContext = await macroContextFor(instrument.assetClass, symbol, facts.asOf).catch(() => null)
    if (!facts.macroContext) facts.warnings.push('Data makro (suku bunga / imbal hasil) gagal dibaca untuk analisis ini.')
  }

  facts.systemScores = (scores?.scores ?? []).map((s) => ({
    horizon: s.horizon,
    asOf: s.date,
    score: s.score,
    confidence: s.confidence,
  }))

  return facts
}

/** Deret suku bunga jangka pendek per mata uang, untuk selisih bunga valas. */
const POLICY_RATE: Record<string, { id: string; label: string }> = {
  USD: { id: 'FRED:DFF', label: 'Fed Funds efektif' },
  IDR: { id: 'FRED:IRSTCI01IDM156N', label: 'antarbank Indonesia' },
  EUR: { id: 'FRED:IRSTCI01EZM156N', label: 'antarbank Kawasan Euro' },
  JPY: { id: 'FRED:IRSTCI01JPM156N', label: 'antarbank Jepang' },
  GBP: { id: 'FRED:IRSTCI01GBM156N', label: 'antarbank Inggris' },
  AUD: { id: 'FRED:IRSTCI01AUM156N', label: 'antarbank Australia' },
  CNY: { id: 'FRED:IRSTCI01CNM156N', label: 'antarbank Tiongkok' },
}

const YIELD_CURVE: [string, string][] = [
  ['FRED:DFF', 'Fed Funds efektif'],
  ['FRED:DGS3MO', 'Treasury 3 bulan'],
  ['FRED:DGS2', 'Treasury 2 tahun'],
  ['FRED:DGS10', 'Treasury 10 tahun'],
  ['FRED:DGS30', 'Treasury 30 tahun'],
  ['FRED:T10Y2Y', 'Selisih 10th − 2th'],
  ['FRED:T10YIE', 'Ekspektasi inflasi 10 tahun'],
  ['FRED:BAMLH0A0HYM2', 'Selisih high-yield (OAS)'],
]

/** Nilai terakhir per `asOf` dan perubahannya dalam ~3 bulan, dalam poin persen. */
async function macroLine(id: string, label: string, asOf: string): Promise<string> {
  const from = new Date(Date.parse(asOf) - 400 * 86_400_000).toISOString().slice(0, 10)
  const rows = [...(await macroRange(id, from, asOf)).entries()]
  if (rows.length === 0) {
    const last = await latestMacro(id)
    return last ? `${label}: ${last.value.toFixed(2)}% (per ${last.date}, sesudah tanggal analisis)` : `${label}: tidak tersedia`
  }
  const [date, value] = rows[rows.length - 1]
  const cutoff = new Date(Date.parse(date) - 91 * 86_400_000).toISOString().slice(0, 10)
  const past = [...rows].reverse().find(([d]) => d <= cutoff)
  const chg = past ? `, ${value - past[1] >= 0 ? '+' : ''}${(value - past[1]).toFixed(2)} poin dalam 3 bulan` : ''
  return `${label}: ${value.toFixed(2)}% (per ${date}${chg})`
}

/**
 * Konteks makro untuk valas dan obligasi. Harga valas digerakkan selisih
 * bunga, harga obligasi bergerak berlawanan dengan imbal hasil — tanpa angka
 * itu komite hanya membaca grafik.
 */
async function macroContextFor(
  assetClass: 'mata_uang' | 'obligasi',
  symbol: string,
  asOf: string,
): Promise<{ title: string; lines: string[] }> {
  if (assetClass === 'mata_uang') {
    const base = symbol.slice(0, 3)
    const quote = symbol.slice(3, 6)
    const lines = await Promise.all(
      [base, quote].map((c) =>
        POLICY_RATE[c] ? macroLine(POLICY_RATE[c].id, `Suku bunga ${c} (${POLICY_RATE[c].label})`, asOf) : Promise.resolve(`Suku bunga ${c}: belum ada sumber`),
      ),
    )
    return {
      title: `SELISIH SUKU BUNGA (${base} vs ${quote}; kurs naik = ${base} menguat terhadap ${quote})`,
      lines,
    }
  }
  return {
    title: 'KURVA IMBAL HASIL AS (harga obligasi bergerak berlawanan dengan imbal hasil)',
    lines: await Promise.all(YIELD_CURVE.map(([id, label]) => macroLine(id, label, asOf))),
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
