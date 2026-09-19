/**
 * Normalisasi lintas penampang.
 *
 * Persentil terhadap riwayat sendiri menjawab "apakah instrumen ini sedang tidak
 * biasa bagi dirinya sendiri". Itu pertanyaan yang benar untuk momentum dan
 * volatilitas, tetapi bukan untuk valuasi.
 *
 * Rasio harga terhadap laba 25 murah untuk barang konsumsi dan mahal untuk bank,
 * dan membandingkannya hanya dengan masa lalunya sendiri tidak pernah
 * mengungkap itu. Yang dibutuhkan perbandingan terhadap sesamanya pada hari yang
 * sama — dan tanpa netralisasi kelompok, peringkat "termurah" akan selalu
 * dikuasai satu dua sektor yang memang secara struktural diperdagangkan di
 * kelipatan rendah. Itu bukan temuan.
 */

import { medianAbsoluteDeviation, median, winsorize, MAD_TO_SIGMA, Z_CLIP } from './indicators'

export interface CrossSectionRow {
  instrumentId: number
  /** Kelompok pembanding: kelas aset, atau sektor bila tersedia. */
  peerGroup: string
  values: Record<string, number | null>
}

/**
 * Kelompok dengan anggota lebih sedikit dari ini digabung ke kelompok induk.
 *
 * Median dari tiga anggota bukan pembanding yang berarti; ia lebih mirip
 * menebak dengan langkah tambahan.
 */
const MIN_PEERS = 5

const FALLBACK_GROUP = '__gabungan__'

export interface CrossSectionResult {
  instrumentId: number
  /** Nilai `<fitur>_zcs` dan `<fitur>_pcs` untuk tiap fitur yang bisa dihitung. */
  values: Record<string, number | null>
  peerGroup: string
  peers: number
}

/**
 * Hitung z-score dan persentil lintas penampang untuk satu tanggal.
 *
 * Robust z memakai median dan MAD, bukan rata-rata dan simpangan baku, karena
 * data keuangan penuh pencilan: satu emiten dengan rasio harga terhadap laba
 * empat ribu, akibat labanya nyaris nol, sudah cukup menggeser rata-rata
 * seluruh sektornya.
 */
export function normaliseCrossSection(
  rows: CrossSectionRow[],
  featureNames: string[],
): CrossSectionResult[] {
  // Kelompok kecil digabung lebih dulu, bukan dibuang. Emiten di kelompok tipis
  // tetap ada dan tetap bisa dibeli orang.
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.peerGroup, (counts.get(row.peerGroup) ?? 0) + 1)

  const groupOf = (row: CrossSectionRow) =>
    (counts.get(row.peerGroup) ?? 0) >= MIN_PEERS ? row.peerGroup : FALLBACK_GROUP

  const byGroup = new Map<string, CrossSectionRow[]>()
  for (const row of rows) {
    const key = groupOf(row)
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  const out: CrossSectionResult[] = []

  for (const [group, members] of byGroup) {
    const computed = new Map<number, Record<string, number | null>>()
    for (const m of members) computed.set(m.instrumentId, {})

    for (const name of featureNames) {
      const present = members
        .map((m) => ({ id: m.instrumentId, v: m.values[name] }))
        .filter((x): x is { id: number; v: number } => typeof x.v === 'number' && Number.isFinite(x.v))

      if (present.length < MIN_PEERS) {
        for (const m of members) computed.get(m.instrumentId)![`${name}_zcs`] = null
        for (const m of members) computed.get(m.instrumentId)![`${name}_pcs`] = null
        continue
      }

      // Pencilan dipangkas, bukan dibuang. Membuangnya mengubah populasi
      // pembandingnya; memangkasnya hanya membatasi pengaruhnya.
      const raw = present.map((x) => x.v)
      const trimmed = winsorize(raw, 0.01, 0.99)
      const centre = median(trimmed)!
      const spread = medianAbsoluteDeviation(trimmed)!

      // Persentil dihitung dari nilai asli, bukan dari yang sudah dipangkas.
      // Peringkat sudah kebal pencilan menurut definisinya — memangkas lebih
      // dulu hanya membuat dua nilai terendah jadi seri. Pada 18 September 2026
      // itu menyamakan emiten ber-PER 6,61 dengan yang 9,52, tepat di ujung
      // distribusi yang justru ingin dibedakan orang.
      const sorted = [...raw].sort((a, b) => a - b)

      for (let i = 0; i < present.length; i++) {
        const value = trimmed[i]
        const target = computed.get(present[i].id)!
        // Pemangkasan tetap dipakai untuk z-score: tanpa itu satu emiten dengan
        // rasio empat ribu menggeser sebaran seluruh kelompoknya.

        target[`${name}_zcs`] =
          spread === 0
            ? value === centre
              ? 0
              : value > centre
                ? Z_CLIP
                : -Z_CLIP
            : round(
                Math.max(
                  -Z_CLIP,
                  Math.min(Z_CLIP, (value - centre) / (MAD_TO_SIGMA * spread)),
                ),
              )

        // Persentil dipakai untuk ditampilkan: "di persentil 15 sektornya"
        // langsung dimengerti orang, sementara "z-score −1,2" tidak.
        const below = sorted.filter((v) => v <= present[i].v).length
        target[`${name}_pcs`] = round((below - 0.5) / sorted.length)
      }

      // Anggota yang nilainya tidak ada tetap mendapat kuncinya, berisi kosong.
      const withValue = new Set(present.map((x) => x.id))
      for (const m of members) {
        if (withValue.has(m.instrumentId)) continue
        computed.get(m.instrumentId)![`${name}_zcs`] = null
        computed.get(m.instrumentId)![`${name}_pcs`] = null
      }
    }

    for (const m of members) {
      out.push({
        instrumentId: m.instrumentId,
        values: computed.get(m.instrumentId)!,
        peerGroup: group,
        peers: members.length,
      })
    }
  }

  return out
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
