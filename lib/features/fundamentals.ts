/**
 * Fitur fundamental.
 *
 * Mengisi dua kelompok bobot terbesar di horizon panjang, valuasi dan
 * pertumbuhan, yang bersama-sama berjumlah tujuh puluh persen.
 *
 * Satu aturan mengatur seluruh berkas ini: tiap nilai dihitung dari laporan
 * yang sudah benar-benar terbit pada tanggal itu, bukan dari laporan yang
 * periodenya sudah lewat. Laporan kuartal pertama terbit akhir April sampai
 * Mei; memakainya pada 1 April adalah melihat masa depan, dan itu sumber
 * kebohongan paling umum di backtest amatir.
 */

export interface FundamentalPeriod {
  period: string
  periodType: 'kuartal' | 'tahunan'
  periodEnd: string
  reportedAt: string
  items: Record<string, number>
}

export interface FundamentalSnapshot {
  /** Tanggal laporan terakhir yang sudah terbit. */
  asOfReported: string
  values: Record<string, number | null>
}

/**
 * Jumlahkan empat kuartal terakhir.
 *
 * Nilai tahunan tidak dipakai langsung meski tersedia: laporan tahunan terbit
 * berbulan-bulan setelah tutup buku, sementara empat kuartal terakhir selalu
 * mencerminkan keadaan terbaru yang sudah diketahui pasar.
 */
function ttm(periods: FundamentalPeriod[], item: string): number | null {
  const quarters = periods.filter((p) => p.periodType === 'kuartal' && p.items[item] !== undefined)
  if (quarters.length < 4) return null
  return quarters.slice(0, 4).reduce((sum, p) => sum + p.items[item], 0)
}

/** Nilai neraca terakhir. Pos sesaat tidak dijumlah, cukup diambil yang terbaru. */
function latest(periods: FundamentalPeriod[], item: string): number | null {
  for (const p of periods) {
    if (p.items[item] !== undefined) return p.items[item]
  }
  return null
}

/** Rata-rata nilai neraca awal dan akhir periode, untuk rasio pengembalian. */
function average(periods: FundamentalPeriod[], item: string, back = 4): number | null {
  const now = latest(periods, item)
  const then = periods[back]?.items[item]
  if (now === null) return null
  return then === undefined ? now : (now + then) / 2
}

function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null
  const value = a / b
  return Number.isFinite(value) ? value : null
}

/**
 * Hitung seluruh fitur fundamental pada satu tanggal.
 *
 * `periods` sudah disaring ke laporan yang terbit pada atau sebelum tanggal itu,
 * diurutkan dari yang terbaru.
 */
