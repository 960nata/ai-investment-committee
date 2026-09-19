/**
 * Pengujian metrik backtest.
 *
 *   npm run test:backtest
 *
 * Korelasi peringkat dan koreksi jendela tumpang tindih adalah dua hal yang
 * paling sering salah diterapkan di backtest keuangan. Keduanya salah dengan
 * cara yang sama merugikannya: hasilnya terlihat lebih bagus daripada
 * kenyataannya, dan tidak ada error yang memberi tahu.
 */

import { describeIc, evaluate, rank, spearman } from '../lib/backtest/metrics'

let passed = 0
const failures: string[] = []

function test(name: string, body: () => void): void {
  try {
    body()
    passed++
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number | null, expected: number, tolerance = 1e-6): void {
  if (actual === null) throw new Error(`diharapkan ${expected}, dapat null`)
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`diharapkan ${expected}, dapat ${actual}`)
  }
}

// ---------------------------------------------------------------------------
// Peringkat
// ---------------------------------------------------------------------------

test('peringkat memberi nilai rata-rata pada nilai kembar', () => {
  // Memberi peringkat berurutan kepada nilai yang sama menciptakan urutan yang
  // tidak ada di datanya, dan itu langsung mengalir ke korelasinya.
  const result = rank([5, 5, 5, 1, 9])
  assert(JSON.stringify(result) === JSON.stringify([3, 3, 3, 1, 5]), `dapat ${result}`)
})

test('peringkat mengembalikan urutan yang benar', () => {
  assert(JSON.stringify(rank([10, 30, 20])) === JSON.stringify([1, 3, 2]), 'urutan salah')
})

// ---------------------------------------------------------------------------
// Korelasi
// ---------------------------------------------------------------------------

test('spearman cocok dengan nilai acuan', () => {
  near(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 1)
  near(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]), -1)
  near(spearman([1, 2, 3, 4, 5], [1, 3, 2, 5, 4]), 0.8)
  near(
    spearman([2.1, 0.5, 3.3, 1.0, 4.8, 2.9, 0.1, 3.9], [0.03, -0.01, 0.05, 0.0, 0.09, 0.02, -0.04, 0.06]),
    0.97619,
    1e-5,
  )
  near(spearman([5, 5, 3, 1, 9], [1, 2, 3, 4, 5]), 0.051299, 1e-5)
})

test('spearman menolak masukan yang tidak layak', () => {
  assert(spearman([1, 2], [1, 2]) === null, 'sampel di bawah tiga harus null')
  assert(spearman([1, 2, 3], [1, 2]) === null, 'panjang berbeda harus null')
  assert(spearman([1, 1, 1], [1, 2, 3]) === null, 'tanpa sebaran, korelasi tidak terdefinisi')
})

test('spearman kebal terhadap satu nilai ekstrem', () => {
  // Inilah alasan memakai korelasi peringkat, bukan Pearson: imbal hasil saham
  // berekor gemuk, dan satu hari ekstrem bisa menggerakkan Pearson sendirian.
  const skor = [1, 2, 3, 4, 5]
  const biasa = [0.01, 0.02, 0.03, 0.04, 0.05]
  const ekstrem = [0.01, 0.02, 0.03, 0.04, 50]
  near(spearman(skor, biasa)!, spearman(skor, ekstrem)!, 1e-12)
})

// ---------------------------------------------------------------------------
// Evaluasi
// ---------------------------------------------------------------------------

function series(count: number, date: string, fn: (i: number) => [number, number]) {
  return Array.from({ length: count }, (_, i) => {
    const [score, forwardReturn] = fn(i)
    return { score, forwardReturn, date }
  })
}

test('jumlah efektif memperhitungkan jendela yang tumpang tindih', () => {
  // Seribu prediksi 63 hari yang dibuat tiap hari berbagi 62 dari 63 hari yang
  // sama. Menampilkan seribu adalah penipuan statistik meski tidak disengaja.
  const observations = Array.from({ length: 1000 }, (_, i) => ({
    score: i % 7,
    forwardReturn: (i % 5) / 100,
    date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  }))

  const result = evaluate(observations, 63)
  assert(result.n === 1000, 'jumlah mentah harus apa adanya')
  assert(
    result.effectiveN < result.n / 10,
    `jumlah efektif harus jauh lebih kecil, dapat ${result.effectiveN} dari ${result.n}`,
  )
})

