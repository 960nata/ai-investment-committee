/**
 * Kalibrasi arah fitur.
 *
 * Registry menyimpan arah yang diasumsikan: momentum tinggi dianggap baik,
 * volatilitas tinggi dianggap buruk. Sembilan belas fitur sengaja dibiarkan
 * kosong karena arahnya memang tidak bisa ditebak dari teori saja, dan blueprint
 * menetapkan arah itu harus datang dari kalibrasi.
 *
 * Berkas ini kalibrasinya. Ia menaksir tanda tiap fitur dari data sebelum
 * periode yang diuji, lalu tanda itu dipakai apa adanya di periode sesudahnya.
 * Tidak ada tahap "coba balik, lihat mana yang lebih bagus" — itu bukan
 * kalibrasi melainkan pencocokan, dan hasilnya tidak pernah bertahan di luar
 * sampel yang dipakai mencocokkan.
 *
 * Tiga hal yang membuat ini bukan sekadar "ambil tanda IC":
 *
 * Pertama, IC dihitung per tanggal lalu dirata-rata, bukan sekali atas seluruh
 * kolam. Menghitung sekali mencampur perbandingan antar-instrumen dengan
 * antar-waktu.
 *
 * Kedua, jumlah pengamatan bebas dipakai, bukan jumlah baris. Prediksi 63 hari
 * yang dibuat tiap hari berbagi 62 dari 63 harinya, jadi seribu baris tidak
 * memberi informasi sebanyak seribu pengamatan bebas — dan statistik uji yang
 * memakai jumlah mentah akan meloloskan hampir semua fitur.
 *
 * Ketiga, fitur yang tidak lolos uji dikeluarkan, bukan diberi tanda tebakan.
 * Fitur tanpa arah yang jelas menambah derau ke skor dengan keyakinan penuh.
 */

import { spearman } from '@/lib/backtest/metrics'

/** Satu pengamatan: nilai fitur pada satu tanggal, dan imbal hasil sesudahnya. */
export interface CalibrationSample {
  z: number
  forwardReturn: number
}

export interface FeatureDirection {
  feature: string
  /** Null berarti fitur ini tidak ikut skor sama sekali. */
  direction: 1 | -1 | null
  ic: number | null
  /** Statistik uji atas jumlah pengamatan bebas, bukan jumlah baris. */
  tStat: number | null
  dates: number
  effectiveN: number
  reason: string
}

/**
 * Batas terendah IC yang masih dianggap ada isinya.
 *
 * IC 0,01 sudah sangat kecil, tapi di bawah itu tandanya praktis dilempar koin.
 */
const MIN_IC = 0.01

/**
 * Batas statistik uji.
 *
 * Longgar dengan sengaja. Ambang 2 — setara lima persen — akan mengeluarkan
 * hampir semua fitur pada sampel sebelas tahun, dan skor tanpa fitur bukan skor
 * yang lebih jujur, melainkan skor yang kosong. Yang dijaga di sini bukan
 * "terbukti secara statistik", melainkan "tandanya tidak sepenuhnya acak".
 */
const MIN_T = 1.5

/**
 * Jumlah pengamatan bebas terkecil sebelum tanda boleh ditaksir sama sekali.
 *
 * Di bawah ini tandanya ditentukan beberapa periode saja, dan periode-periode
 * itu bisa kebetulan semuanya pasar naik.
 */
const MIN_EFFECTIVE_N = 5

/**
 * Taksir arah satu fitur dari pengamatan yang diberikan.
 *
 * Yang masuk harus sudah disaring ke periode latih saja. Fungsi ini tidak tahu
 * apa-apa soal tanggal uji, dan itu memang perlindungannya: ia tidak bisa
 * mengintip karena tidak diberi apa pun untuk diintip.
 */
export function calibrateFeature(
  feature: string,
  byDate: ReadonlyMap<string, CalibrationSample[]>,
  horizonDays: number,
): FeatureDirection {
  const daily: number[] = []
  for (const samples of byDate.values()) {
    if (samples.length < 3) continue
    const ic = spearman(
      samples.map((s) => s.z),
      samples.map((s) => s.forwardReturn),
    )
    if (ic !== null) daily.push(ic)
  }

  return judgeDirection(feature, daily, byDate.size, horizonDays)
}

/**
 * Putuskan arah dari deret IC harian yang sudah jadi.
 *
 * Dipisah dari `calibrateFeature` karena runner sudah menghitung IC tiap fitur
 * pada tiap tanggal sekali di awal, dan menghitungnya ulang di tiap lipatan
 * berarti mengulang pekerjaan yang sama lima belas kali. Yang penting, keputusan
 * lolos atau tidak hanya ada di sini — satu tempat, bukan dua yang bisa
 * menyimpang diam-diam.
 */
