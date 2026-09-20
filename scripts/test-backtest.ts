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
import {
  calibrateFeature,
  judgeDirection,
  walkForwardFolds,
  type CalibrationSample,
} from '../lib/scoring/calibration'

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
// Kalibrasi maju
// ---------------------------------------------------------------------------

test('periode latih selalu berjarak satu horizon dari periode uji', () => {
  // Ini sifat yang paling menentukan di seluruh berkas kalibrasi. Pengamatan
  // latih pada tanggal T memakai harga sampai T plus horizon; tanpa jarak itu,
  // pengamatan latih terakhir sudah mengetahui harga di dalam periode uji.
  for (const horizon of [5, 63, 252]) {
    for (const folds of walkForwardFolds(3000, horizon, 5, 0.4)) {
      assert(
        folds.testStart - folds.trainEnd >= horizon,
        `jarak cuma ${folds.testStart - folds.trainEnd}, horizon ${horizon}`,
      )
      assert(folds.trainEnd > 0, 'periode latih tidak boleh kosong')
      assert(folds.testEnd > folds.testStart, 'periode uji tidak boleh kosong')
    }
  }
})

test('lipatan uji berurutan dan menutup ekor riwayat', () => {
  const folds = walkForwardFolds(3000, 5, 5, 0.4)
  assert(folds.length > 0, 'harus ada lipatan')
  for (let i = 1; i < folds.length; i++) {
    assert(folds[i].testStart === folds[i - 1].testEnd, 'periode uji harus bersambung')
  }
  assert(folds[folds.length - 1].testEnd === 3000, 'lipatan terakhir menutup sampai ujung')
})

test('riwayat yang terlalu pendek tidak menghasilkan lipatan sama sekali', () => {
  // Diam-diam mengembalikan satu lipatan dengan latih seadanya jauh lebih
  // berbahaya daripada mengembalikan kosong.
  assert(walkForwardFolds(300, 252, 5, 0.4).length === 0, 'horizon panjang di riwayat pendek')
  assert(walkForwardFolds(0, 5, 5, 0.4).length === 0, 'tanpa tanggal')
})

test('arah diambil dari tanda IC ketika tandanya stabil', () => {
  const naik = Array.from({ length: 600 }, () => 0.05)
  const turun = Array.from({ length: 600 }, () => -0.05)

  assert(judgeDirection('a', naik, 600, 5).direction === 1, 'IC positif stabil searah')
  assert(judgeDirection('a', turun, 600, 5).direction === -1, 'IC negatif stabil terbalik')
})

test('fitur tanpa isi tidak diberi tanda tebakan', () => {
  const nol = Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? 0.002 : -0.002))
  const hasil = judgeDirection('a', nol, 600, 5)
  assert(hasil.direction === null, 'IC nyaris nol tidak boleh punya arah')
  assert(hasil.reason.includes('IC'), `alasannya harus soal IC, bukan: ${hasil.reason}`)
})

test('tanda yang berayun antar periode ditolak meski rata-ratanya besar', () => {
  // Rata-rata IC di sini 0,05 — cukup besar. Tapi sebarannya lebar, jadi tanda
  // itu tidak bisa dipercaya untuk periode berikutnya.
  const berayun = Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? 0.9 : -0.8))
  const hasil = judgeDirection('a', berayun, 600, 5)
  assert(hasil.direction === null, 'tanda yang berayun tidak boleh lolos')
  assert(hasil.reason.includes('stabil'), `alasannya harus soal kestabilan: ${hasil.reason}`)
})

test('uji memakai jumlah pengamatan bebas, bukan jumlah tanggal', () => {
  // Deret IC yang sama persis. Yang berbeda hanya panjang horizonnya, dan itu
  // menentukan berapa pengamatan yang benar-benar bebas. Horizon panjang harus
  // lebih sulit lolos — kalau tidak, seluruh sistem akan meloloskan derau.
  const deret = Array.from({ length: 600 }, (_, i) => 0.03 + Math.sin(i) * 0.05)

  const pendek = judgeDirection('a', deret, 600, 5)
  const panjang = judgeDirection('a', deret, 600, 252)

  assert(pendek.effectiveN > panjang.effectiveN, 'horizon panjang punya lebih sedikit periode bebas')
  assert(
    Math.abs(pendek.tStat!) > Math.abs(panjang.tStat!),
    'statistik uji harus mengecil saat periode bebasnya sedikit',
  )
  assert(panjang.direction === null, 'dua periode bebas tidak cukup untuk menetapkan tanda')
})

test('kalibrasi menemukan arah dari pengamatan mentah', () => {
  // Fitur yang benar-benar meramal: z tinggi diikuti imbal hasil tinggi.
  const byDate = new Map<string, CalibrationSample[]>()
  for (let d = 0; d < 400; d++) {
    const samples: CalibrationSample[] = []
    for (let i = 0; i < 20; i++) {
      const z = i - 10
      samples.push({ z, forwardReturn: z * 0.001 + Math.sin(d * 7 + i) * 0.0002 })
    }
    byDate.set(`2020-01-${String(d).padStart(3, '0')}`, samples)
  }

  const hasil = calibrateFeature('momentum', byDate, 5)
  assert(hasil.direction === 1, `harusnya searah, dapat ${hasil.direction} (${hasil.reason})`)
  assert(hasil.ic! > 0.5, `IC harusnya tinggi, dapat ${hasil.ic}`)
})

test('sinyal yang hanya ada di masa depan tidak pernah terpelajari', () => {
  // Setengah pertama riwayat murni derau, setengah kedua berisi sinyal sempurna.
  // Kalibrasi yang benar hanya melihat setengah pertama dan karena itu harus
  // menyerah. Kalau ia menemukan arah di sini, berarti ia mengintip.
  const dates: string[] = []
  const byDate = new Map<string, CalibrationSample[]>()
  for (let d = 0; d < 400; d++) {
    const date = `2020-${String(d).padStart(4, '0')}`
    dates.push(date)
    const samples: CalibrationSample[] = []
    for (let i = 0; i < 20; i++) {
      const z = i - 10
      const fwd = d < 200 ? Math.sin(d * 13 + i * 5) * 0.01 : z * 0.001
      samples.push({ z, forwardReturn: fwd })
    }
    byDate.set(date, samples)
  }

  const folds = walkForwardFolds(dates.length, 5, 5, 0.4)
  const pertama = folds[0]
  const latih = new Map([...byDate].slice(0, pertama.trainEnd))

  const hasil = calibrateFeature('bocor', latih, 5)
  assert(
    hasil.direction === null,
    `kalibrasi menemukan arah dari data yang tidak boleh ia lihat: ${hasil.ic}`,
  )
})

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} uji gagal:\n`)
  for (const f of failures) console.error(`  ✗ ${f}\n`)
  console.error(`${passed} lolos, ${failures.length} gagal\n`)
  process.exit(1)
}

console.log(`\n${passed} uji backtest lolos.\n`)
