/**
 * Berita sumber untuk Tanya Komite.
 *
 * Model tidak tahu apa yang terjadi hari ini. Supaya jawabannya soal peristiwa
 * (perang, harga minyak, keputusan bank sentral) tidak dikarang, tiap
 * pertanyaan dibekali beberapa berita nyata: warta internal yang menyebut
 * instrumennya, dan judul terbaru dari RSS media yang sama yang dipakai warta
 * otomatis. Model hanya boleh mengutip berita dari daftar ini, dan daftar yang
 * dikutip dikirim balik ke pengguna lengkap dengan tautannya.
 *
 * Pencocokan memakai kata kunci sederhana, bukan pencarian semantik. Cukup
 * untuk puluhan berita per hari, dan jauh lebih murah daripada memanggil model
 * sekali lagi hanya untuk memilih bahan.
 */

import { cache } from '@/lib/cache/redis'
import { collectRecentHeadlines, type Headline } from '@/lib/news/sources'
import { getMarketNewsList } from '@/lib/db/news-queries'

export interface NewsSource {
  /** Nomor kutipan di jawaban: [1], [2], ... */
  n: number
  title: string
  source: string
  url: string
  publishedAt: string
  summary: string
  internal: boolean
}

const HEADLINE_TTL_SECONDS = 15 * 60
const HEADLINE_MAX_AGE_HOURS = 72
/** RSS tidak boleh menahan jawaban. Lewat dari ini, jawab dengan yang sudah ada. */
const RSS_TIMEOUT_MS = 6000
const MAX_SOURCES = 6

// ---------------------------------------------------------------------------
// Judul RSS, di-cache
// ---------------------------------------------------------------------------

interface CachedHeadline extends Omit<Headline, 'publishedAt'> {
  publishedAt: string
}

let memo: { at: number; items: CachedHeadline[] } | null = null

async function recentHeadlines(): Promise<CachedHeadline[]> {
  if (memo && Date.now() - memo.at < HEADLINE_TTL_SECONDS * 1000) return memo.items

  const cached = await cache.get<CachedHeadline[]>('tanya-komite:headlines')
  if (cached && Array.isArray(cached)) {
    memo = { at: Date.now(), items: cached }
    return cached
  }

  const fetched = await Promise.race([
    collectRecentHeadlines(HEADLINE_MAX_AGE_HOURS),
    new Promise<Headline[]>((resolve) => setTimeout(() => resolve([]), RSS_TIMEOUT_MS)),
  ]).catch(() => [] as Headline[])

  const items = fetched.map((h) => ({ ...h, publishedAt: h.publishedAt.toISOString() }))
  // Hasil kosong (semua feed mati atau lewat batas waktu) tidak di-cache lama,
  // supaya pertanyaan berikutnya mencoba lagi.
  memo = { at: items.length ? Date.now() : Date.now() - (HEADLINE_TTL_SECONDS - 60) * 1000, items }
  if (items.length) await cache.set('tanya-komite:headlines', items, HEADLINE_TTL_SECONDS)
  return items
}

// ---------------------------------------------------------------------------
// Kata kunci
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    'yang dan atau dari untuk dengan pada dalam akan ini itu apa apakah bagaimana kenapa mengapa ' +
    'berapa kapan dimana siapa saya kamu anda kita kami ada tidak bisa sudah belum masih juga lagi ' +
    'harga saham aset pasar jadi kalau jika karena sebagai oleh tentang lebih kurang sangat banyak ' +
    'the and for with what how why when will does this that from into about price market stock'
  ).split(' '),
)

/**
 * Padanan istilah Indonesia–Inggris untuk topik yang paling sering ditanya.
 * Separuh sumber RSS berbahasa Inggris; tanpa ini pertanyaan "harga minyak"
 * tidak pernah bertemu judul "oil prices".
 */
