/**
 * Konteks per topik untuk Tanya Komite.
 *
 * Pengguna tidak harus memilih satu instrumen. Tiap tab punya potret datanya
 * sendiri — pergerakan terbesar di kelas aset itu, atau data makro untuk
 * nasihat keuangan — supaya pertanyaan umum ("saham bank mana yang lagi
 * turun?", "berapa inflasi sekarang, dana darurat taruh di mana?") tetap
 * dijawab dari angka nyata, bukan dari ingatan model.
 */

import { listInstrumentQuotes, type InstrumentQuote } from '@/lib/db/queries'
import { latestMacro } from '@/lib/db/macro-queries'
import { formatPriceIn } from '@/lib/format/market'

export const ASK_TOPICS = ['saham', 'kripto', 'indeks', 'komoditas', 'emas', 'mata_uang', 'obligasi', 'keuangan'] as const
export type AskTopic = (typeof ASK_TOPICS)[number]

export const TOPIC_INFO: Record<AskTopic, { label: string; classes: string[]; newsKeywords: string }> = {
  saham: { label: 'Saham', classes: ['saham'], newsKeywords: 'IHSG bursa emiten stocks shares' },
  kripto: { label: 'Kripto', classes: ['crypto', 'memecoin'], newsKeywords: 'bitcoin kripto crypto ethereum' },
  indeks: { label: 'Indeks', classes: ['indeks'], newsKeywords: 'IHSG indeks Wall Nasdaq index' },
  komoditas: { label: 'Komoditas', classes: ['komoditi'], newsKeywords: 'minyak batubara komoditas oil coal' },
  emas: { label: 'Emas', classes: ['emas'], newsKeywords: 'emas gold logam' },
  mata_uang: { label: 'Mata Uang', classes: ['mata_uang'], newsKeywords: 'rupiah dolar kurs valas forex currency' },
  obligasi: { label: 'Obligasi', classes: ['obligasi'], newsKeywords: 'obligasi SBN treasury yield bond suku bunga' },
  keuangan: { label: 'Nasihat Keuangan', classes: [], newsKeywords: 'inflasi suku bunga rupiah ekonomi' },
}

function line(q: InstrumentQuote): string {
  const chg = q.changePct === null ? 'n/a' : `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`
  return `- ${q.symbol} (${q.name}): ${formatPriceIn(q.lastClose, q.currency)}, harian ${chg}, per ${q.lastDate ?? '—'}`
}

/** Potret satu kelas aset: jumlah, lima naik terbesar, lima turun terbesar. */
function classSnapshot(quotes: InstrumentQuote[], classes: string[], label: string): string {
  const rows = quotes.filter((q) => classes.includes(q.assetClass) && q.lastClose !== null)
  if (rows.length === 0) return `Belum ada data harga ${label} yang tersimpan.`
  const moved = rows.filter((q) => q.changePct !== null)
  const up = [...moved].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 5)
  const down = [...moved].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 5)
  const upCount = moved.filter((q) => (q.changePct ?? 0) > 0).length
  return [
    `${label}: ${rows.length} instrumen dilacak, ${upCount} naik dan ${moved.length - upCount} turun pada penutupan terakhir.`,
    'Naik terbesar:',
    ...up.map(line),
    'Turun terbesar:',
    ...down.map(line),
  ].join('\n')
}

/** Deret makro yang dibacakan per topik di luar nasihat keuangan. */
const TOPIC_MACRO: Partial<Record<AskTopic, [string, string][]>> = {
  mata_uang: [
    ['FRED:IRSTCI01IDM156N', 'Suku bunga antarbank Indonesia (%)'],
    ['FRED:DFF', 'Fed Funds efektif (%)'],
    ['FRED:IRSTCI01EZM156N', 'Suku bunga antarbank Kawasan Euro (%)'],
    ['FRED:IRSTCI01JPM156N', 'Suku bunga antarbank Jepang (%)'],
    ['WB:IDN:FP.CPI.TOTL.ZG', 'Inflasi Indonesia tahunan (%)'],
    ['WB:USA:FP.CPI.TOTL.ZG', 'Inflasi AS tahunan (%)'],
  ],
  obligasi: [
    ['FRED:DFF', 'Fed Funds efektif (%)'],
    ['FRED:DGS3MO', 'Imbal hasil Treasury 3 bulan (%)'],
    ['FRED:DGS2', 'Imbal hasil Treasury 2 tahun (%)'],
    ['FRED:DGS10', 'Imbal hasil Treasury 10 tahun (%)'],
    ['FRED:DGS30', 'Imbal hasil Treasury 30 tahun (%)'],
    ['FRED:T10Y2Y', 'Selisih Treasury 10th − 2th (poin)'],
    ['FRED:T10YIE', 'Ekspektasi inflasi 10 tahun (%)'],
    ['FRED:BAMLH0A0HYM2', 'Selisih obligasi high-yield AS (poin)'],
    ['FRED:IRSTCI01IDM156N', 'Suku bunga antarbank Indonesia (%)'],
  ],
}

async function macroSnapshot(
  series: [string, string][] = [
    ['FRED:IRSTCI01IDM156N', 'Suku bunga antarbank Indonesia (%)'],
    ['WB:IDN:FP.CPI.TOTL.ZG', 'Inflasi Indonesia tahunan (%)'],
    ['WB:IDN:NY.GDP.MKTP.KD.ZG', 'Pertumbuhan PDB riil Indonesia (%)'],
    ['FRED:GS10', 'Imbal hasil obligasi AS 10 tahun (%)'],
  ],
): Promise<string> {
  const rows = await Promise.all(
    series.map(async ([id, label]) => {
      const v = await latestMacro(id).catch(() => null)
      return v ? `- ${label}: ${v.value.toFixed(2)} (per ${v.date})` : `- ${label}: tidak tersedia`
    }),
  )
  return ['Data makro terbaru:', ...rows].join('\n')
}

/** Konteks topik tanpa instrumen terpilih. Gagal membaca data → teks penjelas, bukan galat. */
export async function buildTopicContext(topic: AskTopic): Promise<string> {
  const info = TOPIC_INFO[topic]
  const quotes = await listInstrumentQuotes().catch(() => [] as InstrumentQuote[])

  if (topic === 'keuangan') {
    const pick = (sym: string) => quotes.find((q) => q.symbol === sym)
    const anchors = ['^JKSE', 'BTCUSDT', 'GC=F', 'BBCA.JK']
      .map(pick)
      .filter((q): q is InstrumentQuote => Boolean(q))
      .map(line)
    return [
      await macroSnapshot(),
      '',
      'Patokan pasar:',
      ...(anchors.length ? anchors : ['- data harga tidak tersedia']),
    ].join('\n')
  }

  const macro = TOPIC_MACRO[topic]
  const snapshot = classSnapshot(quotes, info.classes, info.label)
  return macro ? [snapshot, '', await macroSnapshot(macro)].join('\n') : snapshot
}
