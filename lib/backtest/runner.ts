/**
 * Runner backtest.
 *
 * Menjawab satu pertanyaan yang belum pernah dijawab sistem ini: apakah skornya
 * punya daya prediksi sama sekali.
 *
 * Tidak ada penyetelan di sini. Runner memakai bobot dan fitur apa adanya, lalu
 * melaporkan hasilnya termasuk ketika hasilnya buruk. Backtest yang dipakai
 * untuk menyetel parameter sampai angkanya bagus bukan pengukuran, melainkan
 * pencocokan — dan hasilnya tidak bertahan di luar data yang dipakai menyetel.
 *
 * Dua perlindungan terhadap look-ahead sudah ada sebelum berkas ini:
 * nilai fitur hanya dihitung dari data sampai hari itu, dan laporan keuangan
 * disaring menurut tanggal terbit. Yang ditambahkan di sini perlindungan ketiga,
 * yaitu imbal hasil ke depan selalu diambil dari harga setelah tanggal
 * keputusan, tidak pernah termasuk harganya sendiri.
 */

import { getCandles, getFeatures, listInstruments } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { FEATURES, applyDirection } from '@/lib/features/registry'
import { scoreInstrument } from '@/lib/scoring/engine'
import { fundamentalsApply, HORIZONS, MODEL_VERSION, type Horizon } from '@/lib/scoring/weights'
import { evaluate, spearman, type EvaluationResult, type ForwardObservation } from './metrics'

export interface FeatureIc {
  feature: string
  label: string
  ic: number | null
  n: number
}

export interface BacktestResult {
  modelVersion: string
  featureSetVersion: string
  market: MarketCode
  instruments: number
  from: string | null
  to: string | null
  horizons: Record<Horizon, EvaluationResult>
  featureIc: Record<Horizon, FeatureIc[]>
  /** Dipecah per kondisi pasar, karena banyak sinyal hanya bekerja saat naik. */
  byRegime: Record<Horizon, Record<'naik' | 'turun' | 'menyamping', EvaluationResult>>
}

/** Ambang pemisah rezim, diukur dari imbal hasil rata-rata seluruh instrumen. */
const REGIME_THRESHOLD = 0.02

