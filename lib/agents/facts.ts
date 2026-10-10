/**
 * Metrik pasar — perhitungan murni
 *
 * Tanpa I/O, tanpa jam global, tanpa database. Alasannya sama dengan
 * `lib/jobs/due.ts`: aritmetika yang salah di sini tidak akan menimbulkan galat,
 * ia hanya menghasilkan angka yang keliru sedikit, dan angka seperti itu lolos
 * sampai ke putusan komite tanpa ada yang menyadarinya. Yang bisa diuji dengan
 * deret buatan akan ketahuan sebelum sampai ke sana.
 *
 * Pengambilan datanya ada di `tools.ts`.
 */

import type { InstrumentView } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'

/** Jumlah hari perdagangan minimum sebelum sebuah metrik layak dilaporkan. */
export const MIN_CANDLES = 30

/**
 * Umur data maksimum sebelum sebuah instrumen dianggap tidak layak dinilai.
 * Crypto diperdagangkan tiap hari, jadi jeda dua hari sudah berarti pipeline
 * berhenti; bursa saham punya akhir pekan dan hari libur, jadi ambangnya lebih
 * longgar. Komite membaca ambang ini sebelum memanggil model sama sekali.
 */
export const STALE_LIMIT_DAYS: Record<MarketCode, number> = {
  CRYPTO: 2,
  IDX: 5,
  US: 5,
  // Berjangka libur akhir pekan dan hari besar, sama seperti bursa saham.
  GLOBAL: 5,
}

export interface PricePoint {
  date: string
  close: number
  volume: number
  /** OHLC opsional: tanpa ini ringkasan candle memakai harga penutupan. */
  open?: number
  high?: number
  low?: number
}

/** Satu candle hasil agregasi (bulanan atau tahunan) untuk dibaca model. */
export interface PeriodCandle {
  /** `YYYY-MM` untuk bulanan, `YYYY` untuk tahunan. */
  period: string
  open: number
  high: number
  low: number
  close: number
  /** Perubahan terhadap penutupan periode sebelumnya; null untuk periode pertama. */
  changePct: number | null
  /** Periode yang belum selesai atau baru sebagian terekam. */
  partial: boolean
}

export interface MarketFacts {
  symbol: string
  market: MarketCode
  name: string
  currency: string
  /** Tanggal candle terakhir yang tersimpan, bukan tanggal hari ini. */
  asOf: string
  /**
   * Kesegaran: hari kalender sejak candle terakhir. 0 berarti data hari ini —
   * BUKAN panjang riwayat. Tesis di atas data basi harus ditolak, bukan dipakai.
   */
  staleDays: number
  /** Candle yang dianalisis (dibatasi jendela tarikan, bukan seluruh isi database). */
  candleCount: number
  /** Tanggal candle tertua yang dianalisis. */
  historyStart: string
  /** Panjang riwayat yang dianalisis, dalam tahun kalender. */
  historyYears: number
  lastClose: number
  /**
   * Imbal hasil menurut hari KALENDER, bukan jumlah candle: 365 candle saham
   * adalah hampir satu setengah tahun, 365 candle crypto tepat satu tahun.
   */
  returns: Record<'d1' | 'd7' | 'd30' | 'd90' | 'd365' | 'y2' | 'y3' | 'y5', number | null>
  /** Simpangan baku imbal hasil harian, disetahunkan, jendela 1 tahun terakhir. */
  annualisedVolatility: number | null
  /** Volatilitas yang sama di seluruh riwayat yang dianalisis. */
  volatilityFullHistory: number | null
  /** Penurunan terdalam dalam 1 tahun terakhir. */
  maxDrawdown: number | null
  /** Penurunan terdalam di seluruh riwayat yang dianalisis. */
  maxDrawdownFullHistory: number | null
  /** Rentang 52 minggu dan posisi harga di dalamnya (0 = di titik terendah, 100 = tertinggi). */
  range52w: { high: number; low: number; positionPct: number } | null
  /** Puncak tertinggi di riwayat yang dianalisis dan jarak harga sekarang darinya. */
  historyHigh: { value: number; date: string; pctFromHigh: number } | null
  sma: Record<'s20' | 's50' | 's200', number | null>
  /** Kemiringan SMA200 selama 20 candle terakhir, dalam persen. */
  sma200SlopePct: number | null
  /** Posisi harga terhadap rata-rata bergeraknya, dalam persen. */
  priceVsSma50Pct: number | null
  trend: 'naik' | 'turun' | 'menyamping' | 'tidak cukup data'
  /** Rasio volume 20 hari terakhir terhadap 100 hari sebelumnya. */
  volumeRatio20v100: number | null
  /** Dua belas candle bulanan terakhir. */
  monthly: PeriodCandle[]
  /** Candle tahunan sepanjang riwayat yang dianalisis. */
  yearly: PeriodCandle[]
  /**
   * Fitur non-harga pada tanggal fitur terakhir: laporan keuangan dan
   * kepemilikan KSEI. Sudah point-in-time — dihitung dari laporan yang terbit
   * pada tanggal itu, bukan dari periode yang sudah lewat. `null` bila jenis
   * asetnya memang tidak punya (kripto, indeks, komoditas).
   */
  fundamentals?: { asOf: string; values: Record<string, number | null> } | null
  /** Filing terakhir yang sudah terbit saat candle terakhir; angka mentahnya bukan hasil tebakan model. */
  financialReport?: {
    period: string
    periodEnd: string
    reportedAt: string
    sourceId: string
    accession: string
    currency: string
    completeness: number
    items: Record<string, number>
    missingItems: string[]
  } | null
  /**
   * Deret makro yang menggerakkan kelas aset ini: suku bunga kedua mata uang
   * untuk valas, kurva imbal hasil Treasury untuk obligasi. Angkanya dari
   * basis data (FRED), bukan dari ingatan model.
   */
  macroContext?: { title: string; lines: string[] } | null
  /** Skor sistem per horizon, dengan label keyakinan yang dihitung mesin skor. */
  systemScores?: { horizon: string; asOf: string; score: number; confidence: string }[]
  warnings: string[]
}