export function judgeDirection(
  feature: string,
  dailyIc: readonly number[],
  dateCount: number,
  horizonDays: number,
): FeatureDirection {
  const effectiveN = Math.floor(dateCount / horizonDays)
  const base = { feature, dates: dateCount, effectiveN }

  if (dailyIc.length < 2) {
    return { ...base, direction: null, ic: null, tStat: null, reason: 'terlalu sedikit tanggal' }
  }

  const ic = dailyIc.reduce((s, v) => s + v, 0) / dailyIc.length
  const variance = dailyIc.reduce((s, v) => s + (v - ic) ** 2, 0) / (dailyIc.length - 1)
  const sd = Math.sqrt(variance)

  // Pembagi memakai akar jumlah pengamatan bebas. Memakai akar jumlah tanggal
  // akan membesarkan statistik ujinya lima sampai dua ratus kali lipat,
  // tergantung horizon, dan meloloskan fitur yang sebenarnya derau.
  //
  // Sebaran nol ditangani terpisah, dan arahnya lolos — bukan ditolak. Versi
  // pertama menyamakannya dengan "tanda tidak stabil", padahal sebaran nol
  // adalah kasus paling stabil yang mungkin ada: tiap tanggal memberi IC yang
  // persis sama. Pada data sungguhan ini tidak pernah terjadi, tapi kekeliruan
  // yang hanya muncul di kasus ujung tetap kekeliruan.
  const tStat =
    sd === 0
      ? ic === 0
        ? null
        : Math.sign(ic) * Number.POSITIVE_INFINITY
      : ic / (sd / Math.sqrt(Math.max(1, effectiveN)))

  if (effectiveN < MIN_EFFECTIVE_N) {
    return {
      ...base,
      direction: null,
      ic,
      tStat,
      reason: `${effectiveN} pengamatan bebas, terlalu sedikit`,
    }
  }
  if (Math.abs(ic) < MIN_IC) {
    return { ...base, direction: null, ic, tStat, reason: 'IC terlalu kecil untuk punya tanda' }
  }
  if (tStat === null || Math.abs(tStat) < MIN_T) {
    return { ...base, direction: null, ic, tStat, reason: 'tandanya tidak stabil antar periode' }
  }

  return { ...base, direction: ic > 0 ? 1 : -1, ic, tStat, reason: 'lolos' }
}

export interface Fold {
  /** Indeks pada larik tanggal terurut. Latih adalah [0, trainEnd). */
  trainEnd: number
  /** Uji adalah [testStart, testEnd). */
  testStart: number
  testEnd: number
}

/**
 * Bagi rentang waktu jadi lipatan maju.
 *
 * Latih selalu dari awal sampai sebelum periode uji, tidak pernah sebaliknya dan
 * tidak pernah melompatinya. Jendela latih tumbuh, bukan bergeser: model yang
 * dipakai sungguhan juga punya seluruh riwayatnya, bukan hanya potongan
 * terakhir.
 *
 * Jarak sepanjang horizon dipasang antara akhir latih dan awal uji, dan itu
 * bagian yang paling mudah dilupakan. Pengamatan latih pada tanggal T memakai
 * harga sampai T plus horizon. Tanpa jarak itu, pengamatan latih terakhir sudah
 * mengetahui harga di dalam periode uji — kebocoran yang membuat hasilnya
 * terlihat jauh lebih bagus daripada yang sebenarnya.
 */
export function walkForwardFolds(
  dateCount: number,
  horizonDays: number,
  folds = 5,
  minTrainRatio = 0.4,
): Fold[] {
  const firstTest = Math.floor(dateCount * minTrainRatio)
  const span = dateCount - firstTest
  if (span <= 0 || folds < 1) return []

  const size = Math.floor(span / folds)
  if (size <= 0) return []

  const out: Fold[] = []
  for (let i = 0; i < folds; i++) {
    const testStart = firstTest + i * size
    const testEnd = i === folds - 1 ? dateCount : testStart + size
    const trainEnd = testStart - horizonDays

    // Lipatan yang periode latihnya habis dimakan jarak horizon dilewati, bukan
    // dipaksa jalan dengan latih seadanya.
    if (trainEnd < horizonDays * MIN_EFFECTIVE_N) continue
    out.push({ trainEnd, testStart, testEnd })
  }

  return out
}

/** Ringkasan satu lipatan, untuk dilaporkan apa adanya. */
export interface FoldReport {
  from: string
  to: string
  trainDates: number
  featuresUsed: number
  featuresDropped: number
}
