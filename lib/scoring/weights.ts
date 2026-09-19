/**
 * Bobot skor per horizon.
 *
 * Tiga horizon, tiga model bobot. Menggabungkannya jadi satu skor "bagus/jelek"
 * adalah kesalahan paling umum di sistem semacam ini: satu aset bisa buruk
 * untuk lima hari ke depan dan bagus untuk lima tahun ke depan, dan keduanya
 * benar sekaligus.
 *
 * Angka di bawah titik awal yang masuk akal, bukan kebenaran. Ia diambil apa
 * adanya dari blueprint dan belum pernah dikalibrasi ke data. Sampai kalibrasi
 * berjalan, antarmuka wajib menyebutnya "belum dikalibrasi" — bobot yang ditebak
 * dan bobot yang diukur tidak boleh terlihat sama.
 */

import type { FeatureGroup } from '@/lib/features/registry'

export type Horizon = 'pendek' | 'menengah' | 'panjang'

export const HORIZONS: { id: Horizon; label: string; question: string; days: number }[] = [
  { id: 'pendek', label: 'Pendek', question: 'Ke mana arah minggu ini?', days: 5 },
  { id: 'menengah', label: 'Menengah', question: 'Apakah tren ini bertahan satu kuartal?', days: 63 },
  { id: 'panjang', label: 'Panjang', question: 'Layakkah dimiliki di harga ini?', days: 252 },
]

/**
 * Kelompok bobot menurut blueprint.
 *
 * Empat di antaranya belum punya satu pun fitur: arus dana butuh data KSEI dan
 * broker summary, sentimen butuh lapisan berita, valuasi dan pertumbuhan butuh
 * laporan keuangan. Semuanya tetap didaftarkan di sini dengan bobot penuh,
 * supaya yang hilang terhitung sebagai lubang yang menurunkan confidence dan
 * bukan menghilang diam-diam sambil membuat skor tampak selengkap yang lain.
 */
export type ScoreGroup =
  | 'momentum_tren'
  | 'volume_volatilitas'
  | 'arus_dana'
  | 'sentimen'
  | 'valuasi'
  | 'pertumbuhan'
  | 'relatif'

export const GROUP_LABELS: Record<ScoreGroup, string> = {
  momentum_tren: 'Momentum & tren',
  volume_volatilitas: 'Volume & volatilitas',
  arus_dana: 'Arus dana & kepemilikan',
  sentimen: 'Sentimen & berita',
  valuasi: 'Valuasi',
  pertumbuhan: 'Pertumbuhan & kualitas',
  relatif: 'Kekuatan relatif',
}

export const GROUP_WEIGHTS: Record<Horizon, Record<ScoreGroup, number>> = {
  pendek: {
    momentum_tren: 0.35,
    volume_volatilitas: 0.2,
    arus_dana: 0.25,
    sentimen: 0.15,
    valuasi: 0,
    pertumbuhan: 0,
    relatif: 0.05,
  },
  menengah: {
    momentum_tren: 0.25,
    volume_volatilitas: 0.1,
    arus_dana: 0.2,
    sentimen: 0.1,
    valuasi: 0.15,
    pertumbuhan: 0.15,
    relatif: 0.05,
  },
  panjang: {
    momentum_tren: 0.05,
    volume_volatilitas: 0,
    arus_dana: 0.1,
    sentimen: 0.05,
    valuasi: 0.35,
    pertumbuhan: 0.35,
    relatif: 0.1,
  },
}

/**
 * Peta dari kelompok fitur teknikal ke kelompok bobot.
 *
 * Struktur harga digabung ke momentum: posisi terhadap tertinggi setahun
 * menjawab pertanyaan yang sama dengan momentum, yaitu apakah gerakan yang
 * sedang berjalan masih punya tenaga.
 */
export const GROUP_OF: Record<FeatureGroup, ScoreGroup> = {
  tren: 'momentum_tren',
  momentum: 'momentum_tren',
  struktur: 'momentum_tren',
  volatilitas: 'volume_volatilitas',
  volume: 'volume_volatilitas',
  relatif: 'relatif',
}

/** Kelompok yang belum punya fitur sama sekali, untuk ditampilkan apa adanya. */
export const GROUPS_WITHOUT_FEATURES: ScoreGroup[] = [
  'arus_dana',
  'sentimen',
  'valuasi',
  'pertumbuhan',
]

/**
 * Versi model, ikut tersimpan di tiap baris skor.
 *
 * Naik setiap kali bobot atau rumus agregasi berubah. Tanpa ini, skor lama dan
 * skor baru terlihat sebanding padahal dihasilkan model yang berbeda.
 */
export const MODEL_VERSION = 'skor-2026-09-a'
