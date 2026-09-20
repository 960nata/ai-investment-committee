/**
 * Engine skor.
 *
 * Inilah yang sebenarnya dimaksud "cara sistem ini memprediksi". Tidak ada model
 * bahasa di jalur ini sama sekali. Yang ada empat langkah aritmetika yang bisa
 * dihitung ulang persis sama kapan pun:
 *
 *   1. Tiap fitur sudah jadi robust z-score terhadap riwayat dua tahun instrumen
 *      itu sendiri, dipangkas di tiga simpangan.
 *   2. Tandanya diseragamkan supaya nilai lebih tinggi selalu berarti lebih
 *      baik. Fitur yang arahnya belum jelas tidak ikut dijumlah sama sekali.
 *   3. Rata-rata per kelompok, lalu jumlah tertimbang antar-kelompok.
 *   4. Dipetakan ke rentang −10 sampai +10.
 *
 * Yang sengaja BELUM ada: langkah kelima, kalibrasi skor mentah menjadi
 * probabilitas lewat regresi logistik pada hasil historis. Tanpa langkah itu,
 * skor hanyalah peringkat — ia bisa mengurutkan mana yang lebih kuat, tetapi
 * tidak berhak mengatakan "peluang naik 62%". Karena itu `probability` selalu
 * null di sini, dan antarmuka menampilkan skornya saja.
 *
 * Menampilkan angka persen tanpa kalibrasi adalah kebohongan yang terlihat
 * seperti presisi, dan itu justru jenis kesalahan yang paling merusak
 * kepercayaan di produk keuangan.
 */

import { FEATURES, applyDirection, type FeatureSpec } from '@/lib/features/registry'
import {
  GROUP_OF,
  GROUP_WEIGHTS,
  MODEL_VERSION,
  type Horizon,
  type ScoreGroup,
} from './weights'

/** Z-score dipangkas di ±3, jadi pengali ini memetakannya ke ±10. */
const Z_TO_SCORE = 10 / 3

export type ConfidenceLabel =
  | 'tinggi'
  | 'sedang'
  | 'rendah'
  | 'tidak memadai'
  | 'tidak berlaku'

export interface Driver {
  feature: string
  label: string
  group: ScoreGroup
  /** Sumbangan ke skor akhir, dalam satuan skor yang sama (−10..+10). */
  contribution: number
  /** Nilai mentah fitur, untuk ditelusuri pembaca. */
  raw: number | null
  percentile: number | null
}

export interface GroupBreakdown {
  group: ScoreGroup
  weight: number
  /** Null berarti kelompok ini belum punya satu pun fitur yang bisa dihitung. */
  score: number | null
  featuresUsed: number
}

export interface HorizonScore {
  horizon: Horizon
  /** −10 sampai +10. Peringkat, bukan ramalan. */
  score: number
  /**
   * Selalu null sampai kalibrasi berjalan. Bukan nol, bukan 0,5: keduanya
   * terbaca sebagai pernyataan, padahal yang benar adalah belum ada jawabannya.
   */
  probability: null
  confidence: ConfidenceLabel
  confidenceScore: number
  confidenceReasons: string[]
  /** Porsi bobot yang tidak punya data, 0..1. */
  missingWeight: number
  groups: GroupBreakdown[]
  drivers: { supporting: Driver[]; opposing: Driver[] }
}

export interface ScoreInput {
  /** Satu baris `feature_daily.values`. */
  values: Record<string, number | null>
  /**
   * Benar bila instrumen ini memang bisa punya laporan keuangan.
   *
   * Indeks, komoditi, dan emas tidak akan pernah punya, jadi bobot valuasi dan
   * pertumbuhan yang kosong pada mereka bukan kekurangan — dan labelnya harus
   * berbeda dari kekurangan yang memang menunggu diperbaiki.
   */
  hasFundamentals?: boolean
  /** Umur data dalam hari perdagangan. Dipakai menurunkan confidence. */
  staleDays: number
  /** Nilai transaksi harian rata-rata, dalam mata uang instrumen. */
  turnover?: number | null
  /** Ambang likuiditas yang dianggap memadai untuk pasar itu. */
  turnoverThreshold?: number
  /**
   * Arah hasil kalibrasi, menggantikan arah yang diasumsikan registry.
   *
   * Bila diisi untuk sebuah horizon, registry tidak dipakai sama sekali pada
   * horizon itu: fitur yang tidak ada di petanya tidak ikut skor. Itu disengaja
   * — peta ini hasil pengujian, dan fitur yang tidak lolos pengujian tidak
   * pantas diam-diam masuk lewat pintu belakang dengan tanda tebakan.
   *
   * Dipisah per horizon karena arahnya memang bisa berbeda. Pembalikan jangka
   * pendek dan penerusan jangka menengah adalah dua gejala yang sama-sama nyata,
   * dan memaksa satu tanda untuk keduanya berarti salah di salah satunya.
   */
  directions?: Partial<Record<Horizon, ReadonlyMap<string, 1 | -1>>>
}

