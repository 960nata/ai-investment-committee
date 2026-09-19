/**
 * Klien SEC EDGAR — sumber fundamental gratis kelas primer.
 *
 * Tiga API XBRL di data.sec.gov, tanpa kunci dan tanpa pendaftaran. Sudah
 * diverifikasi hidup: companyconcept, companyfacts, dan frames semuanya
 * menjawab JSON, dan `frames` untuk satu pos satu periode mengembalikan lebih
 * dari enam ribu emiten sekaligus.
 *
 * Yang membuat EDGAR layak dipakai sebagai sumber utama, bukan sekadar
 * cadangan: tiap fakta membawa `filed` dan `accn`. `filed` adalah tanggal
 * laporan benar-benar terbit, dan itulah `reported_at` yang menegakkan aturan
 * point-in-time. Tanpa kolom itu backtest horizon panjang memakai angka yang
 * belum diketahui pasar pada tanggal simulasinya, dan hasilnya terlihat
 * brilian tepat sampai uang sungguhan dipakai.
 *
 * `accn` membuat penyajian ulang terlihat. Satu periode bisa muncul beberapa
 * kali dari filing berbeda dengan angka berbeda; keduanya disimpan, tidak ada
 * yang ditimpa, persis seperti kunci (instrument, period, source_accession) di
 * rancangan basis data.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'
import { ITEMS, requiredFor, type ItemSpec } from './items'

const SEC_DATA = 'https://data.sec.gov'
const SEC_WWW = 'https://www.sec.gov'

/**
 * SEC mewajibkan header identitas pada tiap permintaan; permintaan tanpa itu
 * ditolak. Isinya nama aplikasi dan alamat surel yang bisa dihubungi.
 */
const USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'investasi-app kontak@example.com'

/**
 * SEC membatasi laju permintaan otomatis. Batas yang dikutip adalah sepuluh per
 * detik; dipakai delapan supaya ada ruang, dan permintaan dijalankan berurutan
 * bukan serentak. Untuk pengambilan massal, jangan pakai fungsi ini sama sekali
 * — unduh companyfacts.zip yang berisi seluruh emiten dalam satu berkas.
 */
const MIN_INTERVAL_MS = 125
let lastRequestAt = 0

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

async function secGet<T>(url: string, label: string): Promise<T> {
  await throttle()
  const res = await fetchWithTimeout(url, {
    label,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip, deflate',
    },
  })
  if (!res.ok) {
    throw new Error(`${label} menjawab HTTP ${res.status} untuk ${url}`)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Pemetaan ticker ke CIK
// ---------------------------------------------------------------------------

/**
 * Kunci internal EDGAR adalah CIK, bukan ticker. Ticker berubah saat emiten
 * ganti nama, dan ticker emiten yang delisting bisa dipakai ulang emiten baru
 * bertahun-tahun kemudian — backtest yang mengunci pada ticker diam-diam
 * mencampur dua perusahaan berbeda. CIK tidak pernah berubah.
 */
export interface TickerEntry {
  cik: string
  ticker: string
  title: string
}

let tickerCache: Map<string, TickerEntry> | null = null

export async function loadTickerMap(): Promise<Map<string, TickerEntry>> {
  if (tickerCache) return tickerCache

  const raw = await secGet<Record<string, { cik_str: number; ticker: string; title: string }>>(
    `${SEC_WWW}/files/company_tickers.json`,
    'SEC company_tickers',
  )

  const map = new Map<string, TickerEntry>()
  for (const row of Object.values(raw)) {
    map.set(row.ticker.toUpperCase(), {
      // CIK harus sepuluh digit dengan nol di depan pada URL API.
      cik: String(row.cik_str).padStart(10, '0'),
      ticker: row.ticker.toUpperCase(),
      title: row.title,
    })
  }

  tickerCache = map
  return map
}

export async function resolveCik(ticker: string): Promise<string | null> {
  const map = await loadTickerMap()
  return map.get(ticker.toUpperCase())?.cik ?? null
}

// ---------------------------------------------------------------------------
// Company facts
// ---------------------------------------------------------------------------

export interface SecFact {
  start?: string
  end: string
  val: number
  accn: string
  fy: number
  fp: string
  form: string
  filed: string
  frame?: string
}

export interface CompanyFacts {
  cik: number
  entityName: string
  facts: Record<string, Record<string, { label?: string; units: Record<string, SecFact[]> }>>
}

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  return secGet<CompanyFacts>(
    `${SEC_DATA}/api/xbrl/companyfacts/CIK${cik}.json`,
    'SEC companyfacts',
  )
}

