/**
 * Laporan keuangan dari Yahoo Finance, untuk saham di luar jangkauan EDGAR:
 * bursa Indonesia dan bursa global (Tokyo, Hong Kong, London, Eropa, dst.).
 *
 * Yahoo adalah agregator, bukan pelapor. Angkanya sudah dinormalisasi ke pos
 * standar dan dalam satuan penuh — tidak ada jebakan `unit_scale` seperti XBRL
 * IDX — tapi riwayatnya pendek (±5 kuartal dan ±4 tahun) dan ia tidak pernah
 * menyebut kapan laporan terbit. Karena itu peringkat sumbernya paling rendah,
 * dan tanggal terbitnya ditaksir secara konservatif (lihat `reportedAtFor`).
 */

import { fetchWithTimeout } from '@/lib/http/fetch'
import { requiredFor } from './items'
import type { CanonicalPeriod } from './edgar'

export const YAHOO_SOURCE_ID = 'yahoo-finance'

/**
 * Pos kanonik → tipe deret Yahoo, berurutan prioritas.
 *
 * Arus kas keluar (belanja modal, dividen, pembelian kembali) dilaporkan Yahoo
 * bernilai negatif, EDGAR positif. Disimpan sebagai nilai mutlak supaya satu
 * pos bermakna sama apa pun sumbernya.
 */
const MAP: { item: string; types: string[]; outflow?: boolean }[] = [
  { item: 'pendapatan', types: ['TotalRevenue', 'OperatingRevenue'] },
  { item: 'laba_kotor', types: ['GrossProfit'] },
  { item: 'laba_operasi', types: ['OperatingIncome'] },
  { item: 'laba_sebelum_pajak', types: ['PretaxIncome'] },
  { item: 'beban_pajak', types: ['TaxProvision'] },
  { item: 'beban_bunga', types: ['InterestExpense'] },
  { item: 'laba_bersih', types: ['NetIncomeCommonStockholders', 'NetIncome'] },
  { item: 'eps_dilusian', types: ['DilutedEPS'] },
  { item: 'eps_dasar', types: ['BasicEPS'] },
  { item: 'total_aset', types: ['TotalAssets'] },
  { item: 'aset_lancar', types: ['CurrentAssets'] },
  { item: 'kas', types: ['CashAndCashEquivalents', 'CashCashEquivalentsAndShortTermInvestments'] },
  { item: 'persediaan', types: ['Inventory'] },
  { item: 'aset_tetap', types: ['NetPPE'] },
  { item: 'piutang', types: ['AccountsReceivable'] },
  { item: 'total_liabilitas', types: ['TotalLiabilitiesNetMinorityInterest'] },
  { item: 'liabilitas_lancar', types: ['CurrentLiabilities'] },
  { item: 'utang_jangka_panjang', types: ['LongTermDebt'] },
  { item: 'utang_jangka_pendek', types: ['CurrentDebt'] },
  { item: 'ekuitas', types: ['StockholdersEquity'] },
  // Bukan pos kanonik untuk rumus: hanya supaya uji identitas neraca lengkap.
  // Aset = liabilitas + ekuitas induk + kepentingan nonpengendali.
  { item: 'kepentingan_nonpengendali', types: ['MinorityInterest'] },
  { item: 'laba_ditahan', types: ['RetainedEarnings'] },
  { item: 'saham_beredar', types: ['OrdinarySharesNumber', 'ShareIssued'] },
  { item: 'arus_kas_operasi', types: ['OperatingCashFlow'] },
  { item: 'belanja_modal', types: ['CapitalExpenditure'], outflow: true },
  { item: 'dividen_dibayar', types: ['CashDividendsPaid'], outflow: true },
  { item: 'pembelian_kembali_saham', types: ['RepurchaseOfCapitalStock'], outflow: true },
  { item: 'penerbitan_saham', types: ['IssuanceOfCapitalStock'] },
  { item: 'penyusutan', types: ['DepreciationAndAmortization', 'DepreciationAmortizationDepletion'] },
  { item: 'pendapatan_bunga_bersih', types: ['NetInterestIncome'] },
]

const ALL_TYPES = [...new Set(MAP.flatMap((m) => m.types))]

/**
 * Jeda antara akhir periode dan tanggal terbit yang dianggap.
 *
 * Yahoo tidak menyebut tanggal terbit, dan memakai akhir periode berarti
 * backtest melihat laporan sebulan dua bulan sebelum pasar melihatnya. Batas
 * OJK: laporan kuartal tanpa audit 1 bulan, tengah tahun 2–3 bulan, tahunan
 * teraudit 3 bulan. Diambil batas atasnya supaya tidak pernah terlalu cepat —
 * terlambat beberapa minggu hanya membuat fitur sedikit basi, terlalu cepat
 * membuat backtest bohong. Kuartal keempat Yahoo diturunkan dari laporan
 * tahunan, jadi ikut jeda tahunan.
 */
const QUARTER_LAG_DAYS = 60
const ANNUAL_LAG_DAYS = 90

const YAHOO_USER_AGENT = 'Mozilla/5.0 (compatible; ai-investment-committee/0.1)'

