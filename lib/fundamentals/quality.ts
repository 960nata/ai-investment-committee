/**
 * Kualitas data fundamental lintas periode dan lintas sumber.
 *
 * `sanityCheck` di edgar.ts memeriksa satu baris sendirian. Dua kesalahan yang
 * paling mahal justru tidak terlihat dari satu baris: salah membaca satuan
 * (pendapatan tiba-tiba seribu kali lipat) dan aksi korporasi yang tidak
 * tercatat (saham beredar melonjak). Keduanya baru terlihat saat periode
 * dibandingkan dengan periode sebelumnya.
 */

// ---------------------------------------------------------------------------
// Lintas periode
// ---------------------------------------------------------------------------

export interface PeriodForCheck {
  period: string
  periodType: 'kuartal' | 'tahunan'
  periodEnd: string
  items: Record<string, number>
}

/**
 * Pertumbuhan tahunan pendapatan di atas lima kali (500%) hampir tidak pernah
 * nyata untuk emiten yang sudah mapan, tetapi salah membaca `unit_scale`
 * menghasilkannya setiap kali.
 */
const MAX_REVENUE_GROWTH = 5
/**
 * Perubahan saham beredar di atas 50% dalam setahun harus bisa dijelaskan aksi
 * korporasi (pemecahan saham, rights issue). Tanpa penjelasan, itu kemungkinan
 * besar kesalahan satuan — ribuan lembar terbaca sebagai lembar.
 */
const MAX_SHARE_CHANGE = 0.5

export interface PeriodIssue {
  period: string
  reason: string
}

/**
 * Bandingkan tiap periode dengan periode yang sama setahun sebelumnya.
 * Kuartal dibandingkan dengan kuartal, tahunan dengan tahunan — Q2 dengan FY
 * bukan perbandingan apa pun.
 */
export function crossPeriodIssues(periods: PeriodForCheck[]): PeriodIssue[] {
  const issues: PeriodIssue[] = []
  const byEnd = new Map(periods.map((p) => [`${p.periodType}|${p.periodEnd}`, p]))

  for (const p of periods) {
    const d = new Date(`${p.periodEnd}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() - 1)
    // Akhir periode setahun lalu bisa bergeser beberapa hari (akhir pekan,
    // tahun kabisat), jadi dicari dalam jendela sepekan.
    let prev: PeriodForCheck | undefined
    for (let shift = -7; shift <= 7 && !prev; shift++) {
      const c = new Date(d.getTime() + shift * 86_400_000).toISOString().slice(0, 10)
      prev = byEnd.get(`${p.periodType}|${c}`)
    }
    if (!prev) continue

    const r0 = prev.items.pendapatan
    const r1 = p.items.pendapatan
    if (r0 !== undefined && r1 !== undefined && r0 > 0 && r1 > 0) {
      const g = r1 / r0 - 1
      if (g > MAX_REVENUE_GROWTH || r1 / r0 < 1 / (1 + MAX_REVENUE_GROWTH)) {
        issues.push({ period: p.period, reason: `pendapatan berubah ${(g * 100).toFixed(0)}% dalam setahun — periksa satuan` })
      }
    }

    const s0 = prev.items.saham_beredar
    const s1 = p.items.saham_beredar
    if (s0 !== undefined && s1 !== undefined && s0 > 0 && s1 > 0) {
      const change = Math.abs(s1 / s0 - 1)
      if (change > MAX_SHARE_CHANGE) {
        issues.push({ period: p.period, reason: `saham beredar berubah ${(change * 100).toFixed(0)}% dalam setahun — cocokkan dengan aksi korporasi` })
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Lintas sumber
// ---------------------------------------------------------------------------

/**
 * Urutan kewenangan sumber, 1 tertinggi.
 *
 *   1  XBRL resmi — primer, langsung dari pelapor ke regulator
 *   2  vendor spesialis pasar itu — menangani kekhasan lokal
 *   3  vendor global — normalisasinya bisa menyembunyikan kekhasan
 *   4  agregator gratis — sering menyalin dari yang lain
 */
export const SOURCE_RANK: Record<string, number> = {
  'sec-edgar': 1,
  'idx-xbrl': 1,
  'sectors-app': 2,
  eodhd: 3,
  fmp: 3,
  finnhub: 4,
}

const rank = (source: string) => SOURCE_RANK[source] ?? 9

export interface SourcedValue {
  source: string
  value: number
}

export interface ReconciliationResult {
  relDiff: number
  severity: 'selisih' | 'tinjau_manual'
  chosenSource: string
  chosenValue: number
}

/** Di bawah 5% dianggap perbedaan metodologi yang wajar, bukan temuan. */
export const RECONCILE_FLAG_AT = 0.05
/** Di atas 20% hampir selalu kesalahan satuan, mata uang, atau pemetaan pos. */
export const RECONCILE_REVIEW_AT = 0.2

/**
 * Bandingkan satu pos dari dua sumber. Mengembalikan null bila selisihnya di
 * bawah ambang. Sumber peringkat lebih rendah TIDAK PERNAH menimpa yang lebih
 * tinggi; yang dipakai selalu yang peringkatnya lebih tinggi, apa pun besarnya
 * selisih. Fungsi pembanding hanya menandai.
 */
export function reconcileValues(a: SourcedValue, b: SourcedValue): ReconciliationResult | null {
  const [hi, lo] = rank(a.source) <= rank(b.source) ? [a, b] : [b, a]
  const base = Math.abs(hi.value)
  const relDiff = base === 0 ? (lo.value === 0 ? 0 : Infinity) : Math.abs(hi.value - lo.value) / base
  if (relDiff <= RECONCILE_FLAG_AT) return null
  return {
    relDiff,
    severity: relDiff > RECONCILE_REVIEW_AT ? 'tinjau_manual' : 'selisih',
    chosenSource: hi.source,
    chosenValue: hi.value,
  }
}

/** Bandingkan seluruh pos yang ada di kedua sumber untuk satu periode. */
export function reconcileItems(
  a: { source: string; items: Record<string, number> },
  b: { source: string; items: Record<string, number> },
): { item: string; result: ReconciliationResult; valueA: number; valueB: number }[] {
  const out: { item: string; result: ReconciliationResult; valueA: number; valueB: number }[] = []
  for (const item of Object.keys(a.items)) {
    if (b.items[item] === undefined) continue
    const result = reconcileValues(
      { source: a.source, value: a.items[item] },
      { source: b.source, value: b.items[item] },
    )
    if (result) out.push({ item, result, valueA: a.items[item], valueB: b.items[item] })
  }
  return out
}
