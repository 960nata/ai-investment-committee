/**
 * Data non-harga untuk kelas aset yang tidak punya laporan keuangan atau KSEI.
 *
 * Tiga kelompok bobot — sentimen, arus dana, dan (untuk komoditas) kekuatan
 * relatif — dulu kosong untuk seluruh kripto, memecoin, komoditas, dan indeks,
 * jadi skornya jatuh ke "tidak memadai" bukan karena buktinya lemah, tetapi
 * karena tidak ada yang pernah ditanyakan. Sumber di sini semuanya publik,
 * gratis, dan punya riwayat panjang:
 *
 *   FNG           Fear & Greed kripto, harian sejak 2018 (alternative.me)
 *   TAKER:<sym>   porsi volume beli agresif (taker buy) per koin, harian, dari
 *                 kline Binance — kolom yang sama yang sudah dipakai untuk harga
 *   COT:<sym>     posisi bersih managed money / open interest, mingguan (CFTC
 *                 Disaggregated), untuk komoditas
 *   TFF:<sym>     posisi bersih leveraged funds / open interest, mingguan (CFTC
 *                 Traders in Financial Futures), untuk indeks AS, VIX, dan dolar
 *
 * Semua disimpan di `macro_series` dengan tanggal KETERSEDIAAN, bukan tanggal
 * pengamatan: laporan COT per Selasa terbit Jumat sore waktu AS, jadi disimpan
 * sebagai Senin berikutnya. Memakainya di hari Selasa adalah melihat masa depan.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'

export interface ExternalPoint {
  seriesId: string
  date: string
  value: number
  source: string
}

/** Kontrak Disaggregated CFTC per komoditas yang dilacak. */
export const COT_CONTRACTS: Record<string, string> = {
  'CL=F': '067651',
  'BZ=F': '06765T',
  'NG=F': '023651',
  'HO=F': '022651',
  'RB=F': '111659',
  'GC=F': '088691',
  'SI=F': '084691',
  'HG=F': '085692',
  'PL=F': '076651',
  'PA=F': '075651',
  'ZC=F': '002602',
  'ZW=F': '001602',
  'ZS=F': '005602',
  'ZM=F': '026603',
  'ZL=F': '007601',
  'ZO=F': '004603',
  'ZR=F': '039601',
  'KC=F': '083731',
  'SB=F': '080732',
  'CC=F': '073732',
  'CT=F': '033661',
  'OJ=F': '040701',
  'LE=F': '057642',
  'HE=F': '054642',
  'LBR=F': '058644',
}

/**
 * Kontrak Traders in Financial Futures per indeks. Hanya yang kontraknya aktif
 * di bursa AS; Nikkei CME berhenti dilaporkan Maret 2026, indeks Asia dan Eropa
 * lain tidak diperdagangkan di bursa yang dilaporkan CFTC.
 */
export const TFF_CONTRACTS: Record<string, string> = {
  '^GSPC': '13874A',
  '^IXIC': '209742',
  '^DJI': '124603',
  '^RUT': '239742',
  '^VIX': '1170E1',
  'DX-Y.NYB': '098662',
}

const USER_AGENT = 'ai-investment-committee/0.1 (analisis data pribadi)'

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Fear & Greed kripto, seluruh riwayat. */
export async function fetchFearGreed(): Promise<ExternalPoint[]> {
  const res = await fetchWithTimeout('https://api.alternative.me/fng/?limit=0&format=json', {
    label: 'Fear & Greed',
    timeoutMs: 20_000,
  })
  if (!res.ok) throw new Error(`Fear & Greed HTTP ${res.status}`)
  const body = (await res.json()) as { data?: { value: string; timestamp: string }[] }
  return (body.data ?? [])
    .map((d) => ({ seriesId: 'FNG', date: isoDay(Number(d.timestamp) * 1000), value: Number(d.value), source: 'alternative.me' }))
    .filter((p) => Number.isFinite(p.value))
}

const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'] as const

/**
 * Porsi volume taker-buy harian satu koin, sejak `fromMs`.
 *
 * Taker adalah pihak yang menyeberang spread — pembeli yang tidak mau menunggu.
 * Porsinya di atas 0,5 berarti tekanan beli agresif lebih besar dari tekanan
 * jual agresif pada hari itu.
 */