/** Fitur fundamental dan kepemilikan yang dibacakan ke komite, dengan cara membacanya. */
export const FUNDAMENTAL_FACTS: { key: string; label: string; unit: 'x' | 'pct' | 'pct-raw' | 'raw' }[] = [
  { key: 'per', label: 'PER', unit: 'x' },
  { key: 'pbv', label: 'PBV', unit: 'x' },
  { key: 'psr', label: 'PSR', unit: 'x' },
  { key: 'ev_ebitda', label: 'EV/EBITDA', unit: 'x' },
  { key: 'earnings_yield', label: 'Earnings yield', unit: 'pct' },
  { key: 'fcf_yield', label: 'FCF yield', unit: 'pct' },
  { key: 'dividend_yield', label: 'Dividend yield', unit: 'pct' },
  { key: 'roe', label: 'ROE', unit: 'pct' },
  { key: 'roa', label: 'ROA', unit: 'pct' },
  { key: 'margin_kotor', label: 'Margin kotor', unit: 'pct' },
  { key: 'margin_operasi', label: 'Margin operasi', unit: 'pct' },
  { key: 'margin_bersih', label: 'Margin bersih', unit: 'pct' },
  { key: 'der', label: 'DER (liabilitas/ekuitas)', unit: 'x' },
  { key: 'current_ratio', label: 'Current ratio', unit: 'x' },
  { key: 'pertumbuhan_pendapatan_yoy', label: 'Pertumbuhan pendapatan YoY', unit: 'pct' },
  { key: 'pertumbuhan_laba_yoy', label: 'Pertumbuhan laba YoY', unit: 'pct' },
  { key: 'pertumbuhan_pendapatan_3t', label: 'CAGR pendapatan 3 tahun', unit: 'pct' },
  { key: 'perubahan_saham_yoy', label: 'Perubahan saham beredar YoY', unit: 'pct' },
  { key: 'piotroski', label: 'Piotroski F-Score (0–9)', unit: 'raw' },
  { key: 'altman_z', label: "Altman Z''", unit: 'raw' },
  { key: 'asing_pct', label: 'Kepemilikan asing (KSEI)', unit: 'pct-raw' },
  { key: 'asing_chg_1b', label: 'Perubahan porsi asing 1 bulan', unit: 'pct-raw' },
  { key: 'asing_chg_3b', label: 'Perubahan porsi asing 3 bulan', unit: 'pct-raw' },
  { key: 'institusi_pct', label: 'Kepemilikan institusi (KSEI)', unit: 'pct-raw' },
  { key: 'institusi_chg_3b', label: 'Perubahan porsi institusi 3 bulan', unit: 'pct-raw' },
]

