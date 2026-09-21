/**
 * Pencarian foto asli di internet untuk sampul warta.
 *
 * Redaksi tidak pernah meminta model AI menggambar foto. Yang dilakukan AI
 * hanyalah merumuskan kata kunci pencarian; fotonya sendiri harus foto nyata
 * milik orang nyata, lengkap dengan pemilik dan lisensinya, lalu diunduh dan
 * disimpan sendiri agar tautannya tidak mati saat sumber aslinya menghapusnya.
 *
 * Sumber disusun berdasarkan mutu editorialnya, bukan abjad. Penyedia berkunci
 * (Pexels, Unsplash) didahulukan bila kuncinya ada di env; kalau tidak ada,
 * Openverse dan Wikimedia Commons tetap bekerja tanpa kunci sama sekali —
 * portal tidak boleh kehilangan foto hanya karena satu langganan belum dibeli.
 *
 * Semua kandidat dikumpulkan, bukan dipilih satu. Unduhan bisa gagal karena
 * sumbernya memblokir bot atau berkasnya korup, dan pemanggil perlu kandidat
 * cadangan untuk dicoba berikutnya.
 */

/** Satu foto hasil pencarian, sudah lengkap dengan atribusinya. */
export interface PhotoCandidate {
  /** URL berkas gambar langsung, bukan halaman pembungkusnya. */
  url: string
  /** Judul asli dari sumber, dipakai sebagai keterangan foto bila ada. */
  title?: string
  /** Nama pemotret atau pemilik hak. Wajib ditampilkan di artikel. */
  credit: string
  /** Kode lisensi, mis. "by-sa" atau "Pexels License". */
  license?: string
  /** Halaman sumber asli, untuk ditautkan pada kredit foto. */
  sourcePage?: string
  width?: number
  height?: number
  /** Penyedia asal, untuk jejak audit di log. */
  provider: string
}

/** Foto sampul di bawah lebar ini terlihat pecah di kartu hero portal. */
const MIN_WIDTH = 800

/**
 * Foto raksasa (mis. 17.000 px dari Wikimedia) menghabiskan memori saat
 * di-dekode padahal hasil akhirnya tetap dipotong ke 1600 px. Lewati saja.
 */
const MAX_WIDTH = 8000

/** Berapa kandidat maksimum yang dikembalikan ke pemanggil. */
const MAX_CANDIDATES = 8

const FETCH_TIMEOUT_MS = 12_000

