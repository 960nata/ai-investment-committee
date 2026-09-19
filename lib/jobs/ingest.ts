/**
 * Job ingest harga.
 *
 * Dipisah dari route agar bisa dipanggil tanpa HTTP: dari worker QStash, dari
 * skrip baris perintah, dan dari pengujian. Route tinggal jadi pembungkus tipis
 * yang mengurus tanda tangan dan status, dan logika pengambilan datanya tidak
 * lagi terkunci di belakang satu endpoint.
 */

import { registry } from '@/lib/adapters'
import { catalogueEntry } from '@/lib/adapters/catalogue'
import {
  MAX_DAILY_JUMP,
  formatDate,
  validateCandle,
  type Candle,
  type Market,
} from '@/lib/adapters/types'
import {
  getInstrumentBySymbol,
  getLatestCandle,
  quarantineRow,
  upsertCandles,
  upsertInstrument,
  upsertSymbolAlias,
  type CandleInput,
} from '@/lib/db/queries'

export interface IngestInput {
  symbols: string[]
  market: Market
  /** ISO date. Kosong berarti lanjut dari candle terakhir tiap instrumen. */
  from?: string
  to?: string
}

export interface IngestResult {
  itemsProcessed: number
  itemsFailed: number
  candlesWritten: number
  quarantined: number
  errors: string[]
}

const CURRENCY_BY_MARKET: Record<Market, string> = {
  CRYPTO: 'USDT',
  IDX: 'IDR',
  US: 'USD',
  GLOBAL: 'USD',
}

/** Riwayat yang ditarik saat instrumen belum punya satu candle pun. */
const INITIAL_BACKFILL_DAYS = 365

/**
 * Riwayat harga ditabung sendiri sejak hari pertama. Sumber gratis membatasi
 * berapa jauh ke belakang data bisa diminta, jadi yang tidak disimpan sekarang
 * tidak akan pernah bisa dipakai backtest nanti.
 */
export async function runIngestJob(input: IngestInput): Promise<IngestResult> {
  const { symbols, market } = input
  const result: IngestResult = {
    itemsProcessed: 0,
    itemsFailed: 0,
    candlesWritten: 0,
    quarantined: 0,
    errors: [],
  }

  const requestedFrom = input.from ? new Date(input.from) : null
  const to = input.to ? new Date(input.to) : new Date()
  const maxJump = MAX_DAILY_JUMP[market]

  for (const symbol of symbols) {
    try {
      // Instrumen yang sudah terdaftar dipakai apa adanya. Menimpanya di sini
      // akan menghapus nama, kelas aset, dan mata uang yang diisi seed dengan
      // nilai bawaan per pasar — dan indeks dunia tidak punya satu mata uang.
      const known = catalogueEntry(market, symbol)
      const instrument =
        (await getInstrumentBySymbol(market, symbol)) ??
        (await upsertInstrument({
          symbol,
          name: known?.name ?? symbol,
          market,
          assetClass: known?.assetClass,
          region: known?.region,
          currency: known?.currency ?? CURRENCY_BY_MARKET[market],
        }))

      const latest = await getLatestCandle(instrument.id)

      // Ingest bersifat inkremental: tarik hanya dari candle terakhir yang
      // tersimpan. Hari terakhir sengaja ditarik ulang karena candle hari
      // berjalan masih berubah sampai pasar tutup.
      const from =
        requestedFrom ??
        (latest ? new Date(`${latest.date}T00:00:00Z`) : daysAgo(INITIAL_BACKFILL_DAYS))

      const { candles, sourceId } = await registry.fetchDailyWithFailover(
        market,
        symbol,
        from,
        to,
      )

      if (candles.length === 0) {
        result.itemsProcessed++
        continue
      }

      await upsertSymbolAlias({ instrumentId: instrument.id, sourceId, alias: symbol })

      let previousClose = latest ? Number(latest.close) : undefined
      const valid: CandleInput[] = []

      for (const candle of candles) {
        const check = validateCandle(candle, { previousClose, maxJump })

        if (!check.valid) {
          await quarantineRow({
            instrumentId: instrument.id,
            sourceId,
            payload: { symbol, ...serialiseCandle(candle) },
            reason: check.reason ?? 'tidak diketahui',
          })
          result.quarantined++
          continue
        }

        valid.push({
          instrumentId: instrument.id,
          date: formatDate(candle.date),
          open: String(candle.open),
          high: String(candle.high),
          low: String(candle.low),
          close: String(candle.close),
          volume: String(candle.volume),
          // Disimpan hanya bila sumbernya memang menyediakan. Menyalin harga
          // mentah ke kolom ini akan membuat engine fitur mengira harganya
          // sudah disesuaikan padahal belum.
          adjClose: candle.adjClose === undefined ? null : String(candle.adjClose),
          sourceId,
        })
        previousClose = candle.close
      }

      result.candlesWritten += await upsertCandles(valid)
      result.itemsProcessed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Ingest] ${symbol} gagal:`, message)
      result.errors.push(`${symbol}: ${message}`)
      result.itemsFailed++
    }
  }

  return result
}

function serialiseCandle(candle: Candle) {
  return {
    date: formatDate(candle.date),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}