/** Dipisah dari I/O supaya bisa diuji dengan deret buatan. */
export function buildFacts(
  instrument: InstrumentView,
  series: PricePoint[],
  now: Date,
): MarketFacts {
  const warnings: string[] = []
  const closes = series.map((p) => p.close)
  const last = series[series.length - 1]

  const staleDays = Math.floor(
    (now.getTime() - new Date(`${last.date}T00:00:00Z`).getTime()) / 86_400_000,
  )

  const staleLimit = STALE_LIMIT_DAYS[instrument.market]
  if (staleDays > staleLimit) {
    warnings.push(
      `Data terakhir ${last.date}, ${staleDays} hari lalu — di atas ambang ${staleLimit} hari untuk ${instrument.market}.`,
    )
  }

  const sma20 = mean(closes.slice(-20))
  const sma50 = mean(closes.slice(-50))
  const sma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null
  const sma200Before = closes.length >= 220 ? mean(closes.slice(-220, -20)) : null

  if (sma200 === null) {
    warnings.push(`Riwayat ${closes.length} hari, belum cukup untuk SMA200.`)
  }

  const lastYear = windowSince(series, last.date, 365)
  const lastYearCloses = lastYear.map((p) => p.close)
  const first = series[0]

  return {
    symbol: instrument.symbol,
    market: instrument.market,
    name: instrument.name,
    currency: instrument.currency,
    asOf: last.date,
    staleDays,
    candleCount: series.length,
    historyStart: first.date,
    historyYears: round(daysBetween(first.date, last.date) / 365.25, 1),
    lastClose: last.close,
    returns: {
      d1: calendarReturn(series, 1),
      d7: calendarReturn(series, 7),
      d30: calendarReturn(series, 30),
      d90: calendarReturn(series, 90),
      d365: calendarReturn(series, 365),
      y2: calendarReturn(series, 730),
      y3: calendarReturn(series, 1095),
      y5: calendarReturn(series, 1826),
    },
    annualisedVolatility: annualisedVolatility(pctChanges(lastYearCloses), instrument.market),
    volatilityFullHistory: annualisedVolatility(pctChanges(closes), instrument.market),
    maxDrawdown: maxDrawdown(lastYearCloses),
    maxDrawdownFullHistory: maxDrawdown(closes),
    range52w: range(lastYear, last.close),
    historyHigh: historyHigh(series, last.close),
    sma: { s20: sma20, s50: sma50, s200: sma200 },
    sma200SlopePct:
      sma200 === null || sma200Before === null || sma200Before <= 0
        ? null
        : round((sma200 / sma200Before - 1) * 100, 2),
    priceVsSma50Pct: sma50 === null ? null : round((last.close / sma50 - 1) * 100, 2),
    trend: classifyTrend(last.close, sma20, sma50, sma200),
    volumeRatio20v100: volumeRatio(series),
    monthly: aggregate(series, 7).slice(-12),
    yearly: aggregate(series, 4),
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((a, b) => a + b, 0) / values.length, 6)
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Candle dalam `days` hari kalender terakhir, dihitung mundur dari `lastDate`. */
function windowSince(series: PricePoint[], lastDate: string, days: number): PricePoint[] {
  const cutoff = shiftDate(lastDate, -days)
  return series.filter((p) => p.date >= cutoff)
}

/**
 * Imbal hasil selama `days` hari kalender terakhir, dibandingkan dengan candle
 * terakhir pada atau sebelum tanggal itu. Mengembalikan null bila riwayatnya
 * belum sepanjang itu — bukan nol.
 */
function calendarReturn(series: PricePoint[], days: number): number | null {
  const last = series[series.length - 1]
  const target = shiftDate(last.date, -days)

  let past: PricePoint | undefined
  for (const point of series) {
    if (point.date > target) break
    past = point
  }

  if (!past || past.close <= 0) return null
  return round((last.close / past.close - 1) * 100, 2)
}

function range(
  window: PricePoint[],
  lastClose: number,
): MarketFacts['range52w'] {
  if (window.length < MIN_CANDLES) return null

  const high = Math.max(...window.map((p) => p.high ?? p.close))
  const low = Math.min(...window.map((p) => p.low ?? p.close))
  const span = high - low

  return {
    high: round(high, 6),
    low: round(low, 6),
    positionPct: span > 0 ? round(((lastClose - low) / span) * 100, 1) : 50,
  }
}

function historyHigh(series: PricePoint[], lastClose: number): MarketFacts['historyHigh'] {
  let best = series[0]
  for (const point of series) {
    if ((point.high ?? point.close) > (best.high ?? best.close)) best = point
  }

  const value = best.high ?? best.close
  if (value <= 0) return null

  return {
    value: round(value, 6),
    date: best.date,
    pctFromHigh: round((lastClose / value - 1) * 100, 2),
  }
}

/**
 * Gabungkan candle harian per awalan tanggal: 7 karakter untuk bulanan
 * (`YYYY-MM`), 4 untuk tahunan (`YYYY`). Periode pertama ditandai parsial
 * karena riwayatnya bisa dimulai di tengah periode, dan periode terakhir
 * ditandai parsial karena masih berjalan.
 */
function aggregate(series: PricePoint[], keyLength: 4 | 7): PeriodCandle[] {
  const out: PeriodCandle[] = []

  for (const point of series) {
    const period = point.date.slice(0, keyLength)
    const current = out[out.length - 1]

    if (current?.period === period) {
      current.high = Math.max(current.high, point.high ?? point.close)
      current.low = Math.min(current.low, point.low ?? point.close)
      current.close = point.close
    } else {
      out.push({
        period,
        open: point.open ?? point.close,
        high: point.high ?? point.close,
        low: point.low ?? point.close,
        close: point.close,
        changePct: null,
        partial: false,
      })
    }
  }

  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    const prev = out[i - 1]
    c.changePct = prev && prev.close > 0 ? round((c.close / prev.close - 1) * 100, 2) : null
    c.open = round(c.open, 6)
    c.high = round(c.high, 6)
    c.low = round(c.low, 6)
    c.close = round(c.close, 6)
  }

  if (out.length > 0) {
    // Periode pertama baru dianggap utuh bila candle pertamanya jatuh di awal periode.
    const firstDay = series[0].date
    const startsAtBeginning =
      keyLength === 7 ? firstDay.slice(8) <= '03' : firstDay.slice(5) <= '01-05'
    if (!startsAtBeginning) out[0].partial = true
    out[out.length - 1].partial = true
  }

  return out
}

