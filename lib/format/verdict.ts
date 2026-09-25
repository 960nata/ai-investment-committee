/**
 * Label tampilan untuk putusan komite.
 *
 * Nilai yang tersimpan tetap `beli | tahan | jual | abstain` — itu kunci data,
 * dipakai backtest dan riwayat sidang, dan tidak boleh berubah diam-diam. Yang
 * berubah hanya apa yang dibaca manusia di layar.
 *
 * Sistem ini melaporkan ke mana bukti condong, bukan menyuruh orang
 * bertransaksi. Kata "beli" dan "jual" di layar terbaca sebagai perintah,
 * apa pun yang tertulis di FAQ — dan memberi rekomendasi transaksi sebagai
 * kegiatan usaha di Indonesia butuh izin Penasihat Investasi dari OJK.
 */

export type VerdictValue = 'beli' | 'tahan' | 'jual' | 'abstain'

export const VERDICT_LABEL: Record<VerdictValue, string> = {
  beli: 'Bukti positif',
  tahan: 'Bukti berimbang',
  jual: 'Bukti negatif',
  abstain: 'Tidak dinilai',
}

export const VERDICT_MEANING: Record<VerdictValue, string> = {
  beli: 'Bukti condong ke satu arah pada hari itu',
  tahan: 'Bukti ada di kedua sisi dan saling menahan',
  jual: 'Kerapuhan yang terlihat lebih besar dari peluangnya',
  abstain: 'Data belum layak dinilai, atau keberatan risiko tidak terjawab',
}

export type VerdictTone = 'ok' | 'down' | 'warn' | 'neutral'

export function verdictLabel(value: string | null | undefined): string {
  return VERDICT_LABEL[normalise(value)]
}

export function verdictTone(value: string | null | undefined): VerdictTone {
  const v = normalise(value)
  if (v === 'beli') return 'ok'
  if (v === 'jual') return 'down'
  if (v === 'tahan') return 'warn'
  return 'neutral'
}

/** Nilai kosong atau tak dikenal dibaca sebagai "tidak dinilai", bukan ditebak. */
function normalise(value: string | null | undefined): VerdictValue {
  const v = (value ?? '').toLowerCase()
  return v === 'beli' || v === 'tahan' || v === 'jual' ? v : 'abstain'
}
