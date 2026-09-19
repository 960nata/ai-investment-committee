/**
 * Seed — isi jadwal job dan katalog instrumen.
 *
 *   npm run db:seed
 *   npm run db:seed -- --skip-verify
 *
 * Idempoten: menjalankannya berkali-kali tidak menggandakan apa pun.
 *
 * Tiap simbol diperiksa ke sumbernya lebih dulu. Simbol berganti nama, kontrak
 * berjangka berpindah, dan bursa menghapus pasangan tanpa pemberitahuan.
 * Memasukkan daftar keinginan tanpa memeriksanya berarti menaruh instrumen mati
 * ke dalam katalog, lalu membiarkannya gagal tiap hari di dalam log sampai tidak
 * ada lagi yang membaca log itu.
 */

import './load-env'
import { registry } from '../lib/adapters'
import { CATALOGUE, type CatalogueEntry } from '../lib/adapters/catalogue'
import { upsertInstrument, upsertSchedule, upsertSymbolAlias } from '../lib/db/queries'
import type { MarketCode } from '../lib/db/schema'

const EVERY_HOUR = Array.from({ length: 24 }, (_, hour) => hour)

/** Berapa simbol diperiksa bersamaan. Cukup cepat tanpa memancing pembatasan laju. */
const VERIFY_CONCURRENCY = 6

interface ScheduleSeed {
  jobName: string
  hoursOfDay: number[]
  timezone: string
  tradingDaysOnly: boolean
  market: MarketCode
  enabled: boolean
  note: string
}

const SCHEDULES: ScheduleSeed[] = [
  { jobName: 'ingest-crypto-daily', hoursOfDay: EVERY_HOUR, timezone: 'UTC', tradingDaysOnly: false, market: 'CRYPTO', enabled: true, note: 'tiap jam, tujuh hari seminggu' },
  { jobName: 'compute-features-crypto', hoursOfDay: [1], timezone: 'UTC', tradingDaysOnly: false, market: 'CRYPTO', enabled: true, note: '01.00 UTC, setelah candle harian tertutup' },
  // 17.00 WIB, setelah sesi IDX tutup dan data penutupnya terbit.
  { jobName: 'score-crypto', hoursOfDay: [2], timezone: 'UTC', tradingDaysOnly: false, market: 'CRYPTO', enabled: true, note: '02.00 UTC, setelah fitur selesai' },
  { jobName: 'ingest-idx-daily', hoursOfDay: [17], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'IDX', enabled: true, note: '17.00 WIB, hari bursa' },
  { jobName: 'compute-features-idx', hoursOfDay: [18], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'IDX', enabled: true, note: '18.00 WIB, hari bursa' },
  // 05.00 WIB, beberapa jam setelah bursa New York tutup.
  { jobName: 'score-idx', hoursOfDay: [19], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'IDX', enabled: true, note: '19.00 WIB, setelah fitur selesai' },
  { jobName: 'ingest-us-daily', hoursOfDay: [5], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'US', enabled: true, note: '05.00 WIB, hari bursa' },
  { jobName: 'compute-features-us', hoursOfDay: [6], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'US', enabled: true, note: '06.00 WIB, hari bursa' },
  // Indeks dunia dan berjangka tutup pada jam berbeda-beda; 07.00 WIB sudah
  // lewat penutupan Amerika sekaligus sebelum Asia membuka hari berikutnya.
  { jobName: 'score-us', hoursOfDay: [7], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'US', enabled: true, note: '07.00 WIB, setelah fitur selesai' },
  { jobName: 'ingest-global-daily', hoursOfDay: [7], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'GLOBAL', enabled: true, note: '07.00 WIB, indeks dunia dan berjangka' },
  { jobName: 'compute-features-global', hoursOfDay: [8], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'GLOBAL', enabled: true, note: '08.00 WIB, hari bursa' },
  { jobName: 'score-global', hoursOfDay: [9], timezone: 'Asia/Jakarta', tradingDaysOnly: true, market: 'GLOBAL', enabled: true, note: '09.00 WIB, setelah fitur selesai' },
]

async function seedSchedules(): Promise<void> {
  console.log('\nJadwal job')
  for (const schedule of SCHEDULES) {
    await upsertSchedule(schedule)
    console.log(`  ${schedule.enabled ? 'aktif' : 'mati '} ${schedule.jobName.padEnd(24)} ${schedule.note}`)
  }
}

/**
 * Tarik candle beberapa hari terakhir untuk memastikan simbolnya menjawab.
 *
 * Rentangnya tujuh hari, bukan satu: instrumen yang tidak berdagang kemarin
 * bukan berarti mati, dan menolaknya karena itu akan membuang separuh katalog
 * setiap kali seed dijalankan pada Senin pagi.
 */
async function verify(entry: CatalogueEntry): Promise<string | null> {
  const to = new Date()
  const from = new Date(to.getTime() - 7 * 86_400_000)
  try {
    const { candles } = await registry.fetchDailyWithFailover(entry.market, entry.symbol, from, to)
    return candles.length > 0 ? null : 'tidak mengembalikan candle'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

async function seedInstruments(skipVerify: boolean): Promise<void> {
  console.log(`\nKatalog instrumen · ${CATALOGUE.length} simbol`)
  if (skipVerify) console.log('  verifikasi dilewati')

  const failures: { entry: CatalogueEntry; reason: string }[] = []
  const accepted: CatalogueEntry[] = []

  for (let i = 0; i < CATALOGUE.length; i += VERIFY_CONCURRENCY) {
    const batch = CATALOGUE.slice(i, i + VERIFY_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (entry) => ({ entry, reason: skipVerify ? null : await verify(entry) })),
    )
    for (const { entry, reason } of results) {
      if (reason) failures.push({ entry, reason })
      else accepted.push(entry)
    }
  }

  const byClass = new Map<string, number>()
  for (const entry of accepted) {
    const saved = await upsertInstrument({
      symbol: entry.symbol,
      name: entry.name,
      market: entry.market,
      assetClass: entry.assetClass,
      region: entry.region ?? null,
      currency: entry.currency,
    })
    await upsertSymbolAlias({
      instrumentId: saved.id,
      sourceId: entry.market === 'CRYPTO' ? 'binance' : 'yahoo',
      alias: entry.symbol,
    })
    byClass.set(entry.assetClass, (byClass.get(entry.assetClass) ?? 0) + 1)
  }

  console.log(`  ${accepted.length} instrumen tersimpan`)
  for (const [cls, n] of [...byClass].sort()) console.log(`    ${cls.padEnd(10)} ${n}`)

  if (failures.length > 0) {
    console.log(`\n  ${failures.length} simbol tidak dimasukkan:`)
    for (const { entry, reason } of failures) {
      console.log(`    ${entry.symbol.padEnd(12)} ${entry.name.padEnd(26)} ${reason.slice(0, 55)}`)
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum diset. Salin .env.example ke .env.local atau .env.')
  }

  await seedSchedules()
  await seedInstruments(process.argv.includes('--skip-verify'))

  console.log('\nBerikutnya, isi riwayatnya:')
  for (const j of ['crypto', 'idx', 'us', 'global']) console.log(`  npm run job ingest-${j}-daily`)
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeed gagal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