function pctChanges(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1)
  }
  return out
}

/**
 * Volatilitas disetahunkan. Faktor akarnya berbeda per pasar: crypto punya 365
 * hari perdagangan setahun, bursa saham sekitar 252. Memakai 252 untuk crypto
 * akan melaporkan volatilitas yang terlalu rendah sekitar 20%.
 */
function annualisedVolatility(returns: number[], market: MarketCode): number | null {
  if (returns.length < MIN_CANDLES) return null

  const avg = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((acc, r) => acc + (r - avg) ** 2, 0) / (returns.length - 1)
  const periodsPerYear = market === 'CRYPTO' ? 365 : 252

  return round(Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100, 2)
}

/** Penurunan terdalam dari puncak ke lembah, dalam persen (selalu <= 0). */
function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null

  let peak = closes[0]
  let worst = 0

  for (const close of closes) {
    if (close > peak) peak = close
    if (peak > 0) {
      const drawdown = close / peak - 1
      if (drawdown < worst) worst = drawdown
    }
  }

  return round(worst * 100, 2)
}

function classifyTrend(
  last: number,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
): MarketFacts['trend'] {
  if (sma20 === null || sma50 === null) return 'tidak cukup data'

  const above200 = sma200 === null ? true : last > sma200

  if (last > sma20 && sma20 > sma50 && above200) return 'naik'
  if (last < sma20 && sma20 < sma50) return 'turun'
  return 'menyamping'
}

