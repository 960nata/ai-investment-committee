/**
 * Metrik evaluasi.
 *
 * Fungsi murni, tanpa I/O, supaya bisa diuji terhadap nilai yang dihitung
 * tangan. Korelasi peringkat dan koreksi jendela tumpang tindih adalah dua hal
 * yang paling sering salah diterapkan di backtest keuangan, dan keduanya salah
 * dengan cara yang membuat hasilnya terlihat lebih bagus, bukan lebih buruk.
 */

/** Peringkat dengan rata-rata untuk nilai yang sama. Dipakai korelasi Spearman. */
export function rank(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const out = new Array<number>(values.length)

  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++

    // Nilai kembar diberi peringkat rata-rata. Memberi peringkat berurutan
    // kepada nilai yang sama menciptakan urutan yang tidak ada di datanya.
    const shared = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k].i] = shared
    i = j + 1
  }

  return out
}

/**
 * Korelasi peringkat Spearman.
 *
 * Dipakai, bukan Pearson, karena yang dinilai kemampuan mengurutkan — bukan
 * ketepatan nilainya. Imbal hasil saham berekor gemuk, dan satu hari ekstrem
 * bisa menggerakkan korelasi Pearson sendirian.
 */
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null

  const ra = rank(a)
  const rb = rank(b)
  const n = a.length

  const meanA = ra.reduce((s, v) => s + v, 0) / n
  const meanB = rb.reduce((s, v) => s + v, 0) / n

  let cov = 0
  let varA = 0
  let varB = 0
  for (let i = 0; i < n; i++) {
    const da = ra[i] - meanA
    const db = rb[i] - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }

  if (varA === 0 || varB === 0) return null
  return cov / Math.sqrt(varA * varB)
}

export interface ForwardObservation {
  /** Skor pada tanggal keputusan. */
  score: number
  /** Imbal hasil ke depan, dalam pecahan. */
  forwardReturn: number
  date: string
}

export interface EvaluationResult {
  /** Jumlah pengamatan mentah. */
  n: number
  /**
   * Jumlah pengamatan yang benar-benar bebas.
   *
   * Prediksi 63 hari yang dibuat tiap hari berbagi 62 dari 63 hari yang sama.
   * Seribu pengamatan seperti itu tidak memberi informasi sebanyak seribu
   * pengamatan bebas, dan menampilkan yang mentah adalah penipuan statistik
   * sekalipun tidak disengaja.
   */
  effectiveN: number
  hitRate: number | null
  /** Imbal hasil rata-rata per sinyal, sebelum biaya. */
  expectancy: number | null
  /** Korelasi peringkat antara skor dan imbal hasil ke depan. */
  ic: number | null
  /** IC dibagi simpangan bakunya antar-hari. */
  icir: number | null
  /** Imbal hasil rata-rata desil teratas dikurangi desil terbawah. */
  topMinusBottom: number | null
  /** Hit rate tebakan naif: seberapa sering pasar naik, apa pun skornya. */
  baseRate: number | null
}

/**
 * Evaluasi satu horizon.
 *
 * `byDate` mengelompokkan pengamatan menurut tanggal keputusan, karena IC
 * dihitung per hari lalu dirata-rata — bukan sekali atas seluruh data. Menghitung
 * sekali atas semuanya mencampur perbandingan antar-instrumen dengan
 * perbandingan antar-waktu, dan hasilnya tidak menjawab pertanyaan mana pun.
 */
export function evaluate(
  observations: ForwardObservation[],
  horizonDays: number,
): EvaluationResult {
  const n = observations.length
  if (n === 0) {
    return {
      n: 0,
      effectiveN: 0,
      hitRate: null,
      expectancy: null,
      ic: null,
      icir: null,
      topMinusBottom: null,
      baseRate: null,
    }
  }

  const byDate = new Map<string, ForwardObservation[]>()
  for (const o of observations) {
    const bucket = byDate.get(o.date) ?? []
    bucket.push(o)
    byDate.set(o.date, bucket)
  }

  const dailyIc: number[] = []
  for (const bucket of byDate.values()) {
    const value = spearman(
      bucket.map((o) => o.score),
      bucket.map((o) => o.forwardReturn),
    )
    if (value !== null) dailyIc.push(value)
  }

  const ic = dailyIc.length === 0 ? null : dailyIc.reduce((s, v) => s + v, 0) / dailyIc.length
  const icir =
    ic === null || dailyIc.length < 2
      ? null
      : ic / Math.sqrt(dailyIc.reduce((s, v) => s + (v - ic) ** 2, 0) / (dailyIc.length - 1))

  // Sinyal dianggap "positif" bila skornya di atas nol, dan benar bila imbal
  // hasilnya ikut positif.
  const positives = observations.filter((o) => o.score > 0)
  const hitRate =
    positives.length === 0
      ? null
      : positives.filter((o) => o.forwardReturn > 0).length / positives.length

  const expectancy =
    positives.length === 0
      ? null
      : positives.reduce((s, o) => s + o.forwardReturn, 0) / positives.length

  const baseRate = observations.filter((o) => o.forwardReturn > 0).length / n

  const sorted = [...observations].sort((a, b) => a.score - b.score)
  const decile = Math.max(1, Math.floor(n / 10))
  const bottom = sorted.slice(0, decile)
  const top = sorted.slice(-decile)
  const mean = (xs: ForwardObservation[]) => xs.reduce((s, o) => s + o.forwardReturn, 0) / xs.length
  const topMinusBottom = n < 20 ? null : mean(top) - mean(bottom)

  return {
    n,
    // Jumlah hari kalender yang tercakup dibagi panjang horizon. Ini ukuran
    // kasar tetapi arahnya benar, dan jauh lebih jujur daripada N mentah.
    effectiveN: Math.max(1, Math.floor(byDate.size / horizonDays)),
    hitRate,
    expectancy,
    ic,
    icir,
    topMinusBottom,
    baseRate,
  }
}

/**
 * Tafsiran IC, sengaja termasuk batas atas yang mencurigakan.
 *
 * IC di atas 0,15 pada data harian di pasar publik nyaris tidak pernah nyata.
 * Menemukannya berarti memeriksa ulang penyaringan tanggal terbit, bukan
 * merayakan.
 */
export function describeIc(ic: number | null): string {
  if (ic === null) return 'belum bisa dihitung'
  const a = Math.abs(ic)
  if (a > 0.15) return 'curiga — periksa ulang kebocoran data'
  if (a >= 0.05) return 'bagus'
  if (a >= 0.02) return 'lemah tetapi nyata'
  return 'tidak berguna'
}