test('hit rate dihitung hanya atas sinyal positif', () => {
  const observations = [
    { score: 2, forwardReturn: 0.05, date: 'd1' },
    { score: 1, forwardReturn: -0.02, date: 'd1' },
    { score: -3, forwardReturn: -0.09, date: 'd1' },
    { score: -1, forwardReturn: 0.01, date: 'd1' },
  ]
  // Dua sinyal positif, satu benar.
  near(evaluate(observations, 5).hitRate, 0.5)
})

test('tingkat dasar dilaporkan sebagai pembanding', () => {
  // Model yang tidak mengalahkan tebakan naif tidak boleh tampil ke pembaca,
  // jadi tebakan naifnya harus ikut dihitung dan ditampilkan.
  const observations = series(10, 'd1', (i) => [i, i < 8 ? 0.01 : -0.01])
  near(evaluate(observations, 5).baseRate, 0.8)
})

test('skor yang sempurna mengurutkan menghasilkan IC satu', () => {
  const observations = series(12, 'd1', (i) => [i, i / 100])
  near(evaluate(observations, 5).ic, 1, 1e-9)
})

test('skor acak menghasilkan IC mendekati nol', () => {
  // Deret semu-acak tetap, supaya hasil ujinya tidak berubah antar-jalan.
  let seed = 7
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const observations = Array.from({ length: 400 }, (_, i) => ({
    score: next(),
    forwardReturn: next() - 0.5,
    date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
  }))

  const ic = evaluate(observations, 5).ic!
  assert(Math.abs(ic) < 0.2, `IC skor acak seharusnya kecil, dapat ${ic}`)
})

test('desil teratas dikurangi terbawah butuh sampel memadai', () => {
  assert(evaluate(series(10, 'd1', (i) => [i, i / 100]), 5).topMinusBottom === null,
    'sampel kecil tidak boleh melaporkan selisih desil')
  assert(evaluate(series(100, 'd1', (i) => [i, i / 100]), 5).topMinusBottom !== null,
    'sampel cukup harus melaporkannya')
})

test('data kosong tidak melaporkan angka karangan', () => {
  const result = evaluate([], 5)
  assert(result.n === 0 && result.ic === null && result.hitRate === null, 'semuanya harus null')
})

test('tafsiran IC menandai nilai yang terlalu bagus', () => {
  assert(describeIc(0.3).includes('curiga'), 'IC tinggi harus dicurigai, bukan dirayakan')
  assert(describeIc(0.07) === 'bagus', 'IC menengah')
  assert(describeIc(0.03).includes('lemah'), 'IC kecil tetap berguna')
  assert(describeIc(0.001).includes('tidak berguna'), 'IC nyaris nol')

  // IC yang masuk ke describeIc sudah dikalikan arah asumsi, jadi tanda negatif
  // berarti asumsinya keliru — bukan temuan bagus yang tinggal dibalik.
  assert(
    describeIc(-0.07).includes('terbalik'),
    'IC negatif kuat harus disebut terbalik, bukan bagus',
  )
  assert(
    describeIc(-0.03).includes('terbalik'),
    'IC negatif lemah pun tetap terbalik arahnya',
  )
  assert(describeIc(-0.001).includes('tidak berguna'), 'IC negatif nyaris nol tetap tak berguna')
  assert(describeIc(-0.3).includes('curiga'), 'IC negatif ekstrem sama mencurigakannya')
  assert(describeIc(null) === 'belum bisa dihitung', 'IC kosong')
})

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} uji gagal:\n`)
  for (const f of failures) console.error(`  ✗ ${f}\n`)
  console.error(`${passed} lolos, ${failures.length} gagal\n`)
  process.exit(1)
}

console.log(`\n${passed} uji backtest lolos.\n`)
