/**
 * Probe SEC EDGAR.
 *
 * Menjawab satu pertanyaan sebelum adaptor dipakai sungguhan: apakah EDGAR bisa
 * diakses dari mesin ini, dan apakah data yang keluar benar-benar cukup untuk
 * mengisi lapisan fundamental.
 *
 * Yang diperiksa dan kenapa:
 *   1. Pemetaan ticker ke CIK  — kunci internal EDGAR, bukan ticker
 *   2. Companyfacts satu emiten — bentuk data mentahnya
 *   3. Kelengkapan pos kanonik — berapa persen rumus yang bisa dihitung
 *   4. reported_at ada         — tanpa ini backtest tidak boleh dijalankan
 *   5. Penyajian ulang terlihat — satu periode dari beberapa filing
 *   6. Frames                  — satu pos seluruh emiten dalam satu panggilan
 *
 * Jalankan: npx tsx scripts/probe-edgar.ts [TICKER ...]
 */

import './load-env'
import {
  resolveCik,
  fetchCompanyFacts,
  extractPeriods,
  fetchFrame,
  latestAsOf,
  health,
} from '@/lib/fundamentals/sec-edgar'
import { requiredFor } from '@/lib/fundamentals/items'

const TICKERS = process.argv.slice(2)
const targets = TICKERS.length > 0 ? TICKERS : ['AAPL', 'MSFT', 'KO']

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

async function main() {
  console.log('\n=== SEC EDGAR probe ===\n')

  if (!process.env.SEC_USER_AGENT) {
    console.log('  ! SEC_USER_AGENT belum diset di .env.local.')
    console.log('    SEC menolak permintaan tanpa header identitas yang benar.')
    console.log('    Isi dengan: SEC_USER_AGENT="investasi-app email@anda.com"\n')
  }

  // 1 — bisa dijangkau?
  const h = await health()
  console.log(`1. Jangkauan   : ${h.healthy ? 'OK' : 'GAGAL'} (${h.latencyMs} ms)`)
  if (!h.healthy) {
    console.log(`   ${h.lastError}`)
    console.log('\n   EDGAR tidak terjangkau dari mesin ini. Cek koneksi atau proxy.\n')
    process.exit(1)
  }

  for (const ticker of targets) {
    console.log(`\n--- ${ticker} ---`)

    // 2 — ticker ke CIK
    const cik = await resolveCik(ticker)
    if (!cik) {
      console.log(`   tidak ditemukan di daftar ticker SEC`)
      continue
    }
    console.log(`2. CIK         : ${cik}`)

    // 3 — companyfacts
    const facts = await fetchCompanyFacts(cik)
    const tagCount = Object.keys(facts.facts['us-gaap'] ?? {}).length
    console.log(`3. Emiten      : ${facts.entityName}`)
    console.log(`   Elemen XBRL : ${tagCount} tag us-gaap tersedia`)

    // 4 — periode tahunan
    const rows = extractPeriods(facts, { periods: 'FY' })
    if (rows.length === 0) {
      console.log('   tidak ada periode tahunan yang bisa diurai')
      continue
    }

    const years = new Set(rows.map((r) => r.periodEnd.slice(0, 4)))
    console.log(`4. Riwayat     : ${years.size} tahun buku, ${rows.length} baris (termasuk penyajian ulang)`)
    console.log(`   Rentang     : ${rows[0].periodEnd} .. ${rows[rows.length - 1].periodEnd}`)

    // 5 — kelengkapan pos
    const last = rows[rows.length - 1]
    const required = requiredFor('umum')
    console.log(`5. Kelengkapan: ${pct(last.completeness)} (${required.length - last.missingItems.length}/${required.length} pos wajib)`)
    if (last.missingItems.length > 0) {
      console.log(`   Hilang      : ${last.missingItems.join(', ')}`)
    }

    // 6 — reported_at, kunci point-in-time
    console.log(`6. Point-in-time:`)
    console.log(`   periode     : ${last.periodStart} .. ${last.periodEnd}`)
    console.log(`   terbit      : ${last.reportedAt}  (form ${last.form})`)
    const lagDays = Math.round(
      (new Date(last.reportedAt).getTime() - new Date(last.periodEnd).getTime()) / 86_400_000,
    )
    console.log(`   jeda        : ${lagDays} hari setelah tutup buku`)
    console.log(`   accession   : ${last.accession}`)

    // 7 — penyajian ulang
    const byPeriod = new Map<string, number>()
    for (const r of rows) byPeriod.set(r.periodEnd, (byPeriod.get(r.periodEnd) ?? 0) + 1)
    const restated = [...byPeriod.entries()].filter(([, n]) => n > 1)
    console.log(`7. Penyajian ulang: ${restated.length} periode punya lebih dari satu versi`)
    if (restated.length > 0) {
      const [period, n] = restated[restated.length - 1]
      const versions = rows.filter((r) => r.periodEnd === period)
      console.log(`   contoh ${period}: ${n} versi`)
      for (const v of versions) {
        const rev = v.items['pendapatan']
        console.log(
          `     terbit ${v.reportedAt} (${v.form}) pendapatan = ${rev !== undefined ? rev.toLocaleString('en-US') : 'n/a'}`,
        )
      }
    }

    // 8 — uji point-in-time yang sebenarnya
    const probe = last.reportedAt
    const dayBefore = new Date(new Date(probe).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10)
    const known = latestAsOf(rows, dayBefore)
    console.log(
      `8. Uji PIT     : pada ${dayBefore}, laporan terakhir yang sudah terbit = ${
        known ? known.periodEnd : 'tidak ada'
      }`,
    )
    console.log(`   (harus BUKAN ${last.periodEnd} — itu baru terbit ${probe})`)
    if (known?.periodEnd === last.periodEnd) {
      console.log('   ! GAGAL: kebocoran point-in-time terdeteksi')
    } else {
      console.log('   OK')
    }
  }

  // 9 — frames
  console.log('\n--- Frames (lintas penampang) ---')
  const frame = await fetchFrame('Assets', 'CY2024Q4I')
  console.log(`9. Assets CY2024Q4I : ${frame.length.toLocaleString('en-US')} emiten dalam satu panggilan`)
  if (frame.length > 0) {
    const top = [...frame].sort((a, b) => b.val - a.val).slice(0, 3)
    for (const e of top) {
      console.log(`   ${e.entityName}: ${(e.val / 1e9).toFixed(0)} miliar USD`)
    }
  }

  console.log('\nSelesai.\n')
}

main().catch((err) => {
  console.error('\nProbe gagal:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
