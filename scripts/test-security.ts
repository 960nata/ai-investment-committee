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
