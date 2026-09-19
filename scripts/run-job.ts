/**
 * Jalankan satu job dari baris perintah.
 *
 *   npm run job ingest-crypto-daily
 *   npm run job compute-features-crypto
 *   npm run job ingest-crypto-daily -- --from 2024-01-01
 *
 * Jalur yang sama dengan yang dipakai QStash, hanya tanpa HTTP dan tanpa tanda
 * tangan. Berguna untuk mengisi riwayat pertama kali dan untuk memeriksa
 * kenapa satu batch gagal, tanpa perlu menunggu jam berikutnya.
 */

import './load-env'
import { listInstruments } from '../lib/db/queries'
import { runIngestJob } from '../lib/jobs/ingest'
import { runFeatureJob } from '../lib/features/job'
import type { MarketCode } from '../lib/db/schema'

const JOBS = [
  'ingest-crypto-daily',
  'ingest-idx-daily',
  'ingest-us-daily',
  'compute-features-crypto',
  'compute-features-idx',
  'compute-features-us',
] as const

type JobName = (typeof JOBS)[number]

function marketOf(job: string): MarketCode {
  if (job.endsWith('-idx') || job.includes('-idx-')) return 'IDX'
  if (job.endsWith('-us') || job.includes('-us-')) return 'US'
  return 'CRYPTO'
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const job = process.argv[2] as JobName | undefined

  if (!job || !JOBS.includes(job)) {
    console.error(`\nPakai: npm run job <nama-job>\n\nJob yang tersedia:`)
    for (const j of JOBS) console.error(`  ${j}`)
    console.error('')
    process.exit(1)
  }

  const market = marketOf(job)
  const instruments = await listInstruments(market)

  if (instruments.length === 0) {
    console.error(`\nBelum ada instrumen untuk pasar ${market}. Jalankan npm run db:seed.\n`)
    process.exit(1)
  }

  const symbols = instruments.map((i) => i.symbol)
  console.log(`\n${job} · ${market} · ${symbols.length} instrumen`)

  const started = Date.now()

  if (job.startsWith('ingest-')) {
    const result = await runIngestJob({
      symbols,
      market,
      from: flag('from'),
      to: flag('to'),
    })

    console.log(`  ${result.itemsProcessed} berhasil, ${result.itemsFailed} gagal`)
    console.log(`  ${result.candlesWritten} candle ditulis, ${result.quarantined} dikarantina`)
    for (const e of result.errors) console.log(`  ! ${e}`)
  } else {
    const result = await runFeatureJob({
      symbols,
      market,
      // Tanpa tanggal, job hanya menulis ulang beberapa hari terakhir. Dari
      // baris perintah niatnya biasanya mengisi seluruh riwayat.
      writeFrom: flag('from') ?? '2000-01-01',
    })

    console.log(`  ${result.itemsProcessed} berhasil, ${result.itemsFailed} gagal`)
    console.log(`  ${result.rowsWritten} baris fitur ditulis`)
    for (const s of result.skipped) console.log(`  - ${s.symbol}: ${s.reason}`)
    for (const e of result.errors) console.log(`  ! ${e}`)
  }

  console.log(`  selesai dalam ${((Date.now() - started) / 1000).toFixed(1)} detik\n`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nGagal: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