// ---------------------------------------------------------------------------
// Pemetaan ke pos kanonik
// ---------------------------------------------------------------------------

/** Satuan yang dipakai tiap pos. Salah satuan menghasilkan angka yang meleset ribuan kali. */
function unitFor(item: ItemSpec): string {
  if (item.name === 'saham_beredar') return 'shares'
  if (item.name === 'eps_dilusian') return 'USD/shares'
  return 'USD'
}

/**
 * Ambil deret fakta untuk satu pos kanonik, memakai elemen us-gaap pertama yang
 * benar-benar punya data. Urutan di `ITEMS` adalah urutan prioritas, dan itu
 * penting: emiten berbeda memakai elemen berbeda untuk konsep yang sama.
 */
function factsForItem(facts: CompanyFacts, item: ItemSpec): SecFact[] {
  const gaap = facts.facts['us-gaap']
  if (!gaap) return []

  const unit = unitFor(item)
  for (const tag of item.usGaap) {
    const series = gaap[tag]?.units?.[unit]
    if (series && series.length > 0) return series
  }
  return []
}

// ---------------------------------------------------------------------------
// Periode kanonik
// ---------------------------------------------------------------------------

export interface FundamentalPeriod {
  cik: string
  entityName: string
  periodStart: string
  periodEnd: string
  periodType: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
  fiscalYear: number
  /** Tanggal terbit. Inilah kunci aturan point-in-time. */
  reportedAt: string
  /** Nomor filing asal. Membedakan laporan asli dari penyajian ulang. */
  accession: string
  form: string
  currency: 'USD'
  items: Record<string, number>
  missingItems: string[]
  completeness: number
}

export interface ExtractOptions {
  /** Bank tidak punya sebagian pos, dan menghitungnya sebagai hilang itu keliru. */
  kind?: 'umum' | 'bank'
  /** 'FY' untuk tahunan saja, 'all' untuk tahunan dan triwulanan. */
  periods?: 'FY' | 'all'
}

/**
 * Ubah companyfacts jadi baris per periode per filing.
 *
 * Satu pos diambil dari filing yang sama dengan periodenya bila ada. Kalau
 * tidak, dipakai fakta periode sama dari filing mana pun yang terbit **tidak
 * lebih lambat** dari filing ini — tidak pernah dari filing yang terbit
 * belakangan, karena angka itu belum diketahui siapa pun pada tanggal tersebut.
 */