export async function runBacktest(input: {
  market: MarketCode
  /** Batasi jumlah instrumen untuk jalan cepat. */
  limit?: number
}): Promise<BacktestResult> {
  const instruments = (await listInstruments(input.market)).slice(0, input.limit)

  const observations: Record<Horizon, ForwardObservation[]> = {
    pendek: [],
    menengah: [],
    panjang: [],
  }
  // Dikelompokkan menurut tanggal, bukan ditumpuk jadi satu kolam.
  // Menghitung korelasi sekali atas seluruh data mencampur perbandingan
  // antar-instrumen dengan perbandingan antar-waktu, dan hasilnya membengkak
  // sampai terlihat seperti kebocoran data padahal hanya salah hitung.
  const featureValues: Record<Horizon, Map<string, Map<string, { z: number; fwd: number }[]>>> = {
    pendek: new Map(),
    menengah: new Map(),
    panjang: new Map(),
  }

  // Imbal hasil pasar per tanggal, dipakai menentukan rezim. Dikumpulkan sambil
  // jalan supaya tidak perlu satu lintasan tambahan.
  const marketReturn = new Map<string, number[]>()

  let earliest: string | null = null
  let latest: string | null = null

  for (const instrument of instruments) {
    const features = await getFeatures(instrument.id, FEATURE_SET_VERSION, '1900-01-01', '2999-12-31')
    if (features.length === 0) continue

    const candles = await getCandles(instrument.id, '1900-01-01', '2999-12-31')
    const closes = candles.map((c) => Number(c.close))
    const dateIndex = new Map(candles.map((c, i) => [c.date, i]))

    const hasFundamentals = fundamentalsApply(instrument.assetClass)

    for (const row of features) {
      const i = dateIndex.get(row.date)
      if (i === undefined) continue

      if (earliest === null || row.date < earliest) earliest = row.date
      if (latest === null || row.date > latest) latest = row.date

      const scored = scoreInstrument({
        values: row.values,
        hasFundamentals,
        staleDays: 0,
      })

      for (const { id: horizon, days } of HORIZONS) {
        const j = i + days
        // Imbal hasil ke depan diambil dari harga SETELAH tanggal keputusan.
        // Tanpa jeda ini, skor hari itu dinilai dengan harga hari itu juga.
        if (j >= closes.length || closes[i] <= 0) continue

        const forwardReturn = closes[j] / closes[i] - 1
        const score = scored.horizons.find((h) => h.horizon === horizon)!.score

        observations[horizon].push({ score, forwardReturn, date: row.date })

        if (horizon === 'pendek') {
          const bucket = marketReturn.get(row.date) ?? []
          bucket.push(forwardReturn)
          marketReturn.set(row.date, bucket)
        }

        // IC per fitur: satu-satunya cara tahu fitur mana yang benar-benar
        // bekerja, dan mana yang hanya menambah derau ke dalam skor.
        for (const spec of FEATURES) {
          if (spec.role !== 'score') continue
          const z = applyDirection(spec.name, row.values[`${spec.name}_z`] ?? null)
          if (z === null) continue

          const perDate = featureValues[horizon].get(spec.name) ?? new Map()
          const list = perDate.get(row.date) ?? []
          list.push({ z, fwd: forwardReturn })
          perDate.set(row.date, list)
          featureValues[horizon].set(spec.name, perDate)
        }
      }
    }
  }

  const regimeOf = new Map<string, 'naik' | 'turun' | 'menyamping'>()
  for (const [date, returns] of marketReturn) {
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length
    regimeOf.set(date, mean > REGIME_THRESHOLD ? 'naik' : mean < -REGIME_THRESHOLD ? 'turun' : 'menyamping')
  }

  const horizons = {} as Record<Horizon, EvaluationResult>
  const featureIc = {} as Record<Horizon, FeatureIc[]>
  const byRegime = {} as BacktestResult['byRegime']

  for (const { id: horizon, days } of HORIZONS) {
    horizons[horizon] = evaluate(observations[horizon], days)

    featureIc[horizon] = [...featureValues[horizon].entries()]
      .map(([name, perDate]) => {
        // IC dihitung per tanggal lalu dirata-rata: pada tiap hari, seberapa
        // baik fitur ini mengurutkan instrumen menurut imbal hasil berikutnya.
        const daily: number[] = []
        let total = 0

        for (const pairs of perDate.values()) {
          total += pairs.length
          const value = spearman(pairs.map((p) => p.z), pairs.map((p) => p.fwd))
          if (value !== null) daily.push(value)
        }

        return {
          feature: name,
          label: FEATURES.find((f) => f.name === name)?.label ?? name,
          ic: daily.length === 0 ? null : daily.reduce((s, v) => s + v, 0) / daily.length,
          n: total,
        }
      })
      .sort((a, b) => Math.abs(b.ic ?? 0) - Math.abs(a.ic ?? 0))

    // Pemecahan per rezim mengungkap sinyal yang sebenarnya hanya mengikuti
    // arus: banyak yang terlihat hebat karena diuji di periode pasar naik saja.
    byRegime[horizon] = {
      naik: evaluate(observations[horizon].filter((o) => regimeOf.get(o.date) === 'naik'), days),
      turun: evaluate(observations[horizon].filter((o) => regimeOf.get(o.date) === 'turun'), days),
      menyamping: evaluate(
        observations[horizon].filter((o) => regimeOf.get(o.date) === 'menyamping'),
        days,
      ),
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    featureSetVersion: FEATURE_SET_VERSION,
    market: input.market,
    instruments: instruments.length,
    from: earliest,
    to: latest,
    horizons,
    featureIc,
    byRegime,
  }
}
