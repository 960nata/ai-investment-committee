/**
 * Probe pipeline sampul warta: cari → unduh → AVIF → Supabase Storage.
 *
 * Dijalankan terpisah dari agen jurnalis supaya kegagalan bisa dilokalisir
 * tanpa membakar kuota LLM. Bila artikel gagal terbit karena sampulnya, skrip
 * inilah yang memberi tahu di langkah mana ia berhenti: pencariannya nihil,
 * unduhannya ditolak sumber, sharp-nya tidak ada, atau kunci Supabase-nya salah.
 *
 * Pemakaian:
 *   npm run probe:photo
 *   npm run probe:photo -- "geothermal power plant turbine"
 *   npm run probe:photo -- "copper mine" --upload
 */

import './load-env'

import { searchInternetPhotos } from '../lib/media/image-search'
import { convertToAvif, downloadImage } from '../lib/media/avif'
import {
  isSupabaseStorageConfigured,
  storeRemoteImageAsAvif,
} from '../lib/storage/supabase-storage'

const args = process.argv.slice(2)
const doUpload = args.includes('--upload')
const query = args.filter((a) => !a.startsWith('--')).join(' ') || 'data center server room'

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

async function main() {
  console.log(`\nPROBE SAMPUL WARTA — kata kunci: "${query}"\n${'='.repeat(60)}`)

  console.log('\n[1/3] Mencari foto di internet...')
  const candidates = await searchInternetPhotos(query)

  if (candidates.length === 0) {
    console.error('  GAGAL: tidak ada kandidat foto. Periksa koneksi keluar ke Openverse/Wikimedia.')
    process.exit(1)
  }

  for (const [i, c] of candidates.entries()) {
    console.log(
      `  ${i + 1}. [${c.provider}] ${c.width ?? '?'}px · ${c.license ?? 'lisensi tidak disebut'}\n` +
        `     ${c.credit}\n     ${c.url.slice(0, 100)}`,
    )
  }

  const first = candidates[0]

  console.log(`\n[2/3] Mengunduh & mengonversi kandidat pertama (${first.provider})...`)
  const downloaded = await downloadImage(first.url)
  if (!downloaded.ok || !downloaded.buffer) {
    console.error(`  GAGAL unduh: ${downloaded.error}`)
    process.exit(1)
  }
  console.log(`  Terunduh ${kb(downloaded.buffer.length)} (${downloaded.contentType})`)

  const converted = await convertToAvif(downloaded.buffer, downloaded.contentType)
  if (!converted.ok || !converted.buffer) {
    console.error(`  GAGAL konversi: ${converted.error}`)
    process.exit(1)
  }

  if (converted.usedOriginal) {
    console.warn('  PERINGATAN: sharp tidak tersedia, berkas disimpan tanpa konversi AVIF.')
  } else {
    const saved = Math.round((1 - converted.buffer.length / downloaded.buffer.length) * 100)
    console.log(
      `  AVIF ${converted.width}x${converted.height} · ` +
        `${kb(downloaded.buffer.length)} → ${kb(converted.buffer.length)} (hemat ${saved}%)`,
    )
  }

  console.log('\n[3/3] Unggah ke Supabase Storage...')
  if (!isSupabaseStorageConfigured()) {
    console.warn('  DILEWATI: SUPABASE_SERVICE_ROLE_KEY belum diisi.')
    return
  }
  if (!doUpload) {
    console.log('  DILEWATI: jalankan dengan --upload untuk benar-benar mengunggah.')
    return
  }

  const stored = await storeRemoteImageAsAvif(first.url, `probe-${query}`)
  if (!stored.ok) {
    console.error(`  GAGAL unggah: ${stored.error}`)
    process.exit(1)
  }
  console.log(`  Tersimpan: ${stored.publicUrl}`)
}

main().catch((err) => {
  console.error('Probe gagal:', err)
  process.exit(1)
})
