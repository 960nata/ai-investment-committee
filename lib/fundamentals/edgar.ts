/**
 * Adaptor SEC EDGAR.
 *
 * Sumber primer, gratis, tanpa kunci, dan membawa dua hal yang hampir tidak
 * pernah diberikan vendor berbayar: `filed`, tanggal laporan benar-benar terbit,
 * dan `accn`, nomor filing asalnya. Keduanya yang membuat aturan point-in-time
 * bisa ditegakkan sempurna, dan tanpa itu backtest horizon panjang tidak boleh
 * dijalankan sama sekali.
 *
 * Jebakan terbesar dalam menguraikan companyfacts bukan nama elemennya,
 * melainkan durasinya. Satu periode muncul berkali-kali dalam berkas yang sama:
 * pendapatan kuartal ketiga hadir sebagai angka tiga bulan dan juga sebagai
 * angka sembilan bulan berjalan, dengan `fy` dan `fp` yang persis sama. Mengambil
 * yang salah membuat pendapatan tampak tiga kali lipat, dan kesalahan itu tidak
 * pernah muncul sebagai error — hanya sebagai rasio yang keliru.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'
import { ITEMS, requiredFor, type ItemSpec } from './items'

const BASE = 'https://data.sec.gov'

/**
 * SEC meminta header identitas berisi nama aplikasi dan surel yang bisa
 * dihubungi, dan menolak permintaan tanpa itu. Ini syarat pemakaian, bukan
 * penyamaran.
 */
function userAgent(): string {
  const contact = process.env.SEC_CONTACT_EMAIL ?? 'kontak-belum-diset@example.com'
  return `ai-investment-committee ${contact}`
}

interface EdgarFact {
  start?: string
  end: string
  val: number
  fy?: number
  fp?: string
  form: string
  filed: string
  accn: string
}

interface CompanyFacts {
  cik: number
  entityName: string
  facts: Record<string, Record<string, { units: Record<string, EdgarFact[]> }>>
}

export interface CanonicalPeriod {
  period: string
  periodType: 'kuartal' | 'tahunan'
  periodEnd: string
  reportedAt: string
  fiscalYear: number
  fiscalPeriod: string
  currency: string
  sourceAccession: string
  items: Record<string, number>
  missingItems: string[]
  completeness: number
}

/** Rentang hari yang dianggap satu kuartal dan satu tahun. */
const QUARTER_DAYS = { min: 60, max: 120 }
const YEAR_DAYS = { min: 300, max: 400 }

export async function fetchTickerMap(): Promise<Map<string, number>> {
  const response = await fetchWithTimeout('https://www.sec.gov/files/company_tickers.json', {
    label: 'SEC daftar emiten',
    timeoutMs: 30_000,
    headers: { 'user-agent': userAgent() },
  })
  if (!response.ok) throw new Error(`SEC daftar emiten HTTP ${response.status}`)

  const body = (await response.json()) as Record<string, { cik_str: number; ticker: string }>
  return new Map(Object.values(body).map((v) => [v.ticker.toUpperCase(), v.cik_str]))
}

export async function fetchCompanyFacts(cik: number): Promise<CompanyFacts> {
  const padded = String(cik).padStart(10, '0')
  const response = await fetchWithTimeout(`${BASE}/api/xbrl/companyfacts/CIK${padded}.json`, {
    label: `SEC companyfacts CIK${padded}`,
    timeoutMs: 45_000,
    headers: { 'user-agent': userAgent() },
  })

  if (response.status === 404) throw new Error(`CIK ${cik} tidak punya companyfacts`)
  if (!response.ok) throw new Error(`SEC companyfacts HTTP ${response.status} untuk CIK ${cik}`)

  return (await response.json()) as CompanyFacts
}

function days(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
}

/** Satuan yang dipakai pos ini. Saham dihitung lembar, laba per saham dalam mata uang. */
function pickUnit(units: Record<string, EdgarFact[]>): { unit: string; facts: EdgarFact[] } | null {
  const preferred = ['USD', 'shares', 'USD/shares']
  for (const unit of preferred) {
    if (units[unit]?.length) return { unit, facts: units[unit] }
  }
  const first = Object.entries(units)[0]
  return first ? { unit: first[0], facts: first[1] } : null
}

/**
 * Ubah satu berkas companyfacts jadi baris kanonik per periode per filing.
 *
 * Dikelompokkan menurut nomor filing, bukan hanya periode. Dengan begitu laporan
 * asli dan penyajian ulangnya tersimpan berdampingan, dan backtest bisa memakai
 * versi yang benar-benar diketahui pasar pada tanggal yang disimulasikan.
 */