interface YahooPoint {
  asOfDate: string
  currencyCode?: string
  reportedValue?: { raw: number }
}

/** Seluruh deret laporan satu emiten: kuartalan dan tahunan dalam satu panggilan. */
export async function fetchYahooFundamentals(symbol: string): Promise<CanonicalPeriod[]> {
  const types = ALL_TYPES.flatMap((t) => [`quarterly${t}`, `annual${t}`]).join(',')
  const period2 = Math.floor(Date.now() / 1000)
  const period1 = period2 - 12 * 365 * 86_400

  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${period1}&period2=${period2}`,
    { label: `Yahoo Fundamentals (${symbol})`, headers: { 'User-Agent': YAHOO_USER_AGENT }, timeoutMs: 10_000 },
  )
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)

  const body = (await res.json()) as {
    timeseries?: { result?: { meta: { type: string[] }; [key: string]: unknown }[] }
  }
  return parseYahooTimeseries(body.timeseries?.result ?? [])
}

/** Murni, supaya bisa diuji tanpa jaringan. */
export function parseYahooTimeseries(
  result: { meta: { type: string[] }; [key: string]: unknown }[],
): CanonicalPeriod[] {
  // (jenis periode, akhir periode) → tipe Yahoo → nilai
  const raw = new Map<string, { currency: string | null; values: Map<string, number> }>()

  for (const series of result) {
    const fullType = series.meta?.type?.[0]
    if (!fullType) continue
    const periodType = fullType.startsWith('quarterly') ? 'kuartal' : fullType.startsWith('annual') ? 'tahunan' : null
    if (!periodType) continue
    const type = fullType.replace(/^(quarterly|annual)/, '')

    for (const point of (series[fullType] as (YahooPoint | null)[] | undefined) ?? []) {
      const value = point?.reportedValue?.raw
      if (!point || value === undefined || !Number.isFinite(value)) continue
      const key = `${periodType}|${point.asOfDate}`
      const slot = raw.get(key) ?? { currency: null, values: new Map() }
      slot.currency ??= point.currencyCode ?? null
      slot.values.set(type, value)
      raw.set(key, slot)
    }
  }

  // Bank tidak menyajikan neraca lancar/tidak lancar. Dikenali dari datanya
  // sendiri, bukan dari daftar nama: pendapatan bunga bersih ada, aset lancar
  // tidak pernah ada di periode mana pun.
  const slots = [...raw.values()]
  const isBank =
    slots.some((s) => s.values.has('NetInterestIncome')) && !slots.some((s) => s.values.has('CurrentAssets'))
  const required = requiredFor(isBank ? 'bank' : 'umum')

  // Bulan tutup buku: modus bulan akhir periode tahunan. Emiten Jepang dan
  // India umumnya tutup buku Maret, bukan Desember.
  const counts = new Map<number, number>()
  for (const key of raw.keys()) {
    if (key.startsWith('tahunan|')) {
      const m = Number(key.slice(13, 15))
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
  }
  const fyeMonth = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12

  const periods: CanonicalPeriod[] = []
  for (const [key, slot] of raw) {
    const [periodType, periodEnd] = key.split('|') as ['kuartal' | 'tahunan', string]
    const items: Record<string, number> = {}
    for (const m of MAP) {
      const type = m.types.find((t) => slot.values.has(t))
      if (type === undefined) continue
      const value = slot.values.get(type)!
      items[m.item] = m.outflow ? Math.abs(value) : value
    }
    if (Object.keys(items).length === 0) continue

    const year = Number(periodEnd.slice(0, 4))
    const month = Number(periodEnd.slice(5, 7))
    let fiscalYear = year
    let fiscalPeriod = 'FY'
    if (periodType === 'kuartal') {
      const q = ((month - fyeMonth + 12) % 12) / 3
      fiscalPeriod = `Q${q === 0 ? 4 : Math.round(q)}`
      if (month > fyeMonth) fiscalYear = year + 1
    }

    const missingItems = required.filter((name) => items[name] === undefined)
    const lag = periodType === 'tahunan' || fiscalPeriod === 'Q4' ? ANNUAL_LAG_DAYS : QUARTER_LAG_DAYS

    periods.push({
      period: `${fiscalYear}-${fiscalPeriod}`,
      periodType,
      periodEnd,
      reportedAt: addDays(periodEnd, lag),
      fiscalYear,
      fiscalPeriod,
      currency: slot.currency ?? 'UNKNOWN',
      // Yahoo tidak punya nomor filing. Satu versi per periode: angka yang
      // direvisi menimpa yang lama, dan itu jujur untuk sumber yang memang
      // hanya menyimpan versi terbarunya.
      sourceAccession: `yahoo:${periodEnd}`,
      items,
      missingItems,
      completeness: required.length === 0 ? 1 : (required.length - missingItems.length) / required.length,
    })
  }

  return periods.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
}

/** Bulan tutup buku yang dipakai parser, untuk disimpan bersama barisnya. */
export function fiscalYearEndMonthOf(periods: CanonicalPeriod[]): number | null {
  const annual = periods.find((p) => p.periodType === 'tahunan')
  return annual ? Number(annual.periodEnd.slice(5, 7)) : null
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
