/**
 * Job normalisasi lintas penampang.
 *
 * Berjalan setelah job fitur, membaca kembali `feature_daily`, dan menyisipkan
 * kunci `_zcs` dan `_pcs` ke baris yang sudah ada. Ia tidak pernah membuat baris
 * baru: nilai lintas penampang adalah keterangan tambahan bagi fitur yang sudah
 * dihitung, bukan fitur yang berdiri sendiri.
 *
 * Hanya rasio valuasi yang diperlakukan begini, dan alasannya ada di
 * `cross-section.ts`: persentil terhadap riwayat sendiri menjawab pertanyaan
 * yang benar untuk momentum, tetapi tidak untuk valuasi. Menambahkan momentum ke
 * sini berarti membayar ruang penyimpanan untuk angka yang sudah dijawab kolom
 * lain.
 */

import {
  listFeatureDates,
  loadCrossSectionRows,
  mergeFeatureValues,
  type FeaturePatch,
} from '@/lib/db/queries'
import type { AssetClass } from '@/lib/db/schema'
import { FEATURE_SET_VERSION } from './compute'
import { normaliseCrossSection } from './cross-section'

/**
 * Fitur yang dibandingkan antar sesama.
 *
 * Tujuh rasio valuasi, tidak lebih. Daftarnya sengaja ditulis manual dan bukan
 * disaring dari registry berdasarkan `group === 'valuasi'`: kalau nanti ada
 * fitur valuasi yang tidak masuk akal dibandingkan antar emiten, ia cukup tidak
 * ditulis di sini tanpa perlu menambah penanda baru di registry.
 */
const CROSS_SECTION_FEATURES = [
  'per',
  'pbv',
  'psr',
  'ev_ebitda',
  'earnings_yield',
  'fcf_yield',
  'dividend_yield',
] as const

/**
 * Rasio yang kehilangan arti begitu penyebutnya negatif.
 *
 * Rasio harga terhadap laba −31 bukan "lebih murah" dari 8; ia berarti emiten
 * itu rugi, dan besarnya angka hanya mencerminkan seberapa dekat labanya ke nol.
 * Diurutkan apa adanya, emiten paling merugi justru menempati peringkat termurah
 * — persis kebalikan dari yang dimaksud. Versi pertama job ini melakukan itu:
 * pada 18 September 2026, dua emiten rugi menempati persentil 0,02 sektornya.
 *
 * Nilainya dikosongkan, bukan dibalik atau dijepit ke nol, karena memang tidak
 * ada informasi valuasi di sana. Kabar "emiten ini rugi" sudah dibawa imbal hasil
 * laba, yang negatifnya berarti persis apa yang tertulis dan ikut terurut dengan
 * benar.
 */
const POSITIVE_ONLY = new Set(['per', 'pbv', 'psr', 'ev_ebitda'])

/**
 * Kelas aset yang diproses.
 *
 * Hanya saham. Rasio harga terhadap laba tidak ada untuk koin, emas, maupun
 * indeks, dan kelas-kelas itu sudah terdaftar di `WITHOUT_FUNDAMENTALS`.
 */
const ASSET_CLASSES: AssetClass[] = ['saham']

/**
 * Berapa tanggal terakhir yang diproses bila tidak diminta lain.
 *
 * Bukan seluruh riwayat, dan itu disengaja. Nilai lintas penampang dipakai skor
 * yang sedang berjalan dan tampilan "di persentil sekian sektornya"; backtest
 * memakai fitur deret waktu, bukan ini. Memperbarui seluruh riwayat berarti
 * menulis ulang puluhan ribu baris berukuran kilobyte-an demi angka yang tidak
 * dibaca siapa pun — dan setiap penulisan ulang meninggalkan versi lama baris
 * itu sampai VACUUM membersihkannya.
 */
const DEFAULT_DATES = 10

export interface CrossSectionJobResult {
  datesProcessed: number
  rowsUpdated: number
  /** Tanggal yang dilewati karena pesertanya terlalu sedikit untuk dibandingkan. */
  skipped: { date: string; assetClass: AssetClass; reason: string }[]
  errors: string[]
}

export interface CrossSectionJobInput {
  featureSetVersion?: string
  /** Proses tanggal mulai dari sini. Dikosongkan berarti sepuluh tanggal terakhir. */
  from?: string
  to?: string
}

export async function runCrossSectionJob(
  input: CrossSectionJobInput = {},
): Promise<CrossSectionJobResult> {
  const version = input.featureSetVersion ?? FEATURE_SET_VERSION
  const to = input.to ?? isoToday()
  const from = input.from ?? '1900-01-01'

  const result: CrossSectionJobResult = {
    datesProcessed: 0,
    rowsUpdated: 0,
    skipped: [],
    errors: [],
  }

  const allDates = await listFeatureDates(version, from, to)
  const dates = input.from ? allDates : allDates.slice(0, DEFAULT_DATES)

  for (const date of dates) {
    for (const assetClass of ASSET_CLASSES) {
      try {
        const rows = await loadCrossSectionRows(version, date, assetClass)

        if (rows.length === 0) continue

        const normalised = normaliseCrossSection(
          rows.map((r) => ({
            instrumentId: r.instrumentId,
            peerGroup: r.peerGroup,
            values: withoutMeaninglessRatios(r.values),
          })),
          [...CROSS_SECTION_FEATURES],
        )

        // Baris yang seluruh nilainya kosong tidak ditulis. Menyimpan tujuh
        // belas kunci bernilai null untuk instrumen tanpa data fundamental
        // hanya menambah ukuran baris tanpa menambah keterangan apa pun.
        const patches: FeaturePatch[] = []
        for (const row of normalised) {
          const hasValue = Object.values(row.values).some((v) => v !== null)
          if (!hasValue) continue
          patches.push({ instrumentId: row.instrumentId, date, values: row.values })
        }

        if (patches.length === 0) {
          result.skipped.push({
            date,
            assetClass,
            reason: `${rows.length} instrumen, tidak satu pun punya rasio valuasi`,
          })
          continue
        }

        result.rowsUpdated += await mergeFeatureValues(version, patches)
      } catch (error) {
        result.errors.push(
          `${date} ${assetClass}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    result.datesProcessed++
  }

  return result
}

/**
 * Salin nilai dengan rasio bertanda salah dikosongkan.
 *
 * Disalin, tidak diubah di tempat: objek yang masuk berasal dari baris basis data
 * dan tidak boleh berubah diam-diam hanya karena lewat sini.
 */
function withoutMeaninglessRatios(
  values: Record<string, number | null>,
): Record<string, number | null> {
  const out = { ...values }
  for (const name of POSITIVE_ONLY) {
    const value = out[name]
    if (typeof value === 'number' && value <= 0) out[name] = null
  }
  return out
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
