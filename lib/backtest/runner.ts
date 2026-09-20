/**
 * Runner backtest.
 *
 * Menjawab satu pertanyaan yang belum pernah dijawab sistem ini: apakah skornya
 * punya daya prediksi sama sekali.
 *
 * Tidak ada penyetelan di sini. Yang ada kalibrasi maju: arah tiap fitur
 * ditaksir dari data sebelum periode uji, lalu dipakai apa adanya di periode
 * sesudahnya. Bedanya halus tapi menentukan — penyetelan memilih parameter
 * karena hasilnya bagus di data yang sama, kalibrasi menetapkan parameter dari
 * masa lalu lalu menerima apa pun hasilnya di masa depan.
 *
 * Keduanya dilaporkan berdampingan: skor dengan arah yang diasumsikan registry,
 * dan skor dengan arah hasil kalibrasi. Kalau yang terkalibrasi tidak lebih
 * baik, itu juga jawaban.
 *
 * Empat perlindungan terhadap look-ahead:
 * nilai fitur hanya dihitung dari data sampai hari itu; laporan keuangan
 * disaring menurut tanggal terbit; imbal hasil ke depan selalu diambil dari
 * harga setelah tanggal keputusan; dan antara akhir periode latih dan awal
 * periode uji dipasang jarak sepanjang horizon, supaya pengamatan latih
 * terakhir tidak mengetahui harga di dalam periode uji.
 */

import { getCandles, getFeatures, listInstruments } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { FEATURES, applyDirection } from '@/lib/features/registry'
import {
  judgeDirection,
  walkForwardFolds,
  type FeatureDirection,
} from '@/lib/scoring/calibration'
import { scoreInstrument } from '@/lib/scoring/engine'
import { fundamentalsApply, HORIZONS, MODEL_VERSION, type Horizon } from '@/lib/scoring/weights'
import { evaluate, spearman, type EvaluationResult, type ForwardObservation } from './metrics'

export interface FeatureIc {
  feature: string
  label: string
  ic: number | null
  n: number
}

export interface FoldReport {
  from: string
  to: string
  trainDates: number
  featuresUsed: number
  featuresDropped: number
}

export interface BacktestResult {
  modelVersion: string
  featureSetVersion: string
  market: MarketCode
  instruments: number
  from: string | null
  to: string | null
  /** Hasil dengan arah hasil kalibrasi maju. Ini angka utamanya. */
  horizons: Record<Horizon, EvaluationResult>
  /** Hasil dengan arah yang diasumsikan registry, atas baris uji yang sama. */
  assumed: Record<Horizon, EvaluationResult>
  featureIc: Record<Horizon, FeatureIc[]>
  /** Apa yang dipelajari kalibrasi di lipatan terakhir. */
  calibration: Record<Horizon, FeatureDirection[]>
  folds: Record<Horizon, FoldReport[]>
  /** Dipecah per kondisi pasar, karena banyak sinyal hanya bekerja saat naik. */
  byRegime: Record<Horizon, Record<'naik' | 'turun' | 'menyamping', EvaluationResult>>
}

/** Ambang pemisah rezim, diukur dari imbal hasil rata-rata seluruh instrumen. */
const REGIME_THRESHOLD = 0.02

/** Banyaknya lipatan maju. */
const FOLDS = 5

/** Bagian awal riwayat yang disisihkan untuk latih pertama. */
const MIN_TRAIN_RATIO = 0.4

const SCORED = FEATURES.filter((f) => f.role === 'score')

