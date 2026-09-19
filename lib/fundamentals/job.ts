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

import { getInstrumentBySymbol, quarantineRow, upsertFundamentals, type FundamentalInput } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { fetchCompanyFacts, fetchTickerMap, parseCompanyFacts, sanityCheck } from './edgar'

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

      for (const row of parsed) {
        const problem = sanityCheck(row)
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
          items: row.items,
          missingItems: row.missingItems,
          completeness: row.completeness,
          sourceId: 'sec-edgar',
        })
      }

      result.itemsProcessed++
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Fundamental] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  result.rowsWritten = await upsertFundamentals(rows)
  return result
}
