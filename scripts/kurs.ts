/**
 * Perkakas Baris Perintah Kurs Dunia (Forex CLI).
 *
 * Mengendalikan kurs valuta asing riil dan mata uang aktif untuk seluruh situs
 * langsung dari terminal secara realtime.
 *
 * Penggunaan:
 *   npx tsx scripts/kurs.ts                       # Lihat status & kurs aktif
 *   npx tsx scripts/kurs.ts sync                  # Ambil kurs riil dunia dari pasar forex
 *   npx tsx scripts/kurs.ts currency <KODE>       # Ganti mata uang aktif (IDR, USD, JPY, EUR, dll)
 *   npx tsx scripts/kurs.ts set <KODE> <NILAI>    # Override kurs spesifik vs USD
 *   npx tsx scripts/kurs.ts live                  # Mode streaming/monitoring interaktif
 */

import { loadEnv } from './load-env'
loadEnv()

import {
  MAJOR_CURRENCIES,
  MAJOR_CURRENCY_CODES,
  isMajorCurrency,
  type MajorCurrencyCode,
} from '../lib/forex/types'
import {
  getForexState,
  syncForexRates,
  setActiveCurrency,
  overrideForexRate,
  convertCurrency,
} from '../lib/forex/rates'

function printHelp() {
  console.log(`
\x1b[1m\x1b[36m=====================================================================\x1b[0m
\x1b[1m\x1b[32m       AI INVESTDESK — PENGENDALI KURS & MATA UANG REALTIME          \x1b[0m
\x1b[1m\x1b[36m=====================================================================\x1b[0m

\x1b[1mPerintah yang tersedia:\x1b[0m
  \x1b[33mnpx tsx scripts/kurs.ts\x1b[0m                     Tampilkan tabel kurs mata uang utama
  \x1b[33mnpx tsx scripts/kurs.ts sync\x1b[0m                Ambil kurs riil terbaru dari pasar dunia
  \x1b[33mnpx tsx scripts/kurs.ts currency <KODE>\x1b[0m     Ganti mata uang aktif untuk SEMUA halaman web
  \x1b[33mnpx tsx scripts/kurs.ts set <KODE> <NILAI>\x1b[0m  Ubah nilai kurs spesifik (patokan vs 1 USD)
  \x1b[33mnpx tsx scripts/kurs.ts live\x1b[0m                Pantau kurs secara live tiap beberapa detik

\x1b[1mMata Uang Utama yang Didukung:\x1b[0m
  ${MAJOR_CURRENCY_CODES.join(', ')}
`)
}