export function extractPeriods(
  facts: CompanyFacts,
  { kind = 'umum', periods = 'FY' }: ExtractOptions = {},
): FundamentalPeriod[] {
  const cik = String(facts.cik).padStart(10, '0')
  const applicable = ITEMS.filter(
    (i) => !(kind === 'bank' && i.notApplicableTo?.includes('bank')),
  )
  const required = requiredFor(kind)

  // Deret per pos, dihitung sekali.
  const byItem = new Map<string, SecFact[]>()
  for (const item of applicable) {
    byItem.set(item.name, factsForItem(facts, item))
  }

  // Tulang punggung periode diambil dari pendapatan: satu-satunya pos berdurasi
  // yang hampir pasti ada di tiap filing dan membawa start, end, fy, fp, form.
  const spine = byItem.get('pendapatan') ?? []
  if (spine.length === 0) return []

  const wanted = (f: SecFact) =>
    periods === 'FY' ? f.fp === 'FY' && f.form.startsWith('10-K') : true

  // Satu periode bisa muncul dari beberapa filing. Semuanya disimpan — itu yang
  // membuat penyajian ulang terlihat, bukan tertimpa diam-diam.
  const seen = new Set<string>()
  const out: FundamentalPeriod[] = []

  for (const s of spine) {
    if (!s.start || !wanted(s)) continue

    const key = `${s.end}|${s.accn}`
    if (seen.has(key)) continue
    seen.add(key)

    const items: Record<string, number> = {}
    const missing: string[] = []

    for (const item of applicable) {
      const series = byItem.get(item.name) ?? []

      const matchesPeriod = (f: SecFact) =>
        item.kind === 'sesaat'
          ? f.end === s.end
          : f.start === s.start && f.end === s.end

      // Filing yang sama lebih dulu; kalau tidak ada, filing terbaru yang sudah
      // terbit pada tanggal ini. Tidak pernah yang terbit sesudahnya.
      const candidates = series
        .filter((f) => matchesPeriod(f) && f.filed <= s.filed)
        .sort((a, b) => (a.filed < b.filed ? 1 : -1))

      const exact = candidates.find((f) => f.accn === s.accn)
      const chosen = exact ?? candidates[0]

      if (chosen) items[item.name] = chosen.val
      else if (required.includes(item.name)) missing.push(item.name)
    }

    out.push({
      cik,
      entityName: facts.entityName,
      periodStart: s.start,
      periodEnd: s.end,
      periodType: (s.fp === 'FY' ? 'FY' : s.fp) as FundamentalPeriod['periodType'],
      fiscalYear: s.fy,
      reportedAt: s.filed,
      accession: s.accn,
      form: s.form,
      currency: 'USD',
      items,
      missingItems: missing,
      completeness: (required.length - missing.length) / required.length,
    })
  }

  return out.sort((a, b) =>
    a.periodEnd === b.periodEnd
      ? a.reportedAt.localeCompare(b.reportedAt)
      : a.periodEnd.localeCompare(b.periodEnd),
  )
}

/**
 * Versi terbaik satu periode pada tanggal tertentu — dipakai backtest.
 *
 * Bukan versi terakhir, melainkan versi terakhir yang sudah terbit pada `asOf`.
 * Perbedaan itu yang memisahkan backtest jujur dari backtest yang melihat masa
 * depan.
 */
export function periodAsOf(
  rows: FundamentalPeriod[],
  periodEnd: string,
  asOf: string,
): FundamentalPeriod | null {
  const candidates = rows
    .filter((r) => r.periodEnd === periodEnd && r.reportedAt <= asOf)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  return candidates[0] ?? null
}

/** Laporan keuangan terakhir yang sudah terbit pada tanggal tertentu. */
export function latestAsOf(
  rows: FundamentalPeriod[],
  asOf: string,
): FundamentalPeriod | null {
  const published = rows
    .filter((r) => r.reportedAt <= asOf)
    .sort((a, b) =>
      a.periodEnd === b.periodEnd
        ? b.reportedAt.localeCompare(a.reportedAt)
        : b.periodEnd.localeCompare(a.periodEnd),
    )
  return published[0] ?? null
}

// ---------------------------------------------------------------------------
// Frames — satu pos, seluruh emiten, satu panggilan
// ---------------------------------------------------------------------------

export interface FrameEntry {
  accn: string
  cik: number
  entityName: string
  loc?: string
  start?: string
  end: string
  val: number
}

/**
 * Frames mengembalikan satu pos untuk seluruh emiten pada satu periode. Untuk
 * membangun peringkat lintas penampang — yang dibutuhkan normalisasi persentil
 * sektor — ini persis bentuk datanya, dan menghemat ribuan panggilan per emiten.
 *
 * Periode instan memakai akhiran I: CY2024Q4I untuk pos neraca. Periode
 * berdurasi tanpa akhiran: CY2024 atau CY2024Q2.
 */
export async function fetchFrame(
  tag: string,
  period: string,
  unit = 'USD',
): Promise<FrameEntry[]> {
  const data = await secGet<{ data: FrameEntry[] }>(
    `${SEC_DATA}/api/xbrl/frames/us-gaap/${tag}/${unit}/${period}.json`,
    'SEC frames',
  )
  return data.data ?? []
}

/** Ping ringan untuk health check adaptor. */
export async function health(): Promise<{ healthy: boolean; latencyMs: number; lastError?: string }> {
  const t0 = Date.now()
  try {
    await secGet(
      `${SEC_DATA}/api/xbrl/companyconcept/CIK0000320193/us-gaap/Revenues.json`,
      'SEC health',
    )
    return { healthy: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - t0,
      lastError: err instanceof Error ? err.message : String(err),
    }
  }
}
