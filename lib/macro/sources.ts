/**
 * Deret makro dari sumber terbuka tanpa kunci API.
 *
 * FRED menyediakan unduhan CSV per deret tanpa pendaftaran di
 * fred.stlouisfed.org/graph/fredgraph.csv — kunci API hanya dibutuhkan untuk
 * API JSON-nya. World Bank sepenuhnya terbuka.
 *
 * Yang sudah diperiksa tidak tersedia dan sengaja TIDAK diambil:
 *   - IRLTLT01IDM156N (SBN 10 tahun, OECD) — 404 di FRED.
 *   - INTDSRIDM193N (suku bunga diskonto BI) — berhenti diperbarui 2013.
 *   - IMF IFS — API lama tidak menjawab, API baru memakai struktur berbeda.
 * Akibatnya Rf Indonesia (SBN 10 tahun) belum punya sumber otomatis; lihat
 * `macroAssumptions()`.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'

export interface MacroPoint {
  seriesId: string
  date: string
  value: number
  source: 'fred' | 'worldbank'
}

export interface MacroSeriesSpec {
  id: string
  source: 'fred' | 'worldbank'
  /** Kode di sumbernya. */
  code: string
  country?: 'IDN' | 'USA'
  label: string
}

export const MACRO_SERIES: MacroSeriesSpec[] = [
  { id: 'FRED:GS10', source: 'fred', code: 'GS10', label: 'Imbal hasil Treasury AS 10 tahun (Rf AS), bulanan' },
  { id: 'FRED:IRSTCI01IDM156N', source: 'fred', code: 'IRSTCI01IDM156N', label: 'Suku bunga antarbank Indonesia, bulanan' },
  { id: 'FRED:CPIAUCSL', source: 'fred', code: 'CPIAUCSL', label: 'Indeks harga konsumen AS, bulanan' },
  ...(['IDN', 'USA'] as const).flatMap((c) => [
    { id: `WB:${c}:NY.GDP.MKTP.KD.ZG`, source: 'worldbank' as const, code: 'NY.GDP.MKTP.KD.ZG', country: c, label: `Pertumbuhan PDB riil ${c}, tahunan` },
    { id: `WB:${c}:FP.CPI.TOTL.ZG`, source: 'worldbank' as const, code: 'FP.CPI.TOTL.ZG', country: c, label: `Inflasi ${c}, tahunan` },
    { id: `WB:${c}:NY.GDP.MKTP.CN`, source: 'worldbank' as const, code: 'NY.GDP.MKTP.CN', country: c, label: `PDB nominal ${c} (mata uang lokal), tahunan` },
  ]),
]

async function fetchFred(spec: MacroSeriesSpec): Promise<MacroPoint[]> {
  const res = await fetchWithTimeout(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${spec.code}`, {
    label: 'FRED',
    timeoutMs: 30_000,
  })
  if (!res.ok) throw new Error(`FRED ${spec.code} menjawab HTTP ${res.status}`)
  const text = await res.text()
  if (!text.startsWith('observation_date')) throw new Error(`FRED ${spec.code} tidak mengembalikan CSV`)
  const out: MacroPoint[] = []
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',')
    // FRED menulis "." untuk nilai yang tidak ada; itu kekosongan, bukan nol.
    const value = Number(raw)
    if (!date || raw === undefined || raw.trim() === '.' || !Number.isFinite(value)) continue
    out.push({ seriesId: spec.id, date, value, source: 'fred' })
  }
  return out
}

async function fetchWorldBank(spec: MacroSeriesSpec): Promise<MacroPoint[]> {
  const url = `https://api.worldbank.org/v2/country/${spec.country}/indicator/${spec.code}?format=json&per_page=200`
  const res = await fetchWithTimeout(url, { label: 'World Bank', timeoutMs: 30_000 })
  if (!res.ok) throw new Error(`World Bank ${spec.id} menjawab HTTP ${res.status}`)
  const body = (await res.json()) as [unknown, { date: string; value: number | null }[] | null]
  const rows = body?.[1] ?? []
  // Nilai tahunan dicatat di akhir tahunnya: PDB 2025 baru diketahui setelah
  // 2025 berakhir, tidak di 1 Januari 2025.
  return rows
    .filter((r) => r.value !== null && Number.isFinite(r.value))
    .map((r) => ({ seriesId: spec.id, date: `${r.date}-12-31`, value: r.value as number, source: 'worldbank' as const }))
}

export function fetchMacroSeries(spec: MacroSeriesSpec): Promise<MacroPoint[]> {
  return spec.source === 'fred' ? fetchFred(spec) : fetchWorldBank(spec)
}

// ---------------------------------------------------------------------------
// Asumsi model jangka panjang
// ---------------------------------------------------------------------------

/**
 * Equity risk premium Indonesia.
 *
 * Parameter paling subjektif di seluruh sistem dan paling berpengaruh terhadap
 * DCF: menggeser ERP dari 6% ke 8% bisa mengubah nilai wajar sebuah saham sampai
 * 30%. Karena itu ia ditulis di sini sebagai ASUMSI bernama, bukan angka yang
 * tersembunyi di dalam rumus, dan harus ditampilkan ke pembaca sebagai asumsi
 * yang bisa diubah. 7% adalah titik tengah rentang 6-8% di dokumen sumber data.
 */
export const ERP_INDONESIA = 0.07

/**
 * Batas atas pertumbuhan terminal.
 *
 * Perusahaan yang diasumsikan tumbuh selamanya di atas PDB nominal akhirnya
 * menjadi seluruh ekonomi — mustahil secara aritmetis, tetapi kesalahan ini
 * sering lolos di model DCF dan membuat nilai wajar membengkak tanpa batas.
 * Batasnya ditegakkan di sini, bukan sekadar disebut di dokumen.
 */
export function capTerminalGrowth(requested: number, nominalGdpGrowth: number | null): {
  value: number
  capped: boolean
} {
  if (nominalGdpGrowth === null || !Number.isFinite(nominalGdpGrowth)) {
    // Tanpa data PDB, batas konservatifnya inflasi jangka panjang yang wajar.
    const fallback = 0.03
    return { value: Math.min(requested, fallback), capped: requested > fallback }
  }
  return { value: Math.min(requested, nominalGdpGrowth), capped: requested > nominalGdpGrowth }
}
