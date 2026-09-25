/**
 * Proxy — lapisan keamanan yang berjalan sebelum route mana pun.
 *
 * Lima tugas, dan semuanya sengaja dipusatkan di sini alih-alih diulang di tiap
 * route. Perlindungan yang harus diingat untuk dipasang satu per satu adalah
 * perlindungan yang cepat atau lambat terlupa di satu tempat.
 *
 * 1. Header keamanan untuk seluruh jawaban.
 * 2. Content Security Policy dengan nonce untuk halaman.
 * 3. Penyaring serangan dan daftar blokir.
 * 4. Pembatas laju untuk API.
 * 5. Gerbang sesi untuk halaman terminal.
 *
 * Nomor 3 berjalan lebih dulu daripada nomor 4, dan urutan itu bukan selera.
 * Pemeriksaan pola tidak memakai satu pun perintah Redis, sedangkan pembatas
 * laju memakai satu untuk tiap permintaan. Kalau urutannya dibalik, pemindai
 * yang mengetuk lima ribu alamat sampah akan menghabiskan lima ribu perintah
 * kuota hanya untuk ditolak — penolakannya berhasil, kuotanya tetap habis, dan
 * itu persis hasil yang sedang dicegah.
 *
 * Soal nomor 5: panduan Next menyebut pemeriksaan di proxy sebagai pemeriksaan
 * optimistis — murah, terpusat, dan berjalan di tiap alamat, tetapi bukan
 * satu-satunya pertahanan. Karena itu ia hanya membaca cookie dan tidak pernah
 * menyentuh basis data; penjagaan yang mengikat tetap dilakukan tiap halaman
 * lewat `requireUser()` di `lib/auth/user-auth.ts`.
 *
 * Catatan: di Next 16 berkas ini bernama `proxy.ts`; nama `middleware.ts` sudah
 * usang. Lihat `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
 */

import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { gate, RULES, type RateLimitRule } from '@/lib/http/ratelimit'
import { bannedInMemory, punish } from '@/lib/http/blocklist'
import { BLOCK_MESSAGE, inspect } from '@/lib/http/shield'
import { readSessionToken, USER_SESSION_COOKIE } from '@/lib/auth/session'
import { isRequestAdminAuthenticated } from '@/lib/auth/admin-token'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Asal penyimpanan gambar, kalau dikonfigurasi.
 *
 * Sampul warta dicerminkan ke Supabase Storage, jadi alamatnya bukan `'self'`.
 * Tanpa baris ini peramban memblokir tiap sampul tanpa suara — halamannya
 * tergambar utuh, gambarnya saja yang tidak pernah muncul, dan tidak ada yang
 * gagal dengan cukup keras untuk diperhatikan.
 *
 * Dibaca dari env, bukan ditulis mati: proyek yang sama bisa berjalan di atas
 * bucket yang berbeda, dan asal yang ditulis mati akan diam-diam salah di sana.
 */
/** Asal ubin peta. Sepadan dengan TILE_URL di components/visitor-map.tsx. */
const MAP_TILE_ORIGIN = 'https://*.basemaps.cartocdn.com'

const imageOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
})()

/**
 * Header yang berlaku untuk semua jawaban.
 *
 * `frame-ancestors` di CSP sudah melarang penyematan, tetapi `X-Frame-Options`
 * tetap dipasang untuk peramban lama yang belum memahaminya. Dua lapis untuk
 * satu ancaman itu murah.
 */
function baseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-dns-prefetch-control': 'off',
    // Proyek ini tidak butuh satu pun dari perangkat di bawah. Mematikannya
    // lebih dulu berarti pustaka pihak ketiga mana pun tidak bisa diam-diam
    // memintanya nanti.
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  }

  if (isProduction) {
    // Dua tahun, termasuk subdomain. Jangan dipasang di pengembangan: sekali
    // peramban mengingatnya untuk localhost, seluruh proyek lain di mesin yang
    // sama ikut dipaksa HTTPS.
    headers['strict-transport-security'] = 'max-age=63072000; includeSubDomains; preload'
  }

  return headers
}

/**
 * Susun CSP untuk halaman.
 *
 * `script-src` adalah satu-satunya arahan yang benar-benar menahan XSS, jadi di
 * situlah kekakuan dipasang: hanya skrip bernonce dan skrip yang dimuatnya yang
 * boleh jalan.
 *
 * `style-src` sengaja mengizinkan inline. Antarmuka ini memakai atribut `style`
 * React di banyak tempat, dan CSP gaya yang kaku akan memblokirnya sehingga
 * halaman tampil rusak. Suntikan gaya jauh lebih terbatas akibatnya daripada
 * suntikan skrip, jadi pertukarannya sepadan — dan dicatat di sini supaya
 * menjadi keputusan yang terlihat, bukan kelalaian yang tersembunyi.
 */
function contentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // Ubin peta datang sebagai gambar dari CDN CARTO; tanpa asal ini peta
    // pengunjung di portal admin tergambar sebagai kotak kosong.
    `img-src 'self' blob: data: ${MAP_TILE_ORIGIN}${imageOrigin ? ` ${imageOrigin}` : ''}`,
    "font-src 'self'",
    // Bursa dipanggil langsung dari peramban untuk harga bergerak; fungsi
    // serverless tidak bisa memegang koneksi WebSocket yang hidup lama.
    "connect-src 'self' https://api.binance.com wss://stream.binance.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]

  // Di pengembangan situsnya memang berjalan di http://localhost, jadi arahan
  // ini akan mematahkannya.
  if (isProduction) directives.push('upgrade-insecure-requests')

  return directives.join('; ')
}

interface PathPolicy {
  scope: string
  rule: RateLimitRule
  /**
   * Benar hanya untuk jalur yang membelanjakan kuota model.
   *
   * Di jalur itu klien otomatis — curl, python-requests, headless browser —
   * ikut diblokir, bukan sekadar dibatasi lajunya. Sengaja tidak dipasang di
   * jalur lain, termasuk di endpoint masuk: pemblokiran berdasarkan agen
   * peramban punya harga berupa pengguna sah yang salah tertangkap, dan harga
   * itu hanya sepadan ketika yang dilindungi adalah sumber daya yang benar-benar
   * habis. Endpoint masuk dijaga kuota ketat, yang tidak pernah salah tangkap.
   */
  strict: boolean
}

/**
 * Aturan kuota per kelompok jalur.
 *
 * Metode ikut menentukan, bukan hanya alamat. Di endpoint komite, GET membaca
 * hasil rapat yang sudah tersimpan sementara POST menjalankan rapat baru — dua
 * biaya yang berbeda beberapa ribu kali lipat di alamat yang sama. Menyamakan
 * kuotanya berarti salah satu dari dua kesalahan: dashboard yang macet setelah
 * tiga kali menggulir, atau lapisan model yang boleh dipanggil seratus dua
 * puluh kali semenit.
 */
function ruleFor(pathname: string, method: string): PathPolicy {
  // Satu panggilan ke sini menjalankan beberapa panggilan model sekaligus.
  // Inilah satu-satunya jalur di proyek ini yang penyalahgunaannya langsung
  // berarti kunci mati, jadi inilah yang dijaga paling keras.
  if (pathname.startsWith('/api/v1/committee/')) {
    return method === 'GET'
      ? { scope: 'read', rule: RULES.read, strict: false }
      : { scope: 'llm', rule: RULES.llm, strict: true }
  }
  // Endpoint masuk dan daftar adalah sasaran tebakan beruntun, jadi kuotanya
  // jauh lebih sempit daripada pembacaan biasa.
  if (pathname.startsWith('/api/v1/auth/')) {
    return { scope: 'auth', rule: RULES.auth, strict: false }
  }
  // Tiap ketukan menulis satu baris ke Postgres. Kuotanya menjaga tabelnya,
  // bukan menjaga endpointnya.
  if (pathname.startsWith('/api/v1/analytics/')) {
    return { scope: 'beacon', rule: RULES.beacon, strict: false }
  }
  // Endpoint ini menarik data dari sumber luar, jadi jauh lebih mahal daripada
  // sekadar membaca basis data. Penjaga sebenarnya di sini adalah tanda tangan
  // QStash; kuotanya hanya lapis kedua — dan `strict` sengaja mati, sebab
  // penjadwalnya memang klien otomatis dan akan tertangkap sendiri.
  if (pathname.startsWith('/api/jobs/')) {
    return { scope: 'jobs', rule: RULES.expensive, strict: false }
  }
  // Tiap teks baru di sini dikirim ke model. Cache membuat sebagian besar
  // ketukan gratis, tapi endpoint publik yang bisa membelanjakan kuota model
  // tetap butuh kuotanya sendiri.
  if (pathname.startsWith('/api/v1/i18n/')) {
    return { scope: 'translate', rule: RULES.translate, strict: false }
  }
  if (pathname.startsWith('/api/v1/ai/')) return { scope: 'ops', rule: RULES.ops, strict: false }
  if (pathname.startsWith('/api/cron/')) return { scope: 'cron', rule: RULES.ops, strict: false }
  return { scope: 'read', rule: RULES.read, strict: false }
}

