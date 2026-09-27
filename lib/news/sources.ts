/**
 * Sumber berita asli untuk warta otomatis.
 *
 * Agen warta tidak boleh menulis dari ingatan modelnya sendiri: model tidak
 * tahu apa yang terjadi hari ini, dan untuk konten keuangan angka karangan jauh
 * lebih berbahaya daripada tidak ada artikel sama sekali. Jadi setiap warta
 * otomatis berangkat dari berita yang benar-benar terbit, diambil dari RSS
 * media yang dipilih di bawah, dan tautannya ikut tercetak di artikel.
 *
 * RSS dipilih karena terbuka, stabil, dan tidak perlu kunci API. Ringkasan di
 * RSS terlalu pendek untuk jadi bahan, jadi isi halaman aslinya diambil juga —
 * hanya untuk beberapa berita yang terpilih, bukan seluruh feed.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'

export interface NewsFeed {
  /** Nama media, dicetak di daftar sumber artikel. */
  name: string
  url: string
  lang: 'id' | 'en'
}

/**
 * Feed yang terbukti bisa diambil tanpa diblokir. Bisnis.com dan Kontan tidak
 * masuk: yang satu menjawab 403 untuk bot, yang lain feed-nya kosong.
 */
export const NEWS_FEEDS: NewsFeed[] = [
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss', lang: 'id' },
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/news/rss', lang: 'id' },
  { name: 'ANTARA', url: 'https://www.antaranews.com/rss/ekonomi-bursa.xml', lang: 'id' },
  { name: 'ANTARA', url: 'https://www.antaranews.com/rss/ekonomi.xml', lang: 'id' },
  { name: 'IDX Channel', url: 'https://www.idxchannel.com/rss', lang: 'id' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', lang: 'en' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', lang: 'en' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', lang: 'en' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', lang: 'en' },
]

export interface Headline {
  title: string
  link: string
  /** Ringkasan dari RSS, sudah bersih dari HTML. */
  summary: string
  publishedAt: Date
  source: string
  lang: 'id' | 'en'
}

/** Berita yang sudah dibaca lengkap dan siap jadi bahan tulisan. */
export interface SourceDocument extends Headline {
  /** Isi artikel asli, dipotong supaya muat di prompt. */
  body: string
}

/**
 * Sebagian situs menolak User-Agent bot yang terlalu jujur. Identitas ini
 * tetap menyebut siapa kita, tapi berbentuk seperti peramban.
 */
const USER_AGENT =
  'Mozilla/5.0 (compatible; InvestdeskNewsBot/1.0; +https://github.com/NataKun7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Satu sumber cukup ~3.500 karakter; tiga sumber tetap jauh di bawah batas konteks model. */
const MAX_BODY_CHARS = 3500

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

function cleanText(raw: string | undefined): string {
  if (!raw) return ''
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  // Entitas didekode sebelum tag dibuang: beberapa feed (IDX Channel) menulis
  // tag <img> sebagai &lt;img&gt; di dalam deskripsinya.
  return decodeEntities(unwrapped)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(item: string, name: string): string | undefined {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return match?.[1]
}

/**
 * Pengurai RSS 2.0 minimal. Cukup untuk feed-feed di atas yang semuanya
 * memakai <item> dengan <title>, <link>, <pubDate>, dan <description>, dan
 * tidak sebanding dengan menambah dependensi pengurai XML penuh.
 */
export function parseRss(xml: string, feed: NewsFeed): Headline[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []

  return items.flatMap((item) => {
    const title = cleanText(tag(item, 'title'))
    const link = cleanText(tag(item, 'link'))
    const published = new Date(cleanText(tag(item, 'pubDate')))
    if (!title || !link.startsWith('http') || Number.isNaN(published.getTime())) return []

    return [
      {
        title,
        link,
        summary: cleanText(tag(item, 'description')).slice(0, 400),
        publishedAt: published,
        source: feed.name,
        lang: feed.lang,
      },
    ]
  })
}

async function fetchFeed(feed: NewsFeed): Promise<Headline[]> {
  try {
    const res = await fetchWithTimeout(feed.url, {
      label: `RSS ${feed.name}`,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
    })
    if (!res.ok) {
      console.warn(`[NewsSources] ${feed.url} menjawab HTTP ${res.status}`)
      return []
    }
    return parseRss(await res.text(), feed)
  } catch (err) {
    console.warn(`[NewsSources] ${feed.url} gagal:`, err instanceof Error ? err.message : String(err))
    return []
  }
}

/**
 * Kumpulkan judul berita terbaru dari semua feed.
 *
 * Feed diambil berbarengan; satu media yang mati tidak menahan yang lain.
 * Hasilnya diurutkan dari yang paling baru dan dibatasi umurnya — berita dua
 * hari lalu sudah bukan bahan warta.
 */
export async function collectRecentHeadlines(maxAgeHours = 18): Promise<Headline[]> {
  const batches = await Promise.all(NEWS_FEEDS.map(fetchFeed))
  const cutoff = Date.now() - maxAgeHours * 3600_000
  const seen = new Set<string>()

  return batches
    .flat()
    .filter((h) => h.publishedAt.getTime() >= cutoff && h.publishedAt.getTime() <= Date.now() + 3600_000)
    .filter((h) => {
      const key = normaliseLink(h.link)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
}

/** Buang parameter pelacak supaya berita yang sama tidak terhitung dua kali. */
export function normaliseLink(link: string): string {
  try {
    const url = new URL(link)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return link
  }
}

/**
 * Ambil isi artikel dari halamannya.
 *
 * Tidak ada pengurai HTML di sini, hanya paragraf <p> yang cukup panjang untuk
 * jadi kalimat berita. Menu, iklan, dan label tombol tersaring dengan
 * sendirinya karena pendek. Kalau halamannya menolak, ringkasan RSS dipakai —
 * lebih sedikit bahan, tapi tetap fakta yang terbit.
 */
export async function fetchSourceDocument(headline: Headline): Promise<SourceDocument> {
  let body = ''

  try {
    const res = await fetchWithTimeout(headline.link, {
      label: `artikel ${headline.source}`,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    })
    if (res.ok) {
      const html = (await res.text()).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
      const paragraphs = (html.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? [])
        .map((p) => cleanText(p))
        .filter((p) => p.length >= 60 && p.length <= 2000)

      body = [...new Set(paragraphs)].join('\n\n').slice(0, MAX_BODY_CHARS)
    }
  } catch (err) {
    console.warn(
      `[NewsSources] Isi ${headline.link} tidak terambil:`,
      err instanceof Error ? err.message : String(err),
    )
  }

  return { ...headline, body: body.length >= 200 ? body : headline.summary }
}
