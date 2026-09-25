/**
 * Lengkapi versi bahasa lain untuk warta yang sudah terbit.
 *
 *   npx tsx scripts/translate-news.ts            (maks 20 artikel)
 *   npx tsx scripts/translate-news.ts --limit 5
 *
 * Artikel baru sudah ditulis dalam lima bahasa saat diterbitkan. Skrip ini
 * untuk artikel yang terbit sebelum fitur itu ada, dan untuk versi yang gagal
 * ditulis saat terbit.
 */

import './load-env'
import { translateMissingNews } from '../lib/agents/news-translator'

async function main(): Promise<void> {
  const i = process.argv.indexOf('--limit')
  const limit = i === -1 ? 20 : Number(process.argv[i + 1]) || 20

  const started = Date.now()
  const report = await translateMissingNews(limit)

  console.log(`\n${report.done.length} versi tersimpan`)
  for (const d of report.done) console.log(`  ✓ ${d.locale}  ${d.slug}`)
  if (report.failed.length > 0) {
    console.log(`\n${report.failed.length} gagal`)
    for (const f of report.failed) console.log(`  ✗ ${f.locale}  ${f.slug}  — ${f.error}`)
  }
  console.log(`\nselesai dalam ${((Date.now() - started) / 1000).toFixed(1)} detik\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