export interface ScoreResult {
  modelVersion: string
  horizons: HorizonScore[]
}

const SCORED: FeatureSpec[] = FEATURES.filter((f) => f.role === 'score')

export function scoreInstrument(input: ScoreInput): ScoreResult {
  return {
    modelVersion: MODEL_VERSION,
    horizons: (['pendek', 'menengah', 'panjang'] as Horizon[]).map((h) => scoreHorizon(h, input)),
  }
}

/**
 * Seragamkan arah satu fitur, dari kalibrasi bila ada dan dari registry bila
 * tidak.
 */
function orient(
  name: string,
  raw: number | null,
  directions: ReadonlyMap<string, 1 | -1> | undefined,
): number | null {
  if (!directions) return applyDirection(name, raw)
  if (raw === null) return null
  const direction = directions.get(name)
  return direction === undefined ? null : raw * direction
}

function scoreHorizon(horizon: Horizon, input: ScoreInput): HorizonScore {
  const weights = GROUP_WEIGHTS[horizon]
  const { values } = input

  // --- langkah 1 dan 2: ambil z-score, seragamkan arahnya -------------------
  const oriented = new Map<ScoreGroup, { spec: FeatureSpec; z: number }[]>()

  for (const spec of SCORED) {
    // Fitur yang arahnya belum ditetapkan sengaja tidak ikut. Menebak tandanya
    // sama saja mengarang, dan tanda yang salah menarik skor ke arah keliru
    // dengan keyakinan penuh.
    const z = orient(spec.name, values[`${spec.name}_z`] ?? null, input.directions?.[horizon])
    if (z === null) continue

    const group = GROUP_OF[spec.group]
    const bucket = oriented.get(group) ?? []
    bucket.push({ spec, z })
    oriented.set(group, bucket)
  }

  // --- pengubah bobot dari ADX ----------------------------------------------
  // Di bawah dua puluh pasar sedang menyamping dan fitur tren jadi derau; di
  // atas dua puluh lima trennya nyata. ADX tidak pernah memberi arah, hanya
  // memberi tahu seberapa layak arah itu dipercaya.
  const adx = values.adx_14
  const trendMultiplier = adx === null || adx === undefined ? 1 : adx < 20 ? 0.6 : adx > 25 ? 1.25 : 1

  // --- langkah 3: rata-rata per kelompok, lalu jumlah tertimbang ------------
  const groups: GroupBreakdown[] = []
  let weighted = 0
  let availableWeight = 0
  let totalWeight = 0

  for (const [group, baseWeight] of Object.entries(weights) as [ScoreGroup, number][]) {
    const weight = group === 'momentum_tren' ? baseWeight * trendMultiplier : baseWeight
    totalWeight += baseWeight

    const bucket = oriented.get(group) ?? []
    if (baseWeight === 0 || bucket.length === 0) {
      groups.push({ group, weight: baseWeight, score: null, featuresUsed: 0 })
      continue
    }

    const mean = bucket.reduce((sum, f) => sum + f.z, 0) / bucket.length
    groups.push({ group, weight: baseWeight, score: round(mean * Z_TO_SCORE), featuresUsed: bucket.length })

    weighted += weight * mean
    availableWeight += baseWeight
  }

  // Bobot yang hilang didistribusikan ulang, bukan diperlakukan sebagai nol.
  // Nol berarti "netral", padahal yang benar adalah "tidak tahu", dan keduanya
  // menghasilkan skor yang berbeda.
  const score = availableWeight === 0 ? 0 : round((weighted / availableWeight) * Z_TO_SCORE)
  const missingWeight = totalWeight === 0 ? 1 : 1 - availableWeight / totalWeight

  // --- pendorong utama ------------------------------------------------------
  const drivers: Driver[] = []
  for (const [group, bucket] of oriented) {
    const baseWeight = weights[group]
    if (baseWeight === 0 || availableWeight === 0) continue

    const weight = group === 'momentum_tren' ? baseWeight * trendMultiplier : baseWeight
    const share = weight / bucket.length / availableWeight

    for (const { spec, z } of bucket) {
      drivers.push({
        feature: spec.name,
        label: spec.label,
        group,
        contribution: round(z * share * Z_TO_SCORE),
        raw: values[spec.name] ?? null,
        percentile: values[`${spec.name}_pctile`] ?? null,
      })
    }
  }

  const sorted = [...drivers].sort((a, b) => b.contribution - a.contribution)

  return {
    horizon,
    score,
    probability: null,
    ...assessConfidence(input, missingWeight, groups),
    missingWeight: round(missingWeight),
    groups,
    drivers: {
      supporting: sorted.filter((d) => d.contribution > 0).slice(0, 3),
      // Penentang selalu ditampilkan. Sistem yang hanya menunjukkan alasan
      // setuju adalah alat jualan, bukan alat analisis.
      opposing: sorted.filter((d) => d.contribution < 0).reverse().slice(0, 3),
    },
  }
}

