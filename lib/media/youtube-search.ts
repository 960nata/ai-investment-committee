/**
 * Pencarian video YouTube untuk warta, lewat YouTube Data API v3.
 *
 * Dulu video dipilih dari daftar ID yang ditulis tangan, dan empat dari lima
 * ID itu ternyata tidak pernah ada — setiap artikel menampilkan pemutar rusak.
 * Sekarang video dicari sungguhan, lalu diperiksa sekali lagi sebelum dipakai:
 * masih publik, boleh disematkan, dan tidak diblokir di Indonesia.
 *
 * Kuota: `search.list` 100 unit, `videos.list` 1 unit. Jatah harian bawaan
 * 10.000 unit cukup untuk ±99 warta per hari. Tanpa YOUTUBE_API_KEY fungsi ini
 * mengembalikan null dan artikel terbit tanpa video; pemutar di halaman
 * artikel memang sudah tersembunyi bila videonya kosong.
 */

import { fetchWithTimeout } from '@/lib/http/fetch'

export interface YoutubeVideo {
  videoId: string
  title: string
  channel: string
  relevance?: string
}

const API = 'https://www.googleapis.com/youtube/v3'

/**
 * Kanal berita keuangan yang didahulukan bila muncul di hasil pencarian.
 * Bukan saringan mutlak: tanpa kanal ini pun hasil teratas tetap dipakai,
 * asalkan lolos pemeriksaan status.
 */
const TRUSTED_CHANNELS = [
  'CNBC Indonesia',
  'CNBC International',
  'CNBC Television',
  'Bloomberg Television',
  'Bloomberg Technology',
  'Bloomberg Originals',
  'Reuters',
  'Yahoo Finance',
  'Financial Times',
  'Wall Street Journal',
  'IDX Channel',
  'Kompas TV',
  'KompasTV',
  'Metro TV',
  'tvOneNews',
  'CoinDesk',
]

/** Video lebih tua dari ini biasanya membahas keadaan pasar yang sudah lewat. */
const MAX_AGE_DAYS = 120

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function getJson<T>(url: URL, label: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url.toString(), {
      label,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip' },
    })
    if (!res.ok) {
      // Isi galat Google memuat alasan (quotaExceeded, keyInvalid) yang
      // berguna di log, tapi kuncinya sendiri tidak pernah ikut tercetak.
      const detail = (await res.text()).slice(0, 300)
      console.warn(`[YouTube] ${label} HTTP ${res.status}: ${detail}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[YouTube] ${label} gagal:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

interface SearchResponse {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: { title?: string; channelTitle?: string }
  }>
}

interface VideosResponse {
  items?: Array<{
    id: string
    snippet?: { title?: string; channelTitle?: string }
    status?: { privacyStatus?: string; embeddable?: boolean; uploadStatus?: string }
    contentDetails?: { regionRestriction?: { blocked?: string[]; allowed?: string[] } }
  }>
}

function isTrusted(channel: string): boolean {
  const c = channel.toLowerCase()
  return TRUSTED_CHANNELS.some((t) => c === t.toLowerCase())
}

/**
 * Cari satu video yang relevan dan pasti bisa diputar di halaman artikel.
 *
 * @param query kata kunci dari model; paling berhasil bila menyebut peristiwa
 *              dan pelakunya, mis. "IHSG asing net sell September".
 * @param lang  bahasa hasil yang didahulukan.
 */
export async function findYoutubeVideo(
  query: string,
  lang: 'id' | 'en' = 'id',
): Promise<YoutubeVideo | null> {
  const key = apiKey()
  const q = query.trim()
  if (!key || !q) return null

  const search = new URL(`${API}/search`)
  search.search = new URLSearchParams({
    key,
    part: 'snippet',
    q,
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    order: 'relevance',
    maxResults: '8',
    relevanceLanguage: lang,
    regionCode: 'ID',
    publishedAfter: new Date(Date.now() - MAX_AGE_DAYS * 86400_000).toISOString(),
    fields: 'items(id/videoId,snippet(title,channelTitle))',
  }).toString()

  const found = await getJson<SearchResponse>(search, 'search.list')
  const ids = (found?.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) {
    console.log(`[YouTube] Tidak ada video untuk "${q}"`)
    return null
  }

  // search.list bisa mengembalikan video yang baru saja diprivat atau diblokir
  // di wilayah tertentu. videos.list hanya 1 unit dan menjawab pastinya.
  const details = new URL(`${API}/videos`)
  details.search = new URLSearchParams({
    key,
    part: 'snippet,status,contentDetails',
    id: ids.join(','),
    fields:
      'items(id,snippet(title,channelTitle),status(privacyStatus,embeddable,uploadStatus),' +
      'contentDetails/regionRestriction)',
  }).toString()

  const verified = await getJson<VideosResponse>(details, 'videos.list')
  const playable = (verified?.items ?? []).filter((v) => {
    const region = v.contentDetails?.regionRestriction
    if (region?.blocked?.includes('ID')) return false
    if (region?.allowed && !region.allowed.includes('ID')) return false
    return (
      v.status?.privacyStatus === 'public' &&
      v.status?.embeddable === true &&
      v.status?.uploadStatus === 'processed'
    )
  })

  // Urutan relevansi dari search.list dipertahankan; kanal tepercaya hanya
  // dinaikkan ke depan, bukan menggantikan relevansi sepenuhnya.
  const ranked = [
    ...ids.map((id) => playable.find((v) => v.id === id)).filter((v) => v && isTrusted(v.snippet?.channelTitle ?? '')),
    ...ids.map((id) => playable.find((v) => v.id === id)),
  ].filter((v): v is NonNullable<typeof v> => Boolean(v))

  const pick = ranked[0]
  if (!pick) {
    console.log(`[YouTube] ${ids.length} hasil untuk "${q}", tidak ada yang bisa disematkan`)
    return null
  }

  return {
    videoId: pick.id,
    title: decode(pick.snippet?.title ?? 'Video terkait'),
    channel: decode(pick.snippet?.channelTitle ?? 'YouTube'),
  }
}