export async function runBacktest(input: {
  market: MarketCode
  /** Batasi jumlah instrumen untuk jalan cepat. */
  limit?: number
}): Promise<BacktestResult> {
  const instruments = (await listInstruments(input.market)).slice(0, input.limit)
  const nFeat = SCORED.length

  // Baris disimpan datar, bukan sebagai objek per baris. Delapan puluh ribu
  // objek berisi lima puluh tujuh kunci menghabiskan ratusan megabita; larik
  // datar berisi angka yang sama menghabiskan puluhan.
  const zFlat: number[] = []
  const fwdFlat: number[] = []
  const adxOf: number[] = []
  const dateOf: string[] = []
  const fundOf: boolean[] = []

  for (const instrument of instruments) {
    const features = await getFeatures(instrument.id, FEATURE_SET_VERSION, '1900-01-01', '2999-12-31')
    if (features.length === 0) continue

    const candles = await getCandles(instrument.id, '1900-01-01', '2999-12-31')
    const closes = candles.map((c) => Number(c.close))
    const dateIndex = new Map(candles.map((c, i) => [c.date, i]))
    const hasFundamentals = fundamentalsApply(instrument.assetClass)

    for (const row of features) {
      const i = dateIndex.get(row.date)
      if (i === undefined || closes[i] <= 0) continue

      dateOf.push(row.date)
      fundOf.push(hasFundamentals)
      const adx = row.values.adx_14
      adxOf.push(typeof adx === 'number' ? adx : Number.NaN)

      for (const spec of SCORED) {
        const value = row.values[`${spec.name}_z`]
        zFlat.push(typeof value === 'number' ? value : Number.NaN)
      }

      // Imbal hasil ke depan diambil dari harga SETELAH tanggal keputusan.
      // Tanpa jeda ini, skor hari itu dinilai dengan harga hari itu juga.
      for (const { days } of HORIZONS) {
        const j = i + days
        fwdFlat.push(j >= closes.length ? Number.NaN : closes[j] / closes[i] - 1)
      }
    }
  }

  const rows = dateOf.length
  const z = Float64Array.from(zFlat)
  const fwd = Float64Array.from(fwdFlat)

  const allDates = [...new Set(dateOf)].sort()
  const dateRank = new Map(allDates.map((d, i) => [d, i]))
  const dateIdxOf = Int32Array.from(dateOf, (d) => dateRank.get(d)!)

  // Baris dikelompokkan per tanggal sekali di awal. Seluruh perhitungan
  // berikutnya bekerja per tanggal, dan mengulang pengelompokan di tiap
  // lipatan berarti mengulang pekerjaan yang sama lima belas kali.
  const rowsOnDate: number[][] = allDates.map(() => [])
  for (let r = 0; r < rows; r++) rowsOnDate[dateIdxOf[r]].push(r)

  const marketReturn = new Map<string, number[]>()
  for (let r = 0; r < rows; r++) {
    const value = fwd[r * HORIZONS.length]
    if (!Number.isFinite(value)) continue
    const bucket = marketReturn.get(dateOf[r]) ?? []
    bucket.push(value)
    marketReturn.set(dateOf[r], bucket)
  }

  const regimeOf = new Map<string, 'naik' | 'turun' | 'menyamping'>()
  for (const [date, returns] of marketReturn) {
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length
    regimeOf.set(
      date,
      mean > REGIME_THRESHOLD ? 'naik' : mean < -REGIME_THRESHOLD ? 'turun' : 'menyamping',
    )
  }

  const horizons = {} as Record<Horizon, EvaluationResult>
  const assumed = {} as Record<Horizon, EvaluationResult>
  const featureIc = {} as Record<Horizon, FeatureIc[]>
  const calibration = {} as Record<Horizon, FeatureDirection[]>
  const folds = {} as Record<Horizon, FoldReport[]>
  const byRegime = {} as BacktestResult['byRegime']

  for (let h = 0; h < HORIZONS.length; h++) {
    const { id: horizon, days } = HORIZONS[h]

    // IC tiap fitur pada tiap tanggal dihitung sekali di sini. Lipatan hanya
    // merata-rata bagian masa lalunya, jadi mengkalibrasi lima kali tidak
    // berarti menghitung lima kali.
    const icGrid = new Float64Array(nFeat * allDates.length).fill(Number.NaN)
    const zBuf = new Float64Array(instruments.length || 1)
    const fBuf = new Float64Array(instruments.length || 1)

    for (let d = 0; d < allDates.length; d++) {
      const onDate = rowsOnDate[d]
      if (onDate.length < 3) continue

      for (let f = 0; f < nFeat; f++) {
        let n = 0
        for (const r of onDate) {
          const value = z[r * nFeat + f]
          const forward = fwd[r * HORIZONS.length + h]
          if (!Number.isFinite(value) || !Number.isFinite(forward)) continue
          if (n >= zBuf.length) break
          zBuf[n] = value
          fBuf[n] = forward
          n++
        }
        if (n < 3) continue
        const ic = spearman(zBuf.subarray(0, n), fBuf.subarray(0, n))
        if (ic !== null) icGrid[f * allDates.length + d] = ic
      }
    }

    // Laporan IC memakai arah yang diasumsikan, supaya tanda negatif berarti
    // "asumsinya keliru" dan bukan sekadar "fiturnya menurun".
    featureIc[horizon] = SCORED.map((spec, f) => {
      const daily: number[] = []
      for (let d = 0; d < allDates.length; d++) {
        const value = icGrid[f * allDates.length + d]
        if (Number.isFinite(value)) daily.push(value)
      }
      const mean = daily.length === 0 ? null : daily.reduce((s, v) => s + v, 0) / daily.length
      const oriented = mean === null ? null : applyDirection(spec.name, mean)
      return {
        feature: spec.name,
        label: spec.label,
        ic: oriented,
        n: daily.length,
      }
    }).sort((a, b) => Math.abs(b.ic ?? 0) - Math.abs(a.ic ?? 0))

    const plan = walkForwardFolds(allDates.length, days, FOLDS, MIN_TRAIN_RATIO)
    const calibrated: ForwardObservation[] = []
    const baseline: ForwardObservation[] = []
    const foldReports: FoldReport[] = []
    let lastCalibration: FeatureDirection[] = []

    for (const fold of plan) {
      // Kalibrasi hanya membaca kolom tanggal sebelum `trainEnd`. Tidak ada
      // satu pun baris periode uji yang tersentuh di sini.
      const learned = SCORED.map((spec, f) => {
        const daily: number[] = []
        let dates = 0
        for (let d = 0; d < fold.trainEnd; d++) {
          const value = icGrid[f * allDates.length + d]
          if (!Number.isFinite(value)) continue
          daily.push(value)
          dates++
        }
        return judgeDirection(spec.name, daily, dates, days)
      })

      const directions = new Map<string, 1 | -1>()
      for (const item of learned) {
        if (item.direction !== null) directions.set(item.feature, item.direction)
      }

      lastCalibration = learned
      foldReports.push({
        from: allDates[fold.testStart],
        to: allDates[fold.testEnd - 1],
        trainDates: fold.trainEnd,
        featuresUsed: directions.size,
        featuresDropped: nFeat - directions.size,
      })

      for (let d = fold.testStart; d < fold.testEnd; d++) {
        for (const r of rowsOnDate[d]) {
          const forward = fwd[r * HORIZONS.length + h]
          if (!Number.isFinite(forward)) continue

          const values = valuesOf(z, r, nFeat, adxOf[r])
          const shared = { values, hasFundamentals: fundOf[r], staleDays: 0 }

          const withCalibration = scoreInstrument({
            ...shared,
            directions: { [horizon]: directions },
          }).horizons.find((x) => x.horizon === horizon)!.score
          const withAssumption = scoreInstrument(shared).horizons.find(
            (x) => x.horizon === horizon,
          )!.score

          calibrated.push({ score: withCalibration, forwardReturn: forward, date: allDates[d] })
          baseline.push({ score: withAssumption, forwardReturn: forward, date: allDates[d] })
        }
      }
    }

    horizons[horizon] = evaluate(calibrated, days)
    assumed[horizon] = evaluate(baseline, days)
    calibration[horizon] = lastCalibration.sort(
      (a, b) => Math.abs(b.ic ?? 0) - Math.abs(a.ic ?? 0),
    )
    folds[horizon] = foldReports

    // Pemecahan per rezim mengungkap sinyal yang sebenarnya hanya mengikuti
    // arus: banyak yang terlihat hebat karena diuji di periode pasar naik saja.
    byRegime[horizon] = {
      naik: evaluate(calibrated.filter((o) => regimeOf.get(o.date) === 'naik'), days),
      turun: evaluate(calibrated.filter((o) => regimeOf.get(o.date) === 'turun'), days),
      menyamping: evaluate(
        calibrated.filter((o) => regimeOf.get(o.date) === 'menyamping'),
        days,
      ),
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    featureSetVersion: FEATURE_SET_VERSION,
    market: input.market,
    instruments: instruments.length,
    from: allDates[0] ?? null,
    to: allDates[allDates.length - 1] ?? null,
    horizons,
    assumed,
    featureIc,
    calibration,
    folds,
    byRegime,
  }
}

/**
 * Bangun ulang objek nilai untuk satu baris.
 *
 * Dibuat saat dibutuhkan, bukan disimpan. Baris uji hanya dinilai sekali per
 * horizon, jadi menyimpan delapan puluh ribu objek demi menghemat pembuatan
 * yang sekali itu adalah pertukaran yang salah arah.
 */
function valuesOf(
  z: Float64Array,
  row: number,
  nFeat: number,
  adx: number,
): Record<string, number | null> {
  const values: Record<string, number | null> = {}
  for (let f = 0; f < nFeat; f++) {
    const value = z[row * nFeat + f]
    values[`${SCORED[f].name}_z`] = Number.isFinite(value) ? value : null
  }
  values.adx_14 = Number.isFinite(adx) ? adx : null
  return values
}
