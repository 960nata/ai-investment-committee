/**
 * Pengujian lapisan keamanan.
 *
 *   npm run test:security
 *
 * Perlindungan keamanan punya sifat yang menyulitkan: ia tidak terlihat rusak
 * ketika rusak. Header yang hilang, penjaga yang salah arah, atau rahasia yang
 * belum diset tidak memunculkan error apa pun — halaman tetap terbuka, API tetap
 * menjawab, dan semuanya tampak baik-baik saja sampai seseorang memeriksanya.
 *
 * Karena itu tiap perlindungan di proyek ini punya pasangan uji di berkas ini,
 * termasuk uji yang memastikan perlindungannya benar-benar MENOLAK, bukan hanya
 * bahwa jalur normalnya masih jalan.
 */

import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { checkBearer, requireAdmin, requireCron, timingSafeEqual } from '../lib/http/auth'
import { RULES } from '../lib/http/ratelimit'
import { inspect } from '../lib/http/shield'
import { maskIp, resetLocalBans } from '../lib/http/blocklist'

// ---------------------------------------------------------------------------

let passed = 0
const failures: string[] = []

function test(name: string, body: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(body)
    .then(() => {
      passed++
    })
    .catch((err) => {
      failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`)
    })
}

/**
 * Ditulis sebagai fungsi penegasan TypeScript, bukan pemeriksa boolean biasa.
 * Dengan begitu pemeriksa tipe ikut mempersempit tipe setelah pemanggilan, dan
 * uji bisa langsung membaca bidang yang hanya ada di cabang tertentu.
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/**
 * Jalankan proxy terhadap satu permintaan buatan.
 *
 * `NODE_ENV` tidak bisa diubah setelah modul dimuat, jadi uji yang bergantung
 * pada mode produksi memeriksa perilakunya lewat fungsi penjaga secara langsung,
 * bukan lewat proxy.
 */
async function headersFor(path: string): Promise<Headers> {
  const response = await proxy(new NextRequest(`https://contoh.test${path}`))
  return response.headers
}

/**
 * Bangun satu permintaan buatan.
 *
 * Tiap pemanggilan memakai alamat berbeda. Tanpa itu, uji pertama yang memicu
 * blokir akan membuat seluruh uji sesudahnya ditolak sebagai pengunjung yang
 * sama — penjaganya bekerja persis seperti seharusnya, dan hasilnya seluruh
 * berkas uji gagal karena alasan yang tidak ada hubungannya dengan yang diuji.
 */
let probeCounter = 0
function probe(path: string, init: { ua?: string; method?: string } = {}): NextRequest {
  probeCounter++
  const headers = new Headers({ 'x-forwarded-for': `203.0.113.${probeCounter % 250}` })
  if (init.ua !== undefined) headers.set('user-agent', init.ua)

  return new NextRequest(`https://contoh.test${path}`, {
    method: init.method ?? 'GET',
    headers,
  })
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const run = async () => {
  // -------------------------------------------------------------------------
  // Header halaman
  // -------------------------------------------------------------------------

  await test('halaman mendapat seluruh header keamanan dasar', async () => {
    const headers = await headersFor('/')

    const expected = [
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ]
    for (const name of expected) {
      assert(headers.get(name) !== null, `header ${name} tidak terpasang`)
    }

    assert(headers.get('x-content-type-options') === 'nosniff', 'nosniff tidak diset')
    assert(headers.get('x-frame-options') === 'DENY', 'penyematan seharusnya dilarang')
  })

  await test('CSP halaman memakai nonce dan bukan skrip inline bebas', async () => {
    const csp = (await headersFor('/')) .get('content-security-policy') ?? ''

    assert(/script-src[^;]*'nonce-[^']+'/.test(csp), 'script-src harus memakai nonce')
    assert(/script-src[^;]*'strict-dynamic'/.test(csp), "script-src harus memakai strict-dynamic")

    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? ''
    assert(
      !scriptSrc.includes("'unsafe-inline'"),
      "script-src tidak boleh mengizinkan 'unsafe-inline' — di situlah XSS hidup",
    )

    assert(csp.includes("object-src 'none'"), 'object-src harus dikunci')
    assert(csp.includes("frame-ancestors 'none'"), 'frame-ancestors harus dikunci')
    assert(csp.includes("base-uri 'self'"), 'base-uri harus dikunci')
  })

  await test('nonce berbeda pada tiap permintaan', async () => {
    const extract = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1]

    const first = extract((await headersFor('/')).get('content-security-policy') ?? '')
    const second = extract((await headersFor('/')).get('content-security-policy') ?? '')

    assert(first !== undefined && second !== undefined, 'nonce tidak ditemukan di CSP')
    assert(
      first !== second,
      'nonce yang berulang bisa ditebak, dan nonce yang bisa ditebak tidak melindungi apa pun',
    )
  })

  // -------------------------------------------------------------------------
  // Header API
  // -------------------------------------------------------------------------

  await test('API mendapat CSP terkunci penuh', async () => {
    const csp = (await headersFor('/api/v1/stats')).get('content-security-policy') ?? ''
    assert(
      csp.includes("default-src 'none'"),
      'jawaban JSON tidak memuat sumber daya apa pun, jadi kebijakannya harus serapat mungkin',
    )
  })

  await test('API melaporkan sisa kuotanya', async () => {
    const headers = await headersFor('/api/v1/instruments')
    assert(headers.get('x-ratelimit-limit') !== null, 'batas kuota tidak dilaporkan')
    assert(headers.get('x-ratelimit-remaining') !== null, 'sisa kuota tidak dilaporkan')
  })

  await test('endpoint yang menarik data luar punya kuota paling ketat', () => {
    assert(
      RULES.expensive.limit < RULES.ops.limit && RULES.ops.limit < RULES.read.limit,
      'kuota harus makin ketat untuk endpoint yang makin mahal',
    )
  })

  // -------------------------------------------------------------------------
  // Penyaring serangan
  // -------------------------------------------------------------------------

  await test('alamat pemindai ditolak', () => {
    const paths = [
      '/wp-admin/setup-config.php',
      '/.env',
      '/.git/config',
      '/phpmyadmin/index.php',
      '/backup.sql',
      '/anything.php',
    ]

    for (const path of paths) {
      const result = inspect(new Request(`https://contoh.test${path}`))
      assert(result.verdict === 'block', `${path} seharusnya ditolak, bukan ${result.verdict}`)
    }
  })

  await test('perkakas serangan ditolak walau alamatnya wajar', () => {
    for (const ua of ['sqlmap/1.7', 'Nikto/2.5.0', 'Nuclei - Open-source', 'masscan/1.3']) {
      const result = inspect(
        new Request('https://contoh.test/api/v1/stats', { headers: { 'user-agent': ua } }),
      )
      assert(result.verdict === 'block', `${ua} seharusnya ditolak`)
      assert(result.reason === 'attack-tool', `alasan tak terduga: ${result.reason}`)
    }
  })

  await test('muatan suntikan ditolak', () => {
    const attacks = [
      "/api/v1/instruments?symbol=BBCA' UNION SELECT password FROM users--",
      '/api/v1/news?slug=<script>alert(1)</script>',
      '/api/v1/instruments?symbol=x&cb=javascript:alert(1)',
      '/api/v1/news?q=${jndi:ldap://jahat.test/a}',
      '/api/v1/instruments?id=1;drop table users',
    ]

    for (const path of attacks) {
      const result = inspect(new Request(`https://contoh.test${path}`))
      assert(result.verdict === 'block', `${path} seharusnya ditolak`)
      assert(result.reason === 'injection', `alasan tak terduga untuk ${path}: ${result.reason}`)
    }
  })

  await test('penelusuran direktori ditolak, termasuk yang disandikan', () => {
    const attacks = [
      '/api/v1/news/../../../../etc/passwd',
      '/api/v1/news/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/api/v1/instruments?file=../../secret',
    ]

    for (const path of attacks) {
      const result = inspect(new Request(`https://contoh.test${path}`))
      assert(result.verdict === 'block', `${path} seharusnya ditolak`)
    }
  })

  await test('penyandian berlapis tidak membuat muatan lolos', () => {
    // `%2527` adalah tanda kutip yang disandikan dua kali — persis cara yang
    // dipakai untuk melewati pemeriksa yang hanya mendekode sekali.
    const result = inspect(
      new Request('https://contoh.test/api/v1/instruments?symbol=%2527%2520or%25201%253D1'),
    )
    assert(result.verdict === 'block', 'muatan bersandi berlapis seharusnya tetap tertangkap')
  })

  await test('permintaan wajar tidak ikut tertangkap', () => {
    const honest = [
      '/',
      '/ringkasan',
      '/instruments?symbol=BBCA&market=IDX',
      '/berita/rupiah-menguat-pekan-ini',
      '/api/v1/instruments/BTC-USD/candles?range=1y',
      '/api/v1/news?page=2',
      '/favicon.ico',
      '/.well-known/security.txt',
    ]

    for (const path of honest) {
      const result = inspect(
        new Request(`https://contoh.test${path}`, { headers: { 'user-agent': BROWSER_UA } }),
      )
      assert(result.verdict === 'allow', `${path} salah tertangkap sebagai ${result.reason}`)
    }
  })

  await test('judul warta yang mirip nama pemindai tidak ikut tertangkap', () => {
    // Uji ini mengunci alasan kenapa pencocokannya per segmen, bukan per
    // potongan teks. Semua alamat di bawah memuat nama yang ada di daftar
    // pemindai, dan semuanya adalah artikel yang sah. Kalau suatu saat daftarnya
    // kembali dicocokkan sebagai substring, uji inilah yang akan jatuh — bukan
    // pembaca yang mendapati artikelnya hilang tanpa penjelasan.
    const articles = [
      '/warta/whmcs-jadi-sorotan-pasar-teknologi',
      '/warta/pma-asing-masuk-sektor-tambang-nikel',
      '/warta/shellfish-export-naik-tajam',
      '/warta/credentials-digital-jadi-tren-fintech',
      '/berita/jenkins-capital-rilis-laporan-kuartal',
      '/api/v1/news/analisis-solar-dan-energi-terbarukan',
    ]

    for (const path of articles) {
      const result = inspect(
        new Request(`https://contoh.test${path}`, { headers: { 'user-agent': BROWSER_UA } }),
      )
      assert(result.verdict === 'allow', `${path} salah tertangkap sebagai ${result.reason}`)
    }
  })

  await test('perayap mesin telusur tidak diblokir', () => {
    // Blokir yang ikut menjaring Googlebot menghapus situs dari hasil pencarian,
    // dan kerugian itu jauh lebih besar daripada yang dicegahnya.
    const crawlers = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ]

    for (const ua of crawlers) {
      const result = inspect(new Request('https://contoh.test/berita', { headers: { 'user-agent': ua } }))
      assert(result.verdict === 'allow', `${ua} salah tertangkap sebagai ${result.reason}`)
    }
  })

  await test('klien otomatis hanya ditolak di jalur mahal', () => {
    const request = () =>
      new Request('https://contoh.test/api/v1/committee/deliberate', {
        method: 'POST',
        headers: { 'user-agent': 'python-requests/2.31.0' },
      })

    assert(
      inspect(request()).verdict === 'allow',
      'di jalur biasa, curl dan kawan-kawan tidak perlu dihalangi',
    )
    assert(
      inspect(request(), { strict: true }).verdict === 'block',
      'di jalur yang membelanjakan kuota model, klien otomatis harus ditolak',
    )
  })

  await test('proxy menolak pemindai dengan 403, bukan 404 atau 200', async () => {
    resetLocalBans()
    const response = await proxy(probe('/wp-login.php'))
    assert(response.status === 403, `status tak terduga: ${response.status}`)
  })

  await test('penolakan tidak membocorkan apa yang diperiksa', async () => {
    resetLocalBans()
    const scanner = await proxy(probe('/.env'))
    const injection = await proxy(probe("/api/v1/news?slug=' or 1=1--"))

    const first = await scanner.clone().text()
    const second = await injection.clone().text()

    assert(
      !first.toLowerCase().includes('env') && !second.toLowerCase().includes('injection'),
      'pesan penolakan tidak boleh menyebut apa yang memicunya',
    )
  })

  await test('alamat ditopeng sebelum masuk catatan', () => {
    assert(maskIp('103.47.12.199') === '103.47.12.0/24', 'oktet terakhir IPv4 harus dibuang')
    assert(maskIp('2404:6800:4003:c00::64').endsWith('::/48'), 'IPv6 harus dipotong di /48')
    assert(maskIp('unknown') === 'tidak diketahui', 'alamat tak dikenal harus punya sebutan sendiri')

    // Yang penting bukan formatnya, melainkan bahwa alamat utuh tidak pernah
    // bisa disusun ulang dari apa yang tersimpan.
    assert(!maskIp('103.47.12.199').includes('199'), 'alamat utuh tidak boleh bisa dibaca kembali')
  })

  // -------------------------------------------------------------------------
  // Kuota
  // -------------------------------------------------------------------------

  await test('kuota model paling ketat di seluruh daftar', () => {
    const perMinute = (rule: { limit: number; windowSeconds: number }) =>
      rule.limit / rule.windowSeconds

    assert(
      perMinute(RULES.llm) < perMinute(RULES.expensive),
      'endpoint yang memanggil model harus lebih ketat daripada yang menarik data luar',
    )
    assert(
      perMinute(RULES.auth) < perMinute(RULES.ops),
      'endpoint yang menerima kata sandi harus lebih ketat daripada endpoint operasional',
    )
  })

  // -------------------------------------------------------------------------
  // Pembandingan rahasia
  // -------------------------------------------------------------------------

  await test('pembanding waktu-tetap memberi jawaban yang benar', () => {
    assert(timingSafeEqual('rahasia-panjang', 'rahasia-panjang'), 'yang sama harus cocok')
    assert(!timingSafeEqual('rahasia-panjang', 'rahasia-panjanh'), 'beda satu huruf harus tertolak')
    assert(!timingSafeEqual('pendek', 'jauh-lebih-panjang'), 'beda panjang harus tertolak')
    assert(timingSafeEqual('', ''), 'dua string kosong secara teknis sama')
  })

  await test('rahasia yang belum diset membuat penjaga menolak, bukan meloloskan', () => {
    const request = new Request('https://contoh.test/', {
      headers: { authorization: 'Bearer apa-pun-yang-panjang-sekali' },
    })

    const notSet = checkBearer(request, undefined)
    assert(!notSet.ok, 'rahasia kosong tidak boleh meloloskan siapa pun')
    assert(notSet.reason === 'not-configured', `alasan tak terduga: ${JSON.stringify(notSet)}`)
  })

  await test('rahasia yang terlalu pendek ditolak sebagai belum dikonfigurasi', () => {
    const secret = 'pendek'
    const request = new Request('https://contoh.test/', {
      headers: { authorization: `Bearer ${secret}` },
    })

    const result = checkBearer(request, secret)
    assert(
      !result.ok && result.reason === 'not-configured',
      'rahasia sependek ini bisa ditebak, jadi harus dianggap belum diset',
    )
  })

  await test('rahasia yang benar diterima, yang salah ditolak', () => {
    const secret = 'rahasia-yang-cukup-panjang-untuk-dipakai'

    const correct = new Request('https://contoh.test/', {
      headers: { authorization: `Bearer ${secret}` },
    })
    assert(checkBearer(correct, secret).ok, 'rahasia yang benar seharusnya diterima')

    const wrong = new Request('https://contoh.test/', {
      headers: { authorization: `Bearer ${secret}-salah` },
    })
    assert(!checkBearer(wrong, secret).ok, 'rahasia yang salah seharusnya ditolak')

    const none = new Request('https://contoh.test/')
    assert(!checkBearer(none, secret).ok, 'tanpa header seharusnya ditolak')

    const wrongScheme = new Request('https://contoh.test/', {
      headers: { authorization: `Basic ${secret}` },
    })
    assert(!checkBearer(wrongScheme, secret).ok, 'skema selain Bearer seharusnya ditolak')
  })

  await test('penjaga dilonggarkan di luar produksi, dan itu memang disengaja', () => {
    // Uji ini mengunci perilaku yang dipilih sadar: di mesin pengembang, penjaga
    // meloloskan supaya pengembangan tidak terhambat. Kalau suatu saat perilaku
    // ini berubah, uji ini yang akan memberi tahu.
    assert(process.env.NODE_ENV !== 'production', 'uji ini hanya berlaku di luar produksi')
    const bare = new Request('https://contoh.test/')
    assert(requireAdmin(bare).ok, 'penjaga operasional longgar di luar produksi')
    assert(requireCron(bare).ok, 'penjaga cron longgar di luar produksi')
  })

  // -------------------------------------------------------------------------

  if (failures.length > 0) {
    console.error(`\n${failures.length} uji keamanan gagal:\n`)
    for (const failure of failures) console.error(`  ✗ ${failure}\n`)
    console.error(`${passed} lolos, ${failures.length} gagal\n`)
    process.exit(1)
  }

  console.log(`\n${passed} uji keamanan lolos.\n`)
}

run()
