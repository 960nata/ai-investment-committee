/**
 * Pasang jadwal per jam di QStash.
 *
 * Plan Hobby Vercel hanya mengizinkan cron harian, sementara dispatcher
 * dirancang jalan tiap jam supaya tabel `job_schedule` bisa memutuskan sendiri
 * job mana yang jatuh tempo — IDX sore WIB, AS dini hari, crypto sepanjang hari.
 * Cron harian mematikan seluruh penjadwalan halus itu.
 *
 * QStash sudah ada di tumpukan ini untuk antrian job, dan ia juga bisa
 * menjadwal. Pembagian perannya jadi:
 *
 *   QStash Schedules  -> pemicu per jam, penjadwal sebenarnya
 *   Vercel Cron       -> sekali sehari, jaring pengaman kalau QStash mati
 *
 * Keduanya memanggil endpoint yang sama. Dispatcher idempoten dan membaca
 * `job_schedule` sebelum bertindak, jadi dipanggil dua kali dalam satu jam
 * tidak menggandakan pekerjaan apa pun.
 *
 * Jalankan: npx tsx scripts/setup-schedule.ts [--cron "0 * * * *"] [--delete]
 */

import './load-env'
import { Client } from '@upstash/qstash'

const DEST_PATH = '/api/cron/dispatcher'
const DEFAULT_CRON = '0 * * * *'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!url) throw new Error('NEXT_PUBLIC_APP_URL belum diset')
  if (url.includes('localhost')) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL masih menunjuk localhost (${url}). ` +
        'QStash memanggil dari internet, jadi isinya harus URL produksi.',
    )
  }
  return url
}

async function main() {
  const token = process.env.QSTASH_TOKEN
  if (!token) {
    console.error('\nQSTASH_TOKEN belum diset di .env.local.')
    console.error('Ambil di console.upstash.com -> QStash -> Details.\n')
    process.exit(1)
  }

  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    console.error('\nCRON_SECRET belum diset atau kurang dari 16 karakter.')
    console.error('Dispatcher menolak permintaan tanpa rahasia yang benar.\n')
    process.exit(1)
  }

  const client = new Client({ token })
  const destination = `${appUrl()}${DEST_PATH}`
  const cron = arg('cron') ?? DEFAULT_CRON

  // Jadwal lama dibersihkan dulu supaya menjalankan skrip ini dua kali tidak
  // meninggalkan dua jadwal yang sama-sama memanggil dispatcher.
  const existing = await client.schedules.list()
  const mine = existing.filter((s) => s.destination === destination)

  for (const s of mine) {
    await client.schedules.delete(s.scheduleId)
    console.log(`  hapus jadwal lama: ${s.scheduleId} (${s.cron})`)
  }

  if (process.argv.includes('--delete')) {
    console.log(`\n${mine.length} jadwal dihapus. Tidak ada yang dibuat.\n`)
    return
  }

  const schedule = await client.schedules.create({
    destination,
    cron,
    // Dispatcher memeriksa Authorization: Bearer <CRON_SECRET>, sama seperti
    // yang dikirim Vercel Cron. Satu penjaga untuk kedua pemicu.
    headers: { Authorization: `Bearer ${secret}` },
    method: 'GET',
    retries: 2,
  })

  console.log('\n=== Jadwal QStash terpasang ===\n')
  console.log(`  id      : ${schedule.scheduleId}`)
  console.log(`  tujuan  : ${destination}`)
  console.log(`  cron    : ${cron}  (UTC)`)
  console.log(`  retry   : 2`)
  console.log('\n  Vercel Cron tetap jalan sekali sehari sebagai jaring pengaman.')
  console.log('  Pantau pengirimannya di console.upstash.com -> QStash -> Schedules.\n')
}

main().catch((err) => {
  console.error('\nGagal memasang jadwal:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
