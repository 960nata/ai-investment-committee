/**
 * Jalankan backtest — npm run backtest <pasar> [--limit N]
 *
 * Melaporkan hasilnya apa adanya, termasuk ketika buruk. Backtest yang dipakai
 * menyetel parameter sampai angkanya bagus bukan pengukuran melainkan
 * pencocokan, dan hasilnya tidak pernah bertahan di luar data itu.
 */

import './load-env'
import { runBacktest } from '../lib/backtest/runner'
import { describeIc } from '../lib/backtest/metrics'
import { saveBacktestRun } from '../lib/db/queries'
import type { MarketCode } from '../lib/db/schema'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function pct(v: number | null, digits = 1): string {
  return v === null ? '—' : `${(v * 100).toFixed(digits)}%`
}

async function main(): Promise<void> {
  const market = (process.argv[2] ?? 'US').toUpperCase() as MarketCode
  const limit = flag('limit') ? Number(flag('limit')) : undefined

  console.log(`\nBacktest ${market}${limit ? ` (${limit} instrumen)` : ''}`)
  const started = Date.now()
  const result = await runBacktest({ market, limit })

  console.log(`  ${result.instruments} instrumen · ${result.from} sampai ${result.to}`)
  console.log(`  model ${result.modelVersion} · fitur ${result.featureSetVersion}`)

  console.log('\nHorizon        N      N efektif  hit rate  naif    IC      ICIR   desil atas-bawah')
  for (const [horizon, m] of Object.entries(result.horizons)) {
    console.log(
      `  ${horizon.padEnd(11)} ${String(m.n).padStart(6)} ${String(m.effectiveN).padStart(10)}` +
        `  ${pct(m.hitRate).padStart(8)}  ${pct(m.baseRate).padStart(6)}` +
        `  ${(m.ic === null ? '—' : m.ic.toFixed(3)).padStart(6)}` +
        `  ${(m.icir === null ? '—' : m.icir.toFixed(2)).padStart(5)}` +
        `  ${pct(m.topMinusBottom, 2).padStart(10)}`,
    )
  }

  console.log('\nApakah mengalahkan tebakan naif?')
  for (const [horizon, m] of Object.entries(result.horizons)) {
    const verdict =
      m.hitRate === null || m.baseRate === null
        ? 'belum bisa dinilai'
        : m.hitRate > m.baseRate
          ? `ya, unggul ${((m.hitRate - m.baseRate) * 100).toFixed(1)} poin`
          : `TIDAK, tertinggal ${((m.baseRate - m.hitRate) * 100).toFixed(1)} poin`
    console.log(`  ${horizon.padEnd(11)} ${verdict}`)
  }

  console.log('\nLima fitur ber-IC tertinggi, horizon menengah')
  for (const f of result.featureIc.menengah.slice(0, 5)) {
    console.log(
      `  ${f.label.padEnd(34)} ${(f.ic === null ? '—' : f.ic.toFixed(4)).padStart(8)}  ${describeIc(f.ic)}`,
    )
  }

  console.log('\nPer kondisi pasar, horizon menengah')
  for (const [regime, m] of Object.entries(result.byRegime.menengah)) {
    console.log(`  ${regime.padEnd(12)} n=${String(m.n).padStart(6)}  hit ${pct(m.hitRate).padStart(7)}  IC ${(m.ic === null ? '—' : m.ic.toFixed(3)).padStart(6)}`)
  }

  const id = await saveBacktestRun({
    modelVersion: result.modelVersion,
    featureSetVersion: result.featureSetVersion,
    market: result.market,
    config: { instruments: result.instruments, from: result.from, to: result.to, limit: limit ?? null },
    metrics: { horizons: result.horizons, featureIc: result.featureIc, byRegime: result.byRegime },
  })

  console.log(`\nTersimpan sebagai backtest #${id}, selesai dalam ${((Date.now() - started) / 1000).toFixed(0)} detik\n`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nGagal: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