/**
 * Jawaban untuk permintaan yang ditolak penyaring.
 *
 * Satu kalimat yang sama untuk semua alasan, dan tidak pernah menyebut yang
 * mana. Pesan galat yang membedakan "alamat terlarang" dari "muatan
 * mencurigakan" adalah petunjuk gratis buat yang sedang meraba — ia cukup
 * mencoba beberapa kali untuk memetakan apa yang diperiksa dan apa yang tidak.
 */
function blocked(headers: Record<string, string>, isApi: boolean): NextResponse {
  const common = { ...headers, 'cache-control': 'no-store, max-age=0' }

  if (isApi) {
    return NextResponse.json({ error: BLOCK_MESSAGE }, { status: 403, headers: common })
  }

  return new NextResponse(BLOCK_MESSAGE, {
    status: 403,
    headers: { ...common, 'content-type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Jalur yang hanya boleh dibuka setelah masuk.
 *
 * Daftar ini memuat awalan, bukan alamat persis, supaya halaman anak ikut
 * terkunci tanpa perlu didaftarkan satu per satu. Beranda, warta publik,
 * halaman masuk dan daftar sengaja tidak ada di sini: itulah wajah situs untuk
 * pengunjung yang belum punya akun.
 */
const PROTECTED_PREFIXES = [
  '/ringkasan',
  '/instruments',
  '/berita',
  '/pipeline',
  '/backtest',
]

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  const { pathname } = request.nextUrl
  const headers = baseHeaders()
  const isApi = pathname.startsWith('/api/')
  const policy = ruleFor(pathname, request.method)

  // --- Penyaring serangan ---------------------------------------------------
  // Dua pemeriksaan pertama tidak memakai satu pun perintah berbayar, dan
  // keduanya berjalan sebelum apa pun yang memakai.

  if (bannedInMemory(request)) return blocked(headers, isApi)

  const inspection = inspect(request, { strict: isApi && policy.strict })

  if (inspection.verdict === 'block' && inspection.reason) {
    // Pencatatan dan penjatuhan hukuman tidak perlu ditunggu pemanggil. Ia
    // menulis ke Redis, dan penyerang tidak berhak atas latensi siapa pun.
    // Di luar Vercel `event` bisa tidak ada — di situ ditunggu saja, sebab
    // pekerjaan yang tidak pernah dijalankan sama dengan tidak ada penjaga.
    const work = punish(request, inspection.reason, inspection.evidence)
    if (event) event.waitUntil(work)
    else await work

    return blocked(headers, isApi)
  }

  // --- API ------------------------------------------------------------------
  if (isApi) {
    const { scope, rule } = policy
    const result = await gate(scope, request, rule)

    // Blokir dari pelanggaran sebelumnya, dibaca dari Redis. Tidak dicatat lagi:
    // insidennya sudah tercatat saat blokirnya dijatuhkan, dan mencatat tiap
    // ketukan sesudahnya hanya akan menenggelamkan log oleh satu penyerang.
    if (result.banned) return blocked(headers, true)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
        {
          status: 429,
          headers: {
            ...headers,
            'retry-after': String(result.retryAfterSeconds),
            'cache-control': 'no-store, max-age=0',
          },
        },
      )
    }

    const response = NextResponse.next()
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)

    // Jawaban JSON tidak pernah memuat atau memuat ulang sumber daya apa pun,
    // jadi kebijakannya bisa serapat mungkin.
    response.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
    response.headers.set('x-ratelimit-limit', String(rule.limit))
    response.headers.set('x-ratelimit-remaining', String(result.remaining))

    return response
  }

  // --- Gerbang sesi ---------------------------------------------------------
  if (isProtectedPage(pathname)) {
    const session = readSessionToken(request.cookies.get(USER_SESSION_COOKIE)?.value)

    // Sesi admin ikut diterima. Pengelola yang sudah membuktikan diri lewat PIN
    // tidak perlu membuktikannya dua kali untuk melihat terminal yang sama.
    if (!session && !isRequestAdminAuthenticated(request)) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', pathname + request.nextUrl.search)

      const redirect = NextResponse.redirect(login)
      for (const [key, value] of Object.entries(headers)) redirect.headers.set(key, value)
      return redirect
    }
  }

  // --- Halaman --------------------------------------------------------------
  const nonce = crypto.randomUUID()
  const csp = contentSecurityPolicy(nonce)

  // Nonce dikirim balik ke proses render lewat header permintaan; dari situ
  // Next menempelkannya sendiri ke skrip kerangka dan bundel halaman.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  response.headers.set('content-security-policy', csp)

  return response
}

export const config = {
  matcher: [
    {
      // Berkas statis tidak membutuhkan nonce, dan mencocokkannya hanya
      // menambah pekerjaan pada tiap muatan halaman.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