const SYNONYMS: Record<string, string[]> = {
  minyak: ['oil', 'crude', 'brent', 'opec'],
  emas: ['gold', 'bullion'],
  perak: ['silver'],
  perang: ['war', 'conflict', 'attack', 'military', 'konflik'],
  konflik: ['war', 'conflict', 'perang'],
  bunga: ['rate', 'rates', 'fed', 'suku'],
  inflasi: ['inflation', 'cpi'],
  batubara: ['coal'],
  bara: ['coal'],
  gas: ['lng', 'natural'],
  kripto: ['crypto', 'bitcoin'],
  bitcoin: ['btc', 'crypto'],
  rupiah: ['idr', 'rupiah'],
  dolar: ['dollar', 'usd'],
  resesi: ['recession'],
  tarif: ['tariff', 'tariffs'],
  sawit: ['cpo', 'palm'],
  nikel: ['nickel'],
  timah: ['tin'],
  tembaga: ['copper'],
  ihsg: ['jci', 'idx', 'bursa'],
  saham: ['stocks', 'shares', 'equities'],
  bank: ['banking', 'perbankan'],
  timur: ['middle', 'east'],
  china: ['china', 'tiongkok', 'beijing'],
  amerika: ['us', 'wall', 'fed'],
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

/** Simbol tanpa akhiran bursa/pasangan: BBCA.JK → bbca, BTCUSDT → btc, GC=F → gc. */
function baseSymbol(symbol: string): string {
  return symbol
    .toLowerCase()
    .replace(/\.jk$/, '')
    .replace(/(usdt|usd|busd)$/, '')
    .replace(/=f$/, '')
    .replace(/^\^/, '')
}

/**
 * Kata di nama perusahaan yang terlalu umum untuk jadi penanda. "Bank Central
 * Asia" tidak boleh membuat setiap berita tentang bank mana pun ikut terpilih.
 */
const GENERIC_NAME_WORDS = new Set(
  'bank central asia indonesia persero tbk corp corporation company group holding holdings international global index futures usd'.split(' '),
)

function buildKeywords(question: string, symbol: string, name: string) {
  const strong = new Set<string>()
  const base = baseSymbol(symbol)
  if (base.length >= 2) strong.add(base)

  // Kata nama yang khas (mis. "brent", "bitcoin", "telkom") cukup untuk
  // memilih berita sendirian; kata nama yang umum tidak dihitung sama sekali.
  const medium = new Set<string>()
  for (const w of tokenize(name)) if (w.length >= 4 && !GENERIC_NAME_WORDS.has(w)) medium.add(w)

  const weak = new Set<string>()
  for (const w of tokenize(question)) {
    weak.add(w)
    for (const s of SYNONYMS[w] ?? []) weak.add(s)
  }
  for (const w of [...strong, ...medium]) for (const s of SYNONYMS[w] ?? []) weak.add(s)
  for (const w of medium) weak.delete(w)
  return { strong, medium, weak }
}

function score(text: string, keys: ReturnType<typeof buildKeywords>): number {
  const words = new Set(tokenize(text))
  let s = 0
  for (const k of keys.strong) if (words.has(k)) s += 3
  for (const k of keys.medium) if (words.has(k)) s += 2
  for (const k of keys.weak) if (words.has(k)) s += 1
  return s
}

// ---------------------------------------------------------------------------
// Pilih sumber
// ---------------------------------------------------------------------------

export async function findNewsSources(input: {
  question: string
  symbol: string
  name: string
}): Promise<NewsSource[]> {
  const keys = buildKeywords(input.question, input.symbol, input.name)
  const symbolUpper = input.symbol.toUpperCase()

  const [headlines, warta] = await Promise.all([
    recentHeadlines().catch(() => [] as CachedHeadline[]),
    getMarketNewsList({ limit: 60 }).catch(() => []),
  ])

  type Candidate = Omit<NewsSource, 'n'> & { score: number }
  const candidates: Candidate[] = []

  for (const w of warta) {
    const mentions = w.mentionedSymbols.some((s) => s.toUpperCase() === symbolUpper)
    const s = score(`${w.title} ${w.summary} ${w.tags.join(' ')}`, keys) + (mentions ? 4 : 0)
    if (s >= 2) {
      candidates.push({
        title: w.title,
        source: 'Warta AI Investdesk',
        url: `/warta/${w.slug}`,
        publishedAt: w.publishedAt.toISOString(),
        summary: w.summary.slice(0, 300),
        internal: true,
        score: s,
      })
    }
  }

  for (const h of headlines) {
    const s = score(`${h.title} ${h.summary}`, keys)
    if (s >= 2) {
      candidates.push({
        title: h.title,
        source: h.source,
        url: h.link,
        publishedAt: h.publishedAt,
        summary: h.summary.slice(0, 300),
        internal: false,
        score: s,
      })
    }
  }

  // Paling cocok dulu; seri dipecah oleh yang paling baru.
  candidates.sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))

  const seen = new Set<string>()
  const picked: NewsSource[] = []
  for (const c of candidates) {
    const key = c.title.toLowerCase().slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push({
      n: picked.length + 1,
      title: c.title,
      source: c.source,
      url: c.url,
      publishedAt: c.publishedAt,
      summary: c.summary,
      internal: c.internal,
    })
    if (picked.length >= MAX_SOURCES) break
  }
  return picked
}

export function sourcesToPrompt(sources: NewsSource[]): string {
  if (sources.length === 0) return 'Tidak ada berita relevan yang ditemukan dalam 3 hari terakhir.'
  return sources
    .map(
      (s) =>
        `[${s.n}] ${s.title} — ${s.source}, ${s.publishedAt.slice(0, 10)}\n    ${s.summary || '(tanpa ringkasan)'}`,
    )
    .join('\n')
}

/** Nomor sumber yang benar-benar dikutip jawaban, misalnya "[2]" atau "[1, 3]". */
export function citedSources(answer: string, sources: NewsSource[]): NewsSource[] {
  const cited = new Set<number>()
  for (const m of answer.matchAll(/\[(\d+(?:\s*[,\s]\s*\d+)*)\]/g)) {
    for (const n of m[1].split(/[,\s]+/)) cited.add(Number(n))
  }
  return sources.filter((s) => cited.has(s.n))
}

/**
 * Buang format markdown dari jawaban. Chat menampilkan teks polos, jadi `**`,
 * `#`, dan backtick akan terlihat apa adanya. Dilakukan di server supaya tetap
 * bersih meski model mengabaikan larangan di prompt.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