/**
 * Confidence: seberapa layak skor tadi dipercaya.
 *
 * Bentuknya perkalian, bukan penjumlahan tertimbang, dan itu disengaja. Satu
 * faktor yang sangat buruk sudah cukup menjatuhkan seluruhnya: instrumen dengan
 * data lengkap dan sampel besar tetapi likuiditas nyaris nol tetap tidak layak
 * dipercaya, dan penjumlahan akan menyembunyikan fakta itu di balik rata-rata.
 */
function assessConfidence(
  input: ScoreInput,
  missingWeight: number,
  groups: GroupBreakdown[],
): { confidence: ConfidenceLabel; confidenceScore: number; confidenceReasons: string[] } {
  const reasons: string[] = []

  // Bobot yang memang tidak berlaku tidak dihitung sebagai lubang. Menghukum
  // indeks karena tidak punya neraca sama saja menghukumnya karena bukan saham.
  const applicable = input.hasFundamentals !== false
  const inapplicable = applicable ? 0 : notApplicableWeight(groups)
  const genuinelyMissing = Math.max(0, missingWeight - inapplicable)

  const cData = 1 - genuinelyMissing
  if (genuinelyMissing > 0.3) {
    reasons.push(`${Math.round(genuinelyMissing * 100)}% bobot belum punya data`)
  }
  if (inapplicable > 0) {
    reasons.push(`${Math.round(inapplicable * 100)}% bobot tidak berlaku untuk jenis aset ini`)
  }

  let cLikuiditas = 1
  if (input.turnover != null && input.turnoverThreshold) {
    cLikuiditas = Math.min(1, Math.log(1 + input.turnover / input.turnoverThreshold) / Math.log(2))
    if (cLikuiditas < 0.7) reasons.push('likuiditas harian di bawah ambang')
  }

  // Kelompok yang saling bertentangan arah menandakan bukti yang tidak sejalan.
  const arah = groups.filter((g) => g.score !== null).map((g) => Math.sign(g.score!))
  const positif = arah.filter((s) => s > 0).length
  const negatif = arah.filter((s) => s < 0).length
  const cKonsensus = arah.length === 0 ? 1 : 1 - Math.min(positif, negatif) / arah.length
  if (cKonsensus < 0.7) reasons.push('kelompok fitur saling bertentangan arah')

  const cKesegaran = Math.max(0, 1 - input.staleDays / 5)
  if (input.staleDays > 1) reasons.push(`data berumur ${input.staleDays} hari perdagangan`)

  const raw = cData * cLikuiditas * cKonsensus * cKesegaran

  // Tidak ada rekam jejak sama sekali, dan itu selalu disebut. Sistem yang
  // belum pernah diuji tidak boleh terdengar yakin.
  reasons.push('belum dikalibrasi, belum ada rekam jejak')

  // Kalau seluruh sisa bobot memang tidak berlaku dan yang tersedia sudah
  // terpakai, labelnya bukan "tidak memadai" melainkan "tidak berlaku".
  const nothingLeftToGet = !applicable && genuinelyMissing < 0.05 && raw < 0.15

  return {
    confidence: nothingLeftToGet
      ? 'tidak berlaku'
      : raw >= 0.6
        ? 'tinggi'
        : raw >= 0.35
          ? 'sedang'
          : raw >= 0.15
            ? 'rendah'
            : 'tidak memadai',
    confidenceScore: round(raw),
    confidenceReasons: reasons,
  }
}

/** Porsi bobot yang kosong semata karena jenis asetnya, bukan karena data hilang. */
function notApplicableWeight(groups: GroupBreakdown[]): number {
  const fundamental: ScoreGroup[] = ['valuasi', 'pertumbuhan']
  return groups
    .filter((g) => fundamental.includes(g.group) && g.score === null)
    .reduce((sum, g) => sum + g.weight, 0)
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4
}
