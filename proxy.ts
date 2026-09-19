/**
 * Proxy — lapisan keamanan yang berjalan sebelum route mana pun.
 *
 * Tiga tugas, dan ketiganya sengaja dipusatkan di sini alih-alih diulang di tiap
 * route. Perlindungan yang harus diingat untuk dipasang satu per satu adalah
 * perlindungan yang cepat atau lambat terlupa di satu tempat.
 *
 * 1. Header keamanan untuk seluruh jawaban.
 * 2. Content Security Policy dengan nonce untuk halaman.
 * 3. Pembatas laju untuk API.
 *
 * Catatan: di Next 16 berkas ini bernama `proxy.ts`; nama `middleware.ts` sudah
 * usang. Lihat `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { callerKey, rateLimit, RULES, type RateLimitRule } from '@/lib/http/ratelimit'

const isProduction = process.env.NODE_ENV === 'production'

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
    "img-src 'self' blob: data:",
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

/** Aturan kuota per kelompok jalur. */
function ruleFor(pathname: string): { scope: string; rule: RateLimitRule } {
  // Endpoint ini menarik data dari sumber luar, jadi jauh lebih mahal daripada
  // sekadar membaca basis data.
  if (pathname.startsWith('/api/jobs/')) return { scope: 'jobs', rule: RULES.expensive }
  if (pathname.startsWith('/api/v1/ai/')) return { scope: 'ops', rule: RULES.ops }
  if (pathname.startsWith('/api/cron/')) return { scope: 'cron', rule: RULES.ops }
  return { scope: 'read', rule: RULES.read }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const headers = baseHeaders()

  // --- API ------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    const { scope, rule } = ruleFor(pathname)
    const result = await rateLimit(scope, callerKey(request), rule)

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