const USER_AGENT =
  'AI-Investment-Committee/1.0 (Portal Warta Intelijen Pasar; +https://github.com/NataKun7)'

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    })
    if (!res.ok) {
      console.warn(`[ImageSearch] ${new URL(url).host} menjawab HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(
      `[ImageSearch] Gagal menghubungi ${new URL(url).host}:`,
      err instanceof Error ? err.message : String(err),
    )
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function isUsable(candidate: PhotoCandidate): boolean {
  if (!candidate.url.startsWith('https://')) return false
  if (candidate.width && candidate.width < MIN_WIDTH) return false
  if (candidate.width && candidate.width > MAX_WIDTH) return false
  // SVG dan GIF animasi bukan foto jurnalistik dan merepotkan saat dikonversi.
  if (/\.(svg|gif)($|\?)/i.test(candidate.url)) return false
  return true
}

/**
 * Pexels — foto stok editorial bermutu tinggi, perlu PEXELS_API_KEY gratis.
 */
async function searchPexels(query: string): Promise<PhotoCandidate[]> {
  const key = process.env.PEXELS_API_KEY?.trim()
  if (!key) return []

  interface PexelsResponse {
    photos?: Array<{
      id: number
      alt?: string
      photographer?: string
      url?: string
      width?: number
      height?: number
      src?: { large2x?: string; large?: string; original?: string }
    }>
  }

  const url =
    'https://api.pexels.com/v1/search' +
    `?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape&size=large`

  const data = await getJson<PexelsResponse>(url, { Authorization: key })

  return (data?.photos ?? []).flatMap((p) => {
    const src = p.src?.large2x || p.src?.large || p.src?.original
    if (!src) return []
    return [
      {
        url: src,
        title: p.alt || undefined,
        credit: `Pexels / ${p.photographer ?? 'Kontributor'}`,
        license: 'Pexels License',
        sourcePage: p.url,
        // src.large2x selalu 1880 px; ukuran asli tidak relevan lagi di sini.
        width: 1880,
        provider: 'pexels',
      },
    ]
  })
}

/**
 * Unsplash — perlu UNSPLASH_ACCESS_KEY. Lisensinya membebaskan pemakaian
 * komersial tanpa izin tertulis, tapi tetap mewajibkan kredit pemotret.
 */
async function searchUnsplash(query: string): Promise<PhotoCandidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return []

  interface UnsplashResponse {
    results?: Array<{
      description?: string
      alt_description?: string
      width?: number
      height?: number
      links?: { html?: string }
      user?: { name?: string }
      urls?: { regular?: string; full?: string; raw?: string }
    }>
  }

  const url =
    'https://api.unsplash.com/search/photos' +
    `?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape&content_filter=high`

  const data = await getJson<UnsplashResponse>(url, {
    Authorization: `Client-ID ${key}`,
  })

  return (data?.results ?? []).flatMap((p) => {
    const src = p.urls?.regular || p.urls?.full
    if (!src) return []
    return [
      {
        url: src,
        title: p.description || p.alt_description || undefined,
        credit: `Unsplash / ${p.user?.name ?? 'Kontributor'}`,
        license: 'Unsplash License',
        sourcePage: p.links?.html,
        width: 1080,
        provider: 'unsplash',
      },
    ]
  })
}

/**
 * Openverse — katalog Creative Commons milik WordPress Foundation, terbuka
 * tanpa kunci. Saringan `license_type=commercial` memastikan foto yang terambil
 * boleh dipakai portal komersial, dan `aspect_ratio=wide` menjaga komposisi
 * sampul tetap lanskap.
 */
async function searchOpenverse(query: string): Promise<PhotoCandidate[]> {
  interface OpenverseResponse {
    results?: Array<{
      title?: string
      url?: string
      creator?: string
      license?: string
      license_version?: string
      foreign_landing_url?: string
      width?: number
      height?: number
      provider?: string
    }>
  }

  const url =
    'https://api.openverse.org/v1/images/' +
    `?q=${encodeURIComponent(query)}` +
    '&page_size=8&mature=false&license_type=commercial' +
    '&extension=jpg,png&size=large&aspect_ratio=wide'

  const data = await getJson<OpenverseResponse>(url)

  return (data?.results ?? []).flatMap((r) => {
    if (!r.url) return []
    const license = r.license
      ? `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`
      : undefined
    return [
      {
        url: r.url,
        title: r.title,
        credit: `${r.provider ?? 'Openverse'} / ${r.creator ?? 'Kontributor'}`,
        license,
        sourcePage: r.foreign_landing_url,
        width: r.width,
        height: r.height,
        provider: 'openverse',
      },
    ]
  })
}

/**
 * Wikimedia Commons — jaring pengaman terakhir. Cakupannya paling luas untuk
 * objek konkret (gedung bursa, kilang, tambang, gedung bank sentral) yang
 * justru sulit dicari di bank foto stok.
 */
async function searchWikimedia(query: string): Promise<PhotoCandidate[]> {
  interface WikimediaResponse {
    query?: {
      pages?: Record<
        string,
        {
          title?: string
          imageinfo?: Array<{
            url?: string
            thumburl?: string
            thumbwidth?: number
            thumbheight?: number
            mime?: string
            descriptionurl?: string
            extmetadata?: {
              Artist?: { value?: string }
              LicenseShortName?: { value?: string }
              ImageDescription?: { value?: string }
            }
          }>
        }
      >
    }
  }

  const url =
    'https://commons.wikimedia.org/w/api.php' +
    '?action=query&format=json&generator=search&gsrnamespace=6' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}` +
    '&gsrlimit=6&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1600'

  const data = await getJson<WikimediaResponse>(url)
  const pages = Object.values(data?.query?.pages ?? {})

  return pages.flatMap((page) => {
    const info = page.imageinfo?.[0]
    // thumburl sudah diperkecil server Wikimedia ke 1600 px — jauh lebih hemat
    // daripada mengunduh berkas aslinya yang bisa puluhan megabita.
    const src = info?.thumburl || info?.url
    if (!src) return []
    if (info?.mime && !/^image\/(jpeg|png|webp|tiff)$/.test(info.mime)) return []

    return [
      {
        url: src,
        title: stripHtml(info?.extmetadata?.ImageDescription?.value) || page.title?.replace(/^File:/, ''),
        credit: `Wikimedia Commons / ${stripHtml(info?.extmetadata?.Artist?.value) || 'Kontributor'}`,
        license: stripHtml(info?.extmetadata?.LicenseShortName?.value),
        sourcePage: info?.descriptionurl,
        width: info?.thumbwidth,
        height: info?.thumbheight,
        provider: 'wikimedia',
      },
    ]
  })
}

/** Metadata Wikimedia datang sebagai potongan HTML, bukan teks polos. */
function stripHtml(value?: string): string | undefined {
  if (!value) return undefined
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0 ? text.slice(0, 180) : undefined
}

/**
 * Cari foto asli di internet untuk satu kata kunci.
 *
 * Penyedia dijalankan berbarengan, bukan berurutan: pencarian yang gagal atau
 * lambat di satu sumber tidak boleh menahan yang lain, dan hasil gabungannya
 * memberi kandidat cadangan saat unduhan pertama ditolak.
 */
export async function searchInternetPhotos(query: string): Promise<PhotoCandidate[]> {
  const clean = query.trim()
  if (clean.length === 0) return []

  console.log(`[ImageSearch] Mencari foto internet untuk: "${clean}"`)

  const batches = await Promise.all([
    searchPexels(clean),
    searchUnsplash(clean),
    searchOpenverse(clean),
    searchWikimedia(clean),
  ])

  const seen = new Set<string>()
  const candidates: PhotoCandidate[] = []

  for (const batch of batches) {
    for (const candidate of batch) {
      if (!isUsable(candidate)) continue
      if (seen.has(candidate.url)) continue
      seen.add(candidate.url)
      candidates.push(candidate)
      if (candidates.length >= MAX_CANDIDATES) break
    }
  }

  console.log(
    `[ImageSearch] ${candidates.length} kandidat foto ditemukan ` +
      `(${[...new Set(candidates.map((c) => c.provider))].join(', ') || 'tidak ada sumber'})`,
  )

  return candidates
}

/**
 * Rakit kata kunci pencarian dari topik artikel bila model AI tidak memberikan
 * kata kuncinya sendiri.
 *
 * Kata kunci berbahasa Inggris memberi hasil jauh lebih banyak di keempat
 * sumber, jadi istilah pasar yang umum diterjemahkan lebih dulu.
 */
const TOPIC_KEYWORDS: Array<[RegExp, string]> = [
  [/semikonduktor|chip|gpu|nvda|tsm/i, 'semiconductor microchip wafer factory'],
  [/tembaga|copper|ammn|kabel/i, 'copper mine industrial metal'],
  [/panas bumi|geotermal|terbarukan|bren|pgeo/i, 'geothermal power plant renewable energy'],
  [/nuklir|smr|reaktor/i, 'nuclear power plant reactor'],
  [/minyak|crude|gas bumi|kilang|pgas|medc/i, 'oil refinery gas pipeline industry'],
  [/data center|pusat data|listrik ai|gigawatt/i, 'data center server room infrastructure'],
  [/emas|bullion|antm/i, 'gold bullion bars vault'],
  [/kripto|bitcoin|btc|ethereum/i, 'bitcoin cryptocurrency digital finance'],
  [/bank|perbankan|kredit|bbca|bbri|bmri/i, 'banking financial district skyscraper'],
  [/ihsg|idx|bursa|saham indonesia/i, 'jakarta stock exchange trading floor'],
  [/fed|suku bunga|inflasi|moneter/i, 'federal reserve central bank building'],
  [/nikel|nckl|tambang/i, 'nickel mining site heavy equipment'],
]

export function buildPhotoQuery(topic: string, category: string, symbols: string[] = []): string {
  const haystack = `${topic} ${symbols.join(' ')} ${category}`

  for (const [pattern, keywords] of TOPIC_KEYWORDS) {
    if (pattern.test(haystack)) return keywords
  }

  const byCategory: Record<string, string> = {
    'teknologi-ai': 'artificial intelligence data center technology',
    'energi-komoditas': 'energy power plant commodity industry',
    'ekonomi-makro': 'stock market financial district economy',
    'saham-idx': 'jakarta indonesia business district',
    'crypto-fintech': 'digital finance technology trading',
  }

  return byCategory[category] ?? 'stock market financial analysis'
}