async function showStatus() {
  const state = await getForexState()
  const dateStr = new Date(state.updatedAt).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

  console.log(`\n\x1b[1m\x1b[34m[STATUS KURS VALAS DUNIA]\x1b[0m`)
  console.log(`Sumber Data : \x1b[32m${state.source}\x1b[0m (Real Market Data)`)
  console.log(`Pembaruan   : \x1b[33m${dateStr}\x1b[0m`)
  console.log(
    `Mata Uang   : \x1b[1m\x1b[42m\x1b[30m ${state.activeCurrency} (${MAJOR_CURRENCIES[state.activeCurrency].name}) \x1b[0m <- Sedang aktif di web\n`,
  )

  const rows = MAJOR_CURRENCY_CODES.map((code) => {
    const meta = MAJOR_CURRENCIES[code]
    const rateVsUSD = state.rates[code] ?? 0
    // Hitung berapa 1 unit mata uang ini dalam Rupiah
    const inIDR = convertCurrency(1, code, 'IDR', state.rates) ?? 0
    const isActive = code === state.activeCurrency

    return {
      Aktif: isActive ? '>>> YA <<<' : '',
      Kode: code,
      Simbol: meta.symbol,
      'Nama Mata Uang': meta.name,
      'Rate per 1 USD': rateVsUSD.toLocaleString('en-US', {
        minimumFractionDigits: meta.defaultDecimals === 0 ? 0 : 2,
        maximumFractionDigits: 4,
      }),
      'Nilai dlm Rupiah (IDR)': `Rp ${Math.round(inIDR).toLocaleString('id-ID')}`,
    }
  })

  console.table(rows)
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]?.toLowerCase()

  if (!cmd || cmd === 'status') {
    await showStatus()
    printHelp()
    return
  }

  if (cmd === 'sync') {
    console.log('\n\x1b[36m[Sync]\x1b[0m Mengambil data kurs riil dunia dari open.er-api.com...')
    const updated = await syncForexRates()
    console.log(
      `\x1b[32m[Sukses]\x1b[0m Berhasil memperbarui kurs riil untuk ${Object.keys(updated.rates).length} mata uang dunia!`,
    )
    console.log(`IDR saat ini: Rp ${Math.round(updated.rates.IDR).toLocaleString('id-ID')} / 1 USD`)
    console.log(`EUR saat ini: € ${updated.rates.EUR.toFixed(4)} / 1 USD`)
    console.log(`JPY saat ini: ¥ ${updated.rates.JPY.toFixed(2)} / 1 USD`)
    console.log(`\x1b[35m[Realtime]\x1b[0m Pembaruan langsung disiarkan ke semua browser via SSE.`)
    return
  }

  if (cmd === 'currency' || cmd === 'cur') {
    const target = args[1]?.toUpperCase()
    if (!target || !isMajorCurrency(target)) {
      console.error(
        `\x1b[31m[Error]\x1b[0m Kode mata uang tidak valid! Pilihan: ${MAJOR_CURRENCY_CODES.join(', ')}`,
      )
      process.exit(1)
    }

    const state = await setActiveCurrency(target)
    console.log(
      `\n\x1b[32m[Sukses]\x1b[0m Mata uang aktif berhasil diubah menjadi: \x1b[1m\x1b[33m${target}\x1b[0m (${MAJOR_CURRENCIES[target].name})`,
    )
    console.log(
      `\x1b[35m[Realtime]\x1b[0m Semua browser yang sedang membuka halaman web otomatis berganti mata uang ke ${target} sekarang!`,
    )
    return
  }

  if (cmd === 'set') {
    const code = args[1]?.toUpperCase()
    const rateStr = args[2]
    const rate = parseFloat(rateStr)

    if (!code || !isMajorCurrency(code) || isNaN(rate) || rate <= 0) {
      console.error(`\x1b[31m[Error]\x1b[0m Format salah! Gunakan: npx tsx scripts/kurs.ts set <KODE> <NILAI>`)
      console.error(`Contoh: npx tsx scripts/kurs.ts set IDR 16300`)
      process.exit(1)
    }

    await overrideForexRate(code, rate)
    console.log(
      `\n\x1b[32m[Sukses]\x1b[0m Kurs \x1b[1m${code}\x1b[0m diubah menjadi: \x1b[33m${rate}\x1b[0m per 1 USD`,
    )
    console.log(`\x1b[35m[Realtime]\x1b[0m Nilai baru sudah tersimpan di Redis dan langsung disiarkan via SSE.`)
    return
  }

  if (cmd === 'live') {
    console.log('\n\x1b[1m\x1b[36m[Mode Live]\x1b[0m Memulai pemantauan realtime... Tekan Ctrl+C untuk keluar.')
    let ticks = 0
    setInterval(async () => {
      ticks++
      const state = await getForexState()
      const now = new Date().toLocaleTimeString('id-ID')
      console.log(
        `[${now}] Aktif: ${state.activeCurrency} | 1 USD = Rp ${Math.round(state.rates.IDR).toLocaleString('id-ID')} | ¥ ${state.rates.JPY.toFixed(1)} | € ${state.rates.EUR.toFixed(3)} (Pembaruan #${ticks})`,
      )
    }, 3000)
    return
  }

  console.error(`\x1b[31m[Error]\x1b[0m Perintah "${cmd}" tidak dikenal.`)
  printHelp()
}

main().catch((err) => {
  console.error('\x1b[31m[Fatal]\x1b[0m Terjadi kesalahan:', err)
  process.exit(1)
})