export function parseCompanyFacts(
  facts: CompanyFacts,
  options: { kind?: 'umum' | 'bank'; sinceYear?: number } = {},
): CanonicalPeriod[] {
  const kind = options.kind ?? 'umum'
  const sinceYear = options.sinceYear ?? 0
  const gaap = facts.facts['us-gaap'] ?? {}
  const specs = ITEMS.filter((s) => !(kind === 'bank' && s.notApplicableTo?.includes('bank')))

  interface Collected {
    spec: ItemSpec
    fact: EdgarFact
    unit: string
    span: number | null
  }

  // Semua fakta yang relevan dikumpulkan dulu, belum dipilih. Memilih sambil
  // mengumpulkan berarti fakta pertama yang kebetulan lewat menang, dan urutan
  // di dalam berkas EDGAR tidak berarti apa-apa.
  const byKey = new Map<string, Collected[]>()

  for (const spec of specs) {
    for (const tag of spec.usGaap) {
      const entry = gaap[tag]
      if (!entry) continue
      const picked = pickUnit(entry.units)
      if (!picked) continue

      for (const fact of picked.facts) {
        if (!fact.fy || !fact.fp) continue
        if (fact.fy < sinceYear) continue
        if (!['10-Q', '10-K', '20-F', '40-F'].includes(fact.form)) continue

        const key = `${fact.accn}|${fact.fy}|${fact.fp}`
        const list = byKey.get(key) ?? []
        list.push({
          spec,
          fact,
          unit: picked.unit,
          span: fact.start ? days(fact.start, fact.end) : null,
        })
        byKey.set(key, list)
      }
    }
  }

  const required = requiredFor(kind)
  const rows: CanonicalPeriod[] = []

  for (const [key, collected] of byKey) {
    const [accn, fyText, fp] = key.split('|')
    const fy = Number(fyText)
    const annual = fp === 'FY'
    const range = annual ? YEAR_DAYS : QUARTER_DAYS

    // Langkah satu: tentukan akhir periodenya lebih dulu, dari fakta berdurasi
    // yang panjangnya benar. Fakta neraca di filing yang sama juga memuat angka
    // pembanding tahun lalu, dan tanpa patokan tanggal, angka pembanding itulah
    // yang sering terambil.
    const durations = collected.filter(
      (c) => c.span !== null && c.span >= range.min && c.span <= range.max,
    )
    const instants = collected.filter((c) => c.span === null)

    const periodEnd =
      durations.length > 0
        ? durations.map((c) => c.fact.end).sort().at(-1)!
        : instants.map((c) => c.fact.end).sort().at(-1)
    if (!periodEnd) continue

    // Langkah dua: ambil hanya fakta yang berakhir tepat di akhir periode itu.
    const items: Record<string, number> = {}
    const currencyOf = new Map<string, string>()

    for (const spec of specs) {
      const pool = (spec.kind === 'durasi' ? durations : instants).filter(
        (c) => c.spec.name === spec.name && c.fact.end === periodEnd,
      )
      if (pool.length === 0) continue

      // Sinonim berurutan prioritas: yang paling awal di daftar menang.
      pool.sort((a, b) => spec.usGaap.indexOf(tagOf(a)) - spec.usGaap.indexOf(tagOf(b)))
      items[spec.name] = pool[0].fact.val
      currencyOf.set(spec.name, pool[0].unit)
    }

    // Langkah tiga: pos arus kas sering hanya dilaporkan sebagai angka berjalan
    // sejak awal tahun buku, tidak pernah per kuartal. Nilai kuartalnya
    // diturunkan dengan selisih, bukan dibiarkan kosong.
    if (!annual) {
      for (const spec of specs) {
        if (spec.kind !== 'durasi' || spec.name in items) continue

        const ytd = collected.find(
          (c) =>
            c.spec.name === spec.name &&
            c.span !== null &&
            c.span > range.max &&
            c.fact.end === periodEnd,
        )
        if (ytd) {
          items[`__ytd_${spec.name}`] = ytd.fact.val
          currencyOf.set(spec.name, ytd.unit)
        }
      }
    }

    const missing = required.filter((name) => !(name in items))
    const completeness = required.length === 0 ? 1 : 1 - missing.length / required.length
    if (completeness < 0.25) continue

    const filed = collected.map((c) => c.fact.filed).sort()[0]
    const currency = [...currencyOf.values()].find((u) => u !== 'shares')?.split('/')[0] ?? 'USD'

    rows.push({
      period: `${fy}-${fp}`,
      periodType: annual ? 'tahunan' : 'kuartal',
      periodEnd,
      reportedAt: filed,
      fiscalYear: fy,
      fiscalPeriod: fp,
      currency,
      sourceAccession: accn,
      items,
      missingItems: missing,
      completeness: Math.round(completeness * 1e4) / 1e4,
    })
  }

  return deriveQuarterlyFromYtd(rows.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)))

  function tagOf(c: Collected): string {
    // Nama elemen tidak dibawa di fakta, jadi dicari balik lewat nilai unit dan
    // daftar sinonimnya. Cukup untuk mengurutkan prioritas.
    return c.spec.usGaap.find((t) => gaap[t]?.units?.[c.unit]?.includes(c.fact)) ?? c.spec.usGaap[0]
  }
}