export async function fetchTakerBuyRatio(symbol: string, fromMs: number): Promise<ExternalPoint[]> {
  const out: ExternalPoint[] = []
  let start = fromMs
  for (let page = 0; page < 10; page++) {
    let rows: unknown[][] | null = null
    for (const host of BINANCE_HOSTS) {
      try {
        const res = await fetchWithTimeout(
          `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&startTime=${start}&limit=1000`,
          { label: `Binance taker ${symbol}`, timeoutMs: 10_000 },
        )
        if (res.ok) {
          rows = (await res.json()) as unknown[][]
          break
        }
      } catch {
        // host berikutnya
      }
    }
    if (!rows) throw new Error(`Binance tidak menjawab untuk ${symbol}`)
    if (rows.length === 0) break

    for (const k of rows) {
      const volume = Number(k[5])
      const takerBuy = Number(k[9])
      if (!(volume > 0) || !Number.isFinite(takerBuy)) continue
      out.push({ seriesId: `TAKER:${symbol}`, date: isoDay(Number(k[0])), value: takerBuy / volume, source: 'binance' })
    }
    if (rows.length < 1000) break
    start = Number(rows[rows.length - 1][0]) + 86_400_000
  }
  // Lilin hari berjalan belum selesai; porsinya berubah sampai tengah malam UTC.
  const today = isoDay(Date.now())
  return out.filter((p) => p.date < today)
}

/**
 * Hari ketersediaan laporan CFTC: posisi per Selasa terbit Jumat 15:30 waktu
 * New York, yang sudah Sabtu dini hari WIB. Dianggap tersedia Senin berikutnya.
 */
function cotAvailableAt(reportDate: string): string {
  const d = new Date(`${reportDate.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 6)
  return isoDay(d.getTime())
}

async function fetchCftc(
  dataset: string,
  code: string,
  longField: string,
  shortField: string,
): Promise<{ date: string; net: number }[]> {
  const params = new URLSearchParams({
    $select: `report_date_as_yyyy_mm_dd,open_interest_all,${longField},${shortField}`,
    $where: `cftc_contract_market_code='${code}'`,
    $order: 'report_date_as_yyyy_mm_dd',
    $limit: '5000',
  })
  const res = await fetchWithTimeout(`https://publicreporting.cftc.gov/resource/${dataset}.json?${params}`, {
    label: `CFTC ${code}`,
    headers: { 'User-Agent': USER_AGENT },
    timeoutMs: 30_000,
  })
  if (!res.ok) throw new Error(`CFTC ${code} HTTP ${res.status}`)
  const rows = (await res.json()) as Record<string, string>[]
  const out: { date: string; net: number }[] = []
  for (const r of rows) {
    const oi = Number(r.open_interest_all)
    const long = Number(r[longField])
    const short = Number(r[shortField])
    if (!(oi > 0) || !Number.isFinite(long) || !Number.isFinite(short)) continue
    out.push({ date: cotAvailableAt(r.report_date_as_yyyy_mm_dd), net: (long - short) / oi })
  }
  return out
}

/** Posisi bersih managed money sebagai porsi open interest, per komoditas. */
export async function fetchCot(symbol: string): Promise<ExternalPoint[]> {
  const code = COT_CONTRACTS[symbol]
  if (!code) return []
  const rows = await fetchCftc('72hh-3qpy', code, 'm_money_positions_long_all', 'm_money_positions_short_all')
  return rows.map((r) => ({ seriesId: `COT:${symbol}`, date: r.date, value: r.net, source: 'cftc' }))
}

/** Posisi bersih leveraged funds sebagai porsi open interest, per indeks. */
export async function fetchTff(symbol: string): Promise<ExternalPoint[]> {
  const code = TFF_CONTRACTS[symbol]
  if (!code) return []
  const rows = await fetchCftc('gpe5-46if', code, 'lev_money_positions_long', 'lev_money_positions_short')
  return rows.map((r) => ({ seriesId: `TFF:${symbol}`, date: r.date, value: r.net, source: 'cftc' }))
}
