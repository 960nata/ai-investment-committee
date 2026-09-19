/**
 * Seed — isi jadwal job dan daftar instrumen awal.
 *
 *   npm run db:seed
 *
 * Idempoten: menjalankannya berkali-kali tidak menggandakan apa pun, jadi aman
 * dipakai ulang setiap kali jadwal berubah.
 *
 * Penjadwalan sengaja hidup di database, bukan di `vercel.json`. Tier Hobby
 * hanya mengizinkan sedikit cron, sementara sistem ini butuh ritme berbeda untuk
 * tiga pasar: IDX tutup sore WIB, bursa US buka malam WIB, crypto tidak tidur.
 */

import './load-env'

import { binanceAdapter, BINANCE_DEFAULT_SYMBOLS } from '../lib/adapters/binance'
import { upsertInstrument, upsertSchedule, upsertSymbolAlias } from '../lib/db/queries'
import type { MarketCode } from '../lib/db/schema'

const EVERY_HOUR = Array.from({ length: 24 }, (_, hour) => hour)

interface ScheduleSeed {
  jobName: string
  hoursOfDay: number[]
  timezone: string
  tradingDaysOnly: boolean
  market: MarketCode
  enabled: boolean
  note: string
}

/**
 * Job IDX dan US sudah punya barisnya sendiri tetapi dimatikan: adaptornya belum
 * ada, dan jadwal yang menunjuk ke sumber kosong hanya menghasilkan kegagalan
 * harian yang membuat log tidak lagi dibaca orang.
 */
const SCHEDULES: ScheduleSeed[] = [
  {
    jobName: 'ingest-crypto-daily',
    hoursOfDay: EVERY_HOUR,
    timezone: 'UTC',
    tradingDaysOnly: false,
    market: 'CRYPTO',
    enabled: true,
    note: 'tiap jam, tujuh hari seminggu',
  },
  {
    jobName: 'compute-features-crypto',
    // 01.00 UTC, satu jam setelah candle harian crypto benar-benar tertutup.
    hoursOfDay: [1],
    timezone: 'UTC',
    tradingDaysOnly: false,
    market: 'CRYPTO',
    enabled: true,
    note: 'sekali sehari, setelah candle harian tertutup',
  },
  {
    jobName: 'ingest-idx-daily',
    // 17.00 WIB, setelah sesi IDX benar-benar tutup dan data EOD terbit.
    hoursOfDay: [17],
    timezone: 'Asia/Jakarta',
    tradingDaysOnly: true,
    market: 'IDX',
    enabled: false,
    note: 'menunggu adaptor IDX (Fase 2)',
  },
  {
    jobName: 'compute-features-idx',
    // 17.30 tidak bisa diwakili penjadwal berbutir jam, jadi 18.00 WIB.
    hoursOfDay: [18],
    timezone: 'Asia/Jakarta',
    tradingDaysOnly: true,
    market: 'IDX',
    enabled: false,
    note: 'menunggu adaptor IDX (Fase 2)',
  },
  {
    jobName: 'ingest-us-daily',
    // 05.00 WIB, beberapa jam setelah bursa US tutup.
    hoursOfDay: [5],
    timezone: 'Asia/Jakarta',
    tradingDaysOnly: true,
    market: 'US',
    enabled: false,
    note: 'menunggu adaptor Finnhub (Fase 4)',
  },
  {
    jobName: 'komite-review',
    // Sekali sehari, 08.00 WIB — setelah ingest crypto semalam selesai.
    // Tiap simbol berarti empat panggilan model, jadi ritmenya sengaja jarang:
    // menjalankannya tiap jam akan menghabiskan kuota harian sebelum siang.
    hoursOfDay: [8],
    timezone: 'Asia/Jakarta',
    tradingDaysOnly: false,
    market: 'CRYPTO',
    // Dimatikan sampai ada kunci LLM terisi. Jadwal yang menunjuk ke registry
    // kosong hanya menghasilkan kegagalan harian yang membuat log berhenti dibaca.
    enabled: false,
    note: 'aktifkan setelah kunci LLM terisi',
  },
]

async function seedSchedules(): Promise<void> {
  console.log('\nJadwal job')
  for (const schedule of SCHEDULES) {
    await upsertSchedule(schedule)
    const state = schedule.enabled ? 'aktif ' : 'mati  '
    console.log(`  ${state} ${schedule.jobName.padEnd(22)} ${schedule.note}`)
  }
}

/**
 * Daftar kurasi disaring dulu terhadap pasangan yang masih diperdagangkan.
 * Kalau bursa tidak bisa dihubungi, seed tetap jalan dengan daftar mentah —
 * simbol yang sudah mati akan tersaring sendiri oleh worker berikutnya.
 */
async function resolveCryptoSymbols(): Promise<{ symbol: string; name: string }[]> {
  try {
    const tradable = await binanceAdapter.fetchSymbols()
    const dropped = BINANCE_DEFAULT_SYMBOLS.filter(
      (s) => !tradable.some((t) => t.symbol === s.symbol),
    )
    if (dropped.length > 0) {
      console.warn(
        `  ! tidak diperdagangkan lagi, dilewati: ${dropped.map((d) => d.symbol).join(', ')}`,
      )
    }
    return tradable
  } catch (err) {
    console.warn(
      `  ! exchangeInfo tidak terjangkau (${err instanceof Error ? err.message : err}); ` +
        'memakai daftar bawaan tanpa penyaringan',
    )
    return BINANCE_DEFAULT_SYMBOLS
  }
}

async function seedInstruments(): Promise<number> {
  console.log('\nInstrumen crypto')
  const symbols = await resolveCryptoSymbols()

  for (const { symbol, name } of symbols) {
    const instrument = await upsertInstrument({
      symbol,
      name,
      market: 'CRYPTO',
      currency: 'USDT',
      sector: 'crypto',
    })
    await upsertSymbolAlias({
      instrumentId: instrument.id,
      sourceId: binanceAdapter.id,
      alias: symbol,
    })
    console.log(`  + ${symbol.padEnd(12)} ${name}`)
  }

  return symbols.length
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum diset. Salin .env.example ke .env.local.')
  }

  await seedSchedules()
  const instrumentCount = await seedInstruments()

  console.log(
    `\nSelesai: ${SCHEDULES.length} jadwal, ${instrumentCount} instrumen.\n` +
      'Langkah berikutnya: buka /pipeline untuk memastikan jadwalnya terbaca.\n',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeed gagal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