/**
 * Turunkan nilai kuartal dari angka berjalan sejak awal tahun buku.
 *
 * Kuartal kedua sama dengan enam bulan dikurangi tiga bulan; kuartal ketiga
 * sama dengan sembilan bulan dikurangi enam bulan. Tanpa langkah ini, arus kas
 * operasi hilang di dua dari tiga kuartal — dan tanpa arus kas operasi tidak
 * ada rumus akrual, tidak ada Piotroski kriteria empat, dan tidak ada arus kas
 * bebas.
 */
function deriveQuarterlyFromYtd(rows: CanonicalPeriod[]): CanonicalPeriod[] {
  const quarterOrder = ['Q1', 'Q2', 'Q3', 'Q4']

  for (const row of rows) {
    const ytdKeys = Object.keys(row.items).filter((k) => k.startsWith('__ytd_'))
    if (ytdKeys.length === 0) continue

    const index = quarterOrder.indexOf(row.fiscalPeriod)

    for (const key of ytdKeys) {
      const name = key.slice('__ytd_'.length)
      const ytd = row.items[key]

      if (index <= 0) {
        // Kuartal pertama: angka berjalan sama dengan angka kuartalnya.
        row.items[name] = ytd
        continue
      }

      // Angka berjalan kuartal sebelumnya jarang tersimpan sebagai angka
      // berjalan: pada kuartal pertama, tiga bulan dan sejak-awal-tahun adalah
      // rentang yang sama, jadi ia masuk sebagai nilai kuartal biasa. Karena itu
      // pembandingnya dijumlah dari nilai kuartal yang sudah ada, bukan dicari
      // sebagai satu angka berjalan yang mungkin tidak pernah ada.
      let previousYtd: number | undefined
      let accumulated = 0
      let complete = true

      for (let i = 0; i < index; i++) {
        const earlier = rows.find(
          (r) => r.fiscalYear === row.fiscalYear && r.fiscalPeriod === quarterOrder[i],
        )
        const explicit = earlier?.items[`__ytd_${name}`]
        if (explicit !== undefined) {
          // Angka berjalan eksplisit sudah mencakup seluruh kuartal sebelumnya,
          // jadi ia menggantikan penjumlahan, bukan menambahinya.
          accumulated = explicit
          complete = true
          continue
        }
        const quarterly = earlier?.items[name]
        if (quarterly === undefined) {
          complete = false
          break
        }
        accumulated += quarterly
      }

      if (complete) previousYtd = accumulated

      // Tanpa kuartal sebelumnya yang lengkap, selisihnya tidak bisa dihitung.
      // Dibiarkan kosong, bukan diisi angka berjalan yang akan terbaca berlipat.
      if (previousYtd !== undefined) row.items[name] = ytd - previousYtd
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row.items)) {
      if (key.startsWith('__ytd_')) delete row.items[key]
    }
    row.missingItems = row.missingItems.filter((n) => !(n in row.items))
    const total = row.missingItems.length + Object.keys(row.items).length
    row.completeness =
      total === 0 ? 1 : Math.round((1 - row.missingItems.length / Math.max(1, total)) * 1e4) / 1e4
  }

  return rows
}

/**
 * Pemeriksaan kewarasan sebelum baris masuk.
 *
 * Identitas neraca adalah uji terkuat di seluruh daftar: kalau aset tidak sama
 * dengan liabilitas ditambah ekuitas, pemetaan posnya pasti salah. Tidak ada
 * perdebatan metodologi di situ, hanya bug.
 */
export function sanityCheck(row: CanonicalPeriod): string | null {
  const { items } = row

  const aset = items.total_aset
  const liabilitas = items.total_liabilitas
  const ekuitas = items.ekuitas

  if (aset !== undefined && liabilitas !== undefined && ekuitas !== undefined && aset > 0) {
    const selisih = Math.abs(aset - (liabilitas + ekuitas)) / aset
    if (selisih > 0.02) {
      return `identitas neraca meleset ${(selisih * 100).toFixed(1)}%`
    }
  }

  if (items.saham_beredar !== undefined && items.saham_beredar <= 0) {
    return 'saham beredar nol atau negatif'
  }

  if (items.pendapatan !== undefined && items.laba_bersih !== undefined && items.pendapatan > 0) {
    const margin = items.laba_bersih / items.pendapatan
    if (margin > 1 || margin < -1) {
      return `margin bersih di luar akal: ${(margin * 100).toFixed(0)}%`
    }
  }

  if (row.reportedAt < row.periodEnd) {
    return 'tanggal terbit mendahului akhir periode'
  }

  return null
}

export { type ItemSpec }