export function computeFundamentalFeatures(
  periods: FundamentalPeriod[],
  price: number,
): FundamentalSnapshot | null {
  if (periods.length === 0) return null

  const v: Record<string, number | null> = {}

  const shares = latest(periods, 'saham_beredar')
  const ekuitas = latest(periods, 'ekuitas')
  const totalAset = latest(periods, 'total_aset')
  const totalLiabilitas = latest(periods, 'total_liabilitas')
  const kas = latest(periods, 'kas')
  const utang = latest(periods, 'utang_jangka_panjang') ?? 0

  const labaBersihTtm = ttm(periods, 'laba_bersih')
  const pendapatanTtm = ttm(periods, 'pendapatan')
  const labaOperasiTtm = ttm(periods, 'laba_operasi')
  const labaKotorTtm = ttm(periods, 'laba_kotor')
  const cfoTtm = ttm(periods, 'arus_kas_operasi')
  const capexTtm = ttm(periods, 'belanja_modal')
  const penyusutanTtm = ttm(periods, 'penyusutan')
  const dividenTtm = ttm(periods, 'dividen_dibayar')

  const kapitalisasi = shares === null ? null : price * shares
  const ev =
    kapitalisasi === null || kas === null ? null : kapitalisasi + utang - kas
  const ebitda = labaOperasiTtm === null ? null : labaOperasiTtm + (penyusutanTtm ?? 0)

  // --- valuasi --------------------------------------------------------------
  // Semua rasio ini dipakai sebagai persentil terhadap riwayatnya sendiri, tidak
  // pernah mentah: PER 25 murah untuk barang konsumsi dan mahal untuk bank.
  v.per = ratio(kapitalisasi, labaBersihTtm)
  v.pbv = ratio(kapitalisasi, ekuitas)
  v.psr = ratio(kapitalisasi, pendapatanTtm)
  v.ev_ebitda = ratio(ev, ebitda)
  // Nilai perusahaan lebih jujur daripada kapitalisasi pasar karena
  // memperhitungkan utang: dua perusahaan dengan kapitalisasi sama tetapi satu
  // berutang besar bukan hal yang sebanding.
  v.earnings_yield = ratio(labaOperasiTtm, ev)
  v.fcf_yield =
    cfoTtm === null || capexTtm === null ? null : ratio(cfoTtm - Math.abs(capexTtm), kapitalisasi)
  v.dividend_yield = dividenTtm === null ? null : ratio(Math.abs(dividenTtm), kapitalisasi)

  // --- profitabilitas -------------------------------------------------------
  v.roe = ratio(labaBersihTtm, average(periods, 'ekuitas'))
  v.roa = ratio(labaBersihTtm, average(periods, 'total_aset'))
  v.margin_kotor = ratio(labaKotorTtm, pendapatanTtm)
  v.margin_bersih = ratio(labaBersihTtm, pendapatanTtm)
  v.margin_operasi = ratio(labaOperasiTtm, pendapatanTtm)

  // --- kesehatan ------------------------------------------------------------
  v.der = ratio(totalLiabilitas, ekuitas)
  v.current_ratio = ratio(latest(periods, 'aset_lancar'), latest(periods, 'liabilitas_lancar'))

  // --- kualitas laba --------------------------------------------------------
  // Akrual Sloan: laba yang tidak disertai kas masuk berasal dari pengakuan
  // akuntansi, bukan dari uang sungguhan. Makin tinggi, makin buruk — dan ini
  // salah satu anomali paling bertahan dalam literatur keuangan.
  v.akrual =
    labaBersihTtm === null || cfoTtm === null
      ? null
      : ratio(labaBersihTtm - cfoTtm, average(periods, 'total_aset'))

  // --- pertumbuhan ----------------------------------------------------------
  v.pertumbuhan_pendapatan_yoy = growthYoY(periods, 'pendapatan')
  v.pertumbuhan_laba_yoy = growthYoY(periods, 'laba_bersih')
  v.pertumbuhan_pendapatan_3t = cagr(periods, 'pendapatan', 12)
  v.konsistensi_pertumbuhan = consistency(periods, 'pendapatan')

  // Laju pertumbuhan yang bisa dibiayai sendiri tanpa utang atau saham baru.
  // Perusahaan yang tumbuh jauh di atasnya sedang membakar modal luar.
  const payout = dividenTtm === null || labaBersihTtm === null || labaBersihTtm === 0
    ? null
    : Math.abs(dividenTtm) / labaBersihTtm
  v.sgr = v.roe === null || payout === null ? v.roe : v.roe * (1 - payout)

  // --- dilusi ---------------------------------------------------------------
  const sharesThen = periods[4]?.items.saham_beredar
  v.perubahan_saham_yoy =
    shares === null || sharesThen === undefined || sharesThen === 0
      ? null
      : (shares - sharesThen) / sharesThen

  // --- Altman Z'' -----------------------------------------------------------
  v.altman_z = altman(periods, totalAset, totalLiabilitas, ekuitas, labaOperasiTtm)

  // --- Piotroski ------------------------------------------------------------
  v.piotroski = piotroski(periods, { labaBersihTtm, cfoTtm, totalAset })

  return { asOfReported: periods[0].reportedAt, values: round(v) }
}

function growthYoY(periods: FundamentalPeriod[], item: string): number | null {
  const now = ttm(periods, item)
  const older = ttm(periods.slice(4), item)
  if (now === null || older === null || older === 0) return null
  return (now - older) / Math.abs(older)
}

function cagr(periods: FundamentalPeriod[], item: string, quarters: number): number | null {
  const now = ttm(periods, item)
  const then = ttm(periods.slice(quarters), item)
  if (now === null || then === null || then <= 0 || now <= 0) return null
  return Math.pow(now / then, 4 / quarters) - 1
}

/**
 * Konsistensi pertumbuhan: satu dikurangi simpangan relatif pertumbuhan
 * kuartalan. Perusahaan yang tumbuh stabil sepuluh persen lebih berharga
 * daripada yang rata-ratanya sama tetapi naik turun keras.
 */
