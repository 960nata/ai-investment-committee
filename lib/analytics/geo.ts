/**
 * Menentukan asal sebuah permintaan.
 *
 * Satu keputusan mendasari seluruh berkas ini: alamat IP mentah tidak pernah
 * disimpan. IP adalah data pribadi — di Indonesia ia masuk lingkup UU PDP, di
 * Eropa GDPR sudah menyebutnya begitu sejak lama — dan basis data berisi
 * riwayat IP pengunjung adalah kewajiban hukum yang terus menumpuk tanpa satu
 * pun pertanyaan analitik yang benar-benar membutuhkannya.
 *
 * Yang disimpan sebagai gantinya adalah sidik ber-garam: cukup untuk menjawab
 * "berapa pengunjung berbeda", tidak cukup untuk menunjuk siapa. Garamnya
 * dirahasiakan, jadi sidiknya tidak bisa dibalik dengan menebak satu per satu
 * empat miliar alamat IPv4 — yang tanpa garam justru pekerjaan beberapa menit.
 *
 * Lokasinya sendiri datang dari tepi jaringan, bukan dari basis data GeoIP yang
 * harus ikut dikemas: Vercel sudah menempelkan negara, kota, dan koordinat di
 * header tiap permintaan. Gratis, dan lebih akurat daripada tabel statis yang
 * basi tiga bulan setelah dipasang.
 */

import crypto from 'crypto'

export interface VisitorGeo {
  country: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  /** Dari mana lokasinya diketahui. Berguna saat menelusuri data yang aneh. */
  source: 'edge' | 'lookup' | 'unknown'
}

const EMPTY_GEO: VisitorGeo = {
  country: null,
  region: null,
  city: null,
  latitude: null,
  longitude: null,
  source: 'unknown',
}

/**
 * Alamat pemanggil.
 *
 * `x-forwarded-for` bisa berisi rantai beberapa alamat ketika permintaan lewat
 * lebih dari satu proksi. Yang paling kiri adalah klien asli; sisanya adalah
 * proksi yang dilewatinya.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  return request.headers.get('x-real-ip')?.trim() || null
}

/**
 * Benar untuk alamat yang tidak pernah bisa dipetakan ke tempat di dunia nyata:
 * localhost, jaringan privat, link-local.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return true
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true
  if (ip.startsWith('169.254.') || ip.startsWith('fe80:')) return true
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true

  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d+)\./.exec(ip)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }

  return false
}

/**
 * Garam untuk sidik pengunjung.
 *
 * Kalau belum diset, sidiknya tetap dibuat tetapi memakai garam cadangan yang
 * tertulis di dalam kode — artinya bisa dibalik siapa pun yang membaca
 * repositori. Di produksi itu dicatat keras sekali, bukan didiamkan.
 */
function visitorSalt(): string {
  const salt = process.env.VISITOR_HASH_SALT || process.env.SESSION_SECRET

  if (!salt || salt.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[analytics] VISITOR_HASH_SALT belum diisi. Sidik pengunjung memakai garam cadangan ' +
          'yang tidak rahasia, sehingga bisa dipetakan balik ke alamat IP aslinya.',
      )
    }
    return 'komite-visitor-salt-please-change'
  }

  return salt
}

/**
 * Sidik pengunjung — bukan pengenal, hanya pembeda.
 *
 * Agen peramban ikut dicampur supaya dua perangkat di balik satu IP kantor
 * tidak terhitung sebagai satu orang. Dipotong 32 karakter karena yang
 * dibutuhkan cuma pembanding kesamaan, bukan kekuatan kriptografis penuh.
 */
export function hashVisitor(ip: string | null, userAgent: string | null): string {
  return crypto
    .createHmac('sha256', visitorSalt())
    .update(`${ip ?? 'unknown'}|${userAgent ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32)
}

/** Bilangan dari header, atau null kalau bukan angka yang masuk akal. */
function coordinate(raw: string | null, limit: number): number | null {
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null
  return value
}

/**
 * Lokasi menurut tepi jaringan.
 *
 * Nama kota dikirim Vercel dalam bentuk ter-encode URL — "Jakarta" aman, tetapi
 * "Bandar Lampung" tiba sebagai "Bandar%20Lampung", dan menyimpannya apa adanya
 * berarti nama itu muncul begitu saja di layar admin.
 */
export function geoFromHeaders(request: Request): VisitorGeo {
  const h = request.headers
  const country = h.get('x-vercel-ip-country')
  const latitude = coordinate(h.get('x-vercel-ip-latitude'), 90)
  const longitude = coordinate(h.get('x-vercel-ip-longitude'), 180)

  if (!country && latitude === null && longitude === null) return EMPTY_GEO

  let city = h.get('x-vercel-ip-city')
  if (city) {
    try {
      city = decodeURIComponent(city)
    } catch {
      // Biarkan apa adanya kalau encoding-nya rusak; nama yang aneh masih lebih
      // berguna daripada kota yang hilang.
    }
  }

  return {
    country: country || null,
    region: h.get('x-vercel-ip-country-region') || null,
    city: city || null,
    latitude,
    longitude,
    source: 'edge',
  }
}

/**
 * Penelusuran cadangan lewat layanan luar.
 *
 * Hanya dipakai ketika tepi jaringan tidak memberi tahu apa-apa — yaitu di
 * pengembangan dan di pemasangan sendiri di luar Vercel. Di Vercel jalur ini
 * tidak pernah tersentuh, jadi tidak ada permintaan keluar tambahan di produksi.
 *
 * Dimatikan dengan `IP_GEO_FALLBACK=0` bagi yang tidak ingin satu pun alamat
 * pengunjung meninggalkan servernya, bahkan ke layanan pencari lokasi.
 */
const lookupCache = new Map<string, VisitorGeo>()

export async function lookupGeo(ip: string): Promise<VisitorGeo> {
  if (process.env.IP_GEO_FALLBACK === '0') return EMPTY_GEO
  if (isPrivateIp(ip)) return EMPTY_GEO

  const cached = lookupCache.get(ip)
  if (cached) return cached

  try {
    // ipwho.is dipilih karena melayani HTTPS tanpa kunci api. Dua kandidat lain
    // gugur saat diuji: ipapi.co membalas 429 dari alamat bersama, dan
    // freeipapi.com melempar pengalihan 307 yang tidak berujung ke JSON.
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })

    if (!response.ok) return EMPTY_GEO

    const data = (await response.json()) as Record<string, unknown>
    if (data.success !== true) return EMPTY_GEO

    const geo: VisitorGeo = {
      country: typeof data.country_code === 'string' ? data.country_code : null,
      region: typeof data.region === 'string' ? data.region : null,
      city: typeof data.city === 'string' ? data.city : null,
      latitude: typeof data.latitude === 'number' ? data.latitude : null,
      longitude: typeof data.longitude === 'number' ? data.longitude : null,
      source: 'lookup',
    }

    // Batas kasar supaya proses yang hidup lama tidak menumpuk entri tanpa henti.
    if (lookupCache.size > 500) lookupCache.clear()
    lookupCache.set(ip, geo)

    return geo
  } catch {
    // Layanan luar yang mati tidak boleh menggagalkan pencatatan kunjungan.
    return EMPTY_GEO
  }
}

/** Kelas perangkat kasar dari agen peramban. Cukup untuk membelah tiga. */
export function deviceClass(userAgent: string | null): string {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/bot|crawler|spider|crawling|headless/.test(ua)) return 'bot'
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet'
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile'
  return 'desktop'
}