/** Volume 20 hari terakhir dibanding 100 hari sebelumnya — penanda minat yang berubah. */
function volumeRatio(series: PricePoint[]): number | null {
  if (series.length < 120) return null

  const recent = mean(series.slice(-20).map((p) => p.volume))
  const baseline = mean(series.slice(-120, -20).map((p) => p.volume))

  if (recent === null || baseline === null || baseline <= 0) return null
  return round(recent / baseline, 2)
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Harga dengan lima digit signifikan. Model tidak butuh `4326.9485` untuk
 * menilai tren; digit ekor hanya menambah token di setiap giliran.
 */
function price(value: number | null): string {
  if (value === null) return 'n/a'
  return String(Number(value.toPrecision(5)))
}

/** Candle bulanan yang dikirim ke model; snapshot tetap menyimpan dua belas. */
const PROMPT_MONTHS = 6

/**
 * Ubah fakta menjadi blok teks untuk model.
 *
 * Sengaja tabel datar, bukan JSON bersarang: model lebih jarang salah membaca
 * angka dari baris berlabel daripada dari struktur bertingkat, dan `null` yang
 * ditulis "tidak tersedia" lebih sulit disalahartikan sebagai nol.
 *
 * `summary` membuang tabel candle. Pengawas risiko dan ketua menilai tesis yang
 * sudah disusun di atas tabel itu; mengirim ulang tabelnya ke mereka hanya
 * menggandakan token tanpa menambah bukti.
 */
export function factsToPrompt(facts: MarketFacts, detail: 'full' | 'summary' = 'full'): string {
  const fmt = (value: number | null, suffix = '%') =>
    value === null ? 'tidak tersedia' : `${value}${suffix}`

  const staleLimit = STALE_LIMIT_DAYS[facts.market]
  const freshness =
    facts.staleDays <= staleLimit
      ? 'SEGAR — data terkini, bukan kelemahan'
      : `BASI — melewati ambang ${staleLimit} hari`

  const r = facts.returns
  const lines = [
    `Instrumen: ${facts.symbol} (${facts.name}) — pasar ${facts.market}, ${facts.currency}`,
    `Kesegaran data: candle terakhir ${facts.asOf}, ${facts.staleDays} hari lalu (${freshness})`,
    `Panjang riwayat: ${facts.candleCount} candle harian sejak ${facts.historyStart} (≈${facts.historyYears} tahun)`,
    `Harga terakhir: ${price(facts.lastClose)}`,
    `Imbal hasil 1h/7h/30h/90h: ${fmt(r.d1)} / ${fmt(r.d7)} / ${fmt(r.d30)} / ${fmt(r.d90)}`,
    `Imbal hasil 1th/2th/3th/5th: ${fmt(r.d365)} / ${fmt(r.y2)} / ${fmt(r.y3)} / ${fmt(r.y5)}`,
    `Volatilitas tahunan 1th / riwayat: ${fmt(facts.annualisedVolatility)} / ${fmt(facts.volatilityFullHistory)}`,
    `Penurunan terdalam 1th / riwayat: ${fmt(facts.maxDrawdown)} / ${fmt(facts.maxDrawdownFullHistory)}`,
    facts.range52w
      ? `Rentang 52 minggu: ${price(facts.range52w.low)}–${price(facts.range52w.high)}, harga di ${facts.range52w.positionPct}% dari bawah`
      : `Rentang 52 minggu: tidak tersedia`,
    facts.historyHigh
      ? `Puncak riwayat: ${price(facts.historyHigh.value)} (${facts.historyHigh.date}), harga ${facts.historyHigh.pctFromHigh}% dari puncak`
      : `Puncak riwayat: tidak tersedia`,
    `SMA20/50/200: ${price(facts.sma.s20)} / ${price(facts.sma.s50)} / ${price(facts.sma.s200)}; kemiringan SMA200 20 candle ${fmt(facts.sma200SlopePct)}`,
    `Harga vs SMA50: ${fmt(facts.priceVsSma50Pct)}; tren ${facts.trend}; rasio volume 20v100 ${fmt(facts.volumeRatio20v100, 'x')}`,
  ]

  const candleTable = (title: string, rows: PeriodCandle[]) => {
    if (rows.length === 0) return
    lines.push(``, `${title} (tertinggi / terendah / tutup, perubahan):`)
    for (const c of rows) {
      const note = c.partial ? ' [belum lengkap]' : ''
      lines.push(
        `${c.period}: ${price(c.high)} / ${price(c.low)} / ${price(c.close)}, ${fmt(c.changePct)}${note}`,
      )
    }
  }

  if (facts.fundamentals !== undefined) {
    const f = facts.fundamentals
    if (f === null) {
      lines.push(``, `FUNDAMENTAL: tidak berlaku — jenis aset ini tidak menerbitkan laporan keuangan.`)
    } else {
      const show = (v: number, unit: (typeof FUNDAMENTAL_FACTS)[number]['unit']) =>
        unit === 'x' ? `${round2(v)}x` : unit === 'pct' ? `${round2(v * 100)}%` : unit === 'pct-raw' ? `${round2(v)}%` : `${round2(v)}`
      const present = FUNDAMENTAL_FACTS.filter((d) => f.values[d.key] != null)
      const absent = FUNDAMENTAL_FACTS.filter((d) => f.values[d.key] == null)
      lines.push(``, `RASIO FUNDAMENTAL & KEPEMILIKAN (fitur dihitung per ${f.asOf}):`)
      for (const d of present) lines.push(`${d.label}: ${show(f.values[d.key]!, d.unit)}`)
      if (absent.length > 0) lines.push(`Tidak tersedia: ${absent.map((d) => d.label).join(', ')}`)
    }
  }

  if (facts.financialReport !== undefined) {
    const report = facts.financialReport
    if (report === null) {
      lines.push(``, 'LAPORAN KEUANGAN: belum ada filing yang sudah terbit untuk tanggal analisis ini.')
    } else {
      const rawItems: { key: string; label: string }[] = [
        { key: 'pendapatan', label: 'Pendapatan' },
        { key: 'laba_bersih', label: 'Laba bersih' },
        { key: 'arus_kas_operasi', label: 'Arus kas operasi' },
        { key: 'total_aset', label: 'Total aset' },
        { key: 'total_liabilitas', label: 'Total liabilitas' },
      ]
      lines.push(
        ``,
        `LAPORAN KEUANGAN ${report.period} (periode berakhir ${report.periodEnd}; terbit ${report.reportedAt}; sumber ${report.sourceId}; accession ${report.accession}; kelengkapan ${round2(report.completeness * 100)}%):`,
      )
      for (const item of rawItems) {
        const value = report.items[item.key]
        lines.push(`${item.label}: ${value === undefined ? 'tidak tersedia' : `${report.currency} ${new Intl.NumberFormat('id-ID').format(value)}`}`)
      }
      if (report.missingItems.length > 0) {
        lines.push(`Pos wajib yang tidak tersedia: ${report.missingItems.join(', ')}`)
      }
    }
  }

  if (facts.macroContext && facts.macroContext.lines.length > 0) {
    lines.push(``, `${facts.macroContext.title}:`, ...facts.macroContext.lines)
  }

  if (facts.systemScores && facts.systemScores.length > 0) {
    lines.push(``, `SKOR SISTEM (−10 sampai +10, belum dikalibrasi):`)
    for (const sc of facts.systemScores) {
      lines.push(`Horizon ${sc.horizon}: ${round2(sc.score)} — keyakinan ${sc.confidence} (per ${sc.asOf})`)
    }
  }

  if (detail === 'full') {
    candleTable('CANDLE TAHUNAN', facts.yearly)
    candleTable(`CANDLE BULANAN ${PROMPT_MONTHS} TERAKHIR`, facts.monthly.slice(-PROMPT_MONTHS))
  }

  lines.push(
    ``,
    facts.warnings.length > 0
      ? `PERINGATAN DATA:\n${facts.warnings.map((w) => `- ${w}`).join('\n')}`
      : `PERINGATAN DATA: tidak ada — seluruh angka layak dipakai.`,
  )

  return lines.join('\n')
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