function consistency(periods: FundamentalPeriod[], item: string): number | null {
  const growth: number[] = []
  for (let i = 0; i + 4 < periods.length && growth.length < 12; i++) {
    const now = periods[i].items[item]
    const then = periods[i + 4].items[item]
    if (now === undefined || then === undefined || then === 0) continue
    growth.push((now - then) / Math.abs(then))
  }
  if (growth.length < 4) return null

  const mean = growth.reduce((a, b) => a + b, 0) / growth.length
  if (mean === 0) return null
  const sd = Math.sqrt(growth.reduce((a, g) => a + (g - mean) ** 2, 0) / (growth.length - 1))
  return 1 - sd / Math.abs(mean)
}

/**
 * Altman Z'' versi pasar berkembang.
 *
 * Ambangnya wajib dikalibrasi ulang pada data delisting setempat sebelum dipakai
 * untuk keputusan: model aslinya dilatih pada perusahaan Amerika dekade 1960-an.
 */
function altman(
  periods: FundamentalPeriod[],
  aset: number | null,
  liabilitas: number | null,
  ekuitas: number | null,
  ebit: number | null,
): number | null {
  if (aset === null || aset === 0 || liabilitas === null || liabilitas === 0) return null

  const asetLancar = latest(periods, 'aset_lancar')
  const liabilitasLancar = latest(periods, 'liabilitas_lancar')
  const labaDitahan = latest(periods, 'laba_ditahan')
  if (asetLancar === null || liabilitasLancar === null || labaDitahan === null || ebit === null) {
    return null
  }

  const x1 = (asetLancar - liabilitasLancar) / aset
  const x2 = labaDitahan / aset
  const x3 = ebit / aset
  const x4 = (ekuitas ?? 0) / liabilitas

  return 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
}

/**
 * Piotroski F-Score, nol sampai sembilan.
 *
 * Kekuatannya bukan pada nilai mutlaknya melainkan pada arah: tujuh dari
 * sembilan kriteria mengukur perubahan, bukan tingkat. Kriteria yang bahannya
 * tidak ada dilewati, dan skornya diskalakan terhadap yang bisa dinilai.
 */
function piotroski(
  periods: FundamentalPeriod[],
  ctx: { labaBersihTtm: number | null; cfoTtm: number | null; totalAset: number | null },
): number | null {
  const older = periods.slice(4)
  if (older.length < 4) return null

  const tests: (boolean | null)[] = []
  const { labaBersihTtm, cfoTtm, totalAset } = ctx

  const roa = ratio(labaBersihTtm, totalAset)
  const roaThen = ratio(ttm(older, 'laba_bersih'), latest(older, 'total_aset'))

  tests.push(roa === null ? null : roa > 0)
  tests.push(cfoTtm === null ? null : cfoTtm > 0)
  tests.push(roa === null || roaThen === null ? null : roa > roaThen)
  tests.push(cfoTtm === null || labaBersihTtm === null ? null : cfoTtm > labaBersihTtm)

  const der = ratio(latest(periods, 'utang_jangka_panjang'), totalAset)
  const derThen = ratio(latest(older, 'utang_jangka_panjang'), latest(older, 'total_aset'))
  tests.push(der === null || derThen === null ? null : der < derThen)

  const cr = ratio(latest(periods, 'aset_lancar'), latest(periods, 'liabilitas_lancar'))
  const crThen = ratio(latest(older, 'aset_lancar'), latest(older, 'liabilitas_lancar'))
  tests.push(cr === null || crThen === null ? null : cr > crThen)

  const shares = latest(periods, 'saham_beredar')
  const sharesThen = latest(older, 'saham_beredar')
  tests.push(shares === null || sharesThen === null ? null : shares <= sharesThen)

  const gm = ratio(ttm(periods, 'laba_kotor'), ttm(periods, 'pendapatan'))
  const gmThen = ratio(ttm(older, 'laba_kotor'), ttm(older, 'pendapatan'))
  tests.push(gm === null || gmThen === null ? null : gm > gmThen)

  const turnover = ratio(ttm(periods, 'pendapatan'), totalAset)
  const turnoverThen = ratio(ttm(older, 'pendapatan'), latest(older, 'total_aset'))
  tests.push(turnover === null || turnoverThen === null ? null : turnover > turnoverThen)

  const judged = tests.filter((t) => t !== null) as boolean[]
  if (judged.length < 5) return null

  return (judged.filter(Boolean).length / judged.length) * 9
}

function round(values: Record<string, number | null>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(values)) {
    out[k] = v === null || !Number.isFinite(v) ? null : Math.round(v * 1e6) / 1e6
  }
  return out
}
