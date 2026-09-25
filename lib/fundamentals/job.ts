/**
 * Job penarikan laporan keuangan dari EDGAR.
 *
 * Satu instrumen satu panggilan companyfacts, dan satu panggilan itu membawa
 * seluruh riwayatnya sekaligus. Karena itu job ini jarang dijalankan: laporan
 * terbit empat kali setahun, bukan tiap jam.
 *
 * SEC meminta laju permintaan yang sopan, jadi ada jeda antar-instrumen. Itu
 * bukan pembatasan teknis yang harus diakali, melainkan syarat pemakaian yang
 * memang harus dipatuhi.
 */

import { describeError } from '@/lib/http/errors'
import { getInstrumentBySymbol, quarantineRow, upsertFundamentals, type FundamentalInput } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { fetchCompanyFacts, fetchTickerMap, parseCompanyFacts, sanityCheck } from './edgar'
import { crossPeriodIssues } from './quality'

/** Jeda antar-instrumen. SEC menyarankan tidak lebih dari sepuluh per detik. */
const DELAY_MS = 400

/** Riwayat yang ditarik. Sepuluh tahun adalah ambang bawah backtest horizon panjang. */
const SINCE_YEAR = new Date().getUTCFullYear() - 12

/** Emiten yang laporannya berbentuk lain dan butuh cabang skema tersendiri. */
const BANK_LIKE = new Set(['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC', 'SCHW', 'BLK', 'AXP'])

export interface FundamentalJobResult {
  itemsProcessed: number
  itemsFailed: number
  rowsWritten: number
  quarantined: number
  skipped: { symbol: string; reason: string }[]
  /** Temuan yang tidak menahan baris — misalnya lonjakan saham beredar karena pemecahan saham. */
  warnings: string[]
  errors: string[]
}

export async function runFundamentalJob(input: {
  symbols: string[]
  market: MarketCode
}): Promise<FundamentalJobResult> {
  const result: FundamentalJobResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    rowsWritten: 0,
    quarantined: 0,
    skipped: [],
    warnings: [],
    errors: [],
  }

  if (input.market !== 'US') {
    throw new Error(`EDGAR hanya melayani pasar US, bukan ${input.market}`)
  }

  const tickers = await fetchTickerMap()
  const rows: FundamentalInput[] = []

  for (const symbol of input.symbols) {
    try {
      const instrument = await getInstrumentBySymbol('US', symbol)
      if (!instrument) {
        result.skipped.push({ symbol, reason: 'instrumen belum terdaftar' })
        continue
      }

      const cik = tickers.get(symbol.toUpperCase())
      if (!cik) {
        result.skipped.push({ symbol, reason: 'tidak ada di daftar emiten SEC' })
        result.itemsProcessed++
        continue
      }

      const facts = await fetchCompanyFacts(cik)
      const parsed = parseCompanyFacts(facts, {
        kind: BANK_LIKE.has(symbol.toUpperCase()) ? 'bank' : 'umum',
        sinceYear: SINCE_YEAR,
      })

      // Bulan tutup buku, diturunkan dari akhir periode laporan tahunan. EDGAR
      // tidak menyebutnya langsung di companyfacts, tetapi periode "FY" selalu
      // berakhir di bulan itu. Diambil modusnya, bukan yang pertama: satu emiten
      // yang pernah mengganti tahun bukunya meninggalkan satu dua periode ganjil.
      const fyMonths = parsed
        .filter((r) => r.fiscalPeriod === 'FY')
        .map((r) => Number(r.periodEnd.slice(5, 7)))
      const counts = new Map<number, number>()
      for (const m of fyMonths) counts.set(m, (counts.get(m) ?? 0) + 1)
      const fiscalYearEndMonth =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      // Pemeriksaan lintas periode. Pendapatan yang berubah lebih dari lima kali
      // dalam setahun dikarantina — hampir selalu kesalahan satuan. Lonjakan
      // saham beredar TIDAK dikarantina: pemecahan saham (NVDA 10:1 di 2024,
      // AAPL 4:1 di 2020) sah dan sering, dan tanpa data aksi korporasi untuk
      // membedakannya, mengkarantina berarti membuang periode yang benar.
      const crossIssues = crossPeriodIssues(parsed)
      const holdPeriods = new Map<string, string>()
      for (const issue of crossIssues) {
        if (issue.reason.startsWith('pendapatan')) holdPeriods.set(issue.period, issue.reason)
        else result.warnings.push(`${symbol} ${issue.period}: ${issue.reason}`)
      }

      for (const row of parsed) {
        const problem = sanityCheck(row) ?? holdPeriods.get(row.period) ?? null
        if (problem) {
          // Dikarantina, bukan dibuang. Baris yang gagal uji hampir selalu
          // menunjukkan pemetaan pos yang keliru, dan itu petunjuk yang hilang
          // kalau barisnya langsung dihapus.
          await quarantineRow({
            instrumentId: instrument.id,
            sourceId: 'sec-edgar',
            payload: { symbol, period: row.period, accession: row.sourceAccession, items: row.items },
            reason: problem,
          })
          result.quarantined++
          continue
        }

        rows.push({
          instrumentId: instrument.id,
          period: row.period,
          sourceAccession: row.sourceAccession,
          periodType: row.periodType,
          periodEnd: row.periodEnd,
          reportedAt: row.reportedAt,
          fiscalYear: row.fiscalYear,
          fiscalPeriod: row.fiscalPeriod,
          currency: row.currency,
          // EDGAR selalu melapor dalam satuan penuh.
          unitScale: 1,
          fiscalYearEndMonth,
          items: row.items,
          missingItems: row.missingItems,
          completeness: row.completeness,
          sourceId: 'sec-edgar',
        })
      }

      // Ditulis per emiten, bukan sekali di akhir. Satu tulisan besar di ujung
      // berarti seluruh hasil unduhan hilang bila tulisan itu gagal — dan itu
      // yang terjadi saat kolam koneksi Supabase habis di tengah job.
      result.rowsWritten += await upsertFundamentals(rows.splice(0))
      result.itemsProcessed++
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    } catch (err) {
      // Baris emiten ini yang sempat terkumpul dibuang, supaya tidak ikut
      // tertulis bersama emiten berikutnya sebagai data setengah jadi.
      rows.length = 0
      const message = describeError(err)
      console.error(`[Fundamental] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  // Sisa baris dari emiten yang gagal di tengah jalan tidak ditulis: datanya
  // setengah jadi. Yang sudah berhasil sudah tertulis di dalam loop.
  return result
}
