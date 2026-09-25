/**
 * Rapat komite.
 *
 * Endpoint ini satu-satunya di proyek ini yang penyalahgunaannya tidak berhenti
 * di beban server. Satu panggilan POST menjalankan beberapa panggilan model, dan
 * kunci yang dipakainya adalah kunci gratisan dengan kuota harian yang habis
 * sungguhan. Skrip sederhana yang memanggil endpoint ini semalaman tidak
 * merusak apa pun — ia hanya membuat seluruh proyek berhenti bekerja esok
 * paginya, untuk semua orang, sampai kuotanya pulih.
 *
 * Karena itu jalur POST-nya dijaga berlapis, dari yang paling murah:
 *
 *   1. `proxy.ts` menyaring perkakas otomatis dan membatasi tiga panggilan per
 *      jam per pemanggil.
 *   2. Sesi diwajibkan di sini. Pemanggil tanpa akun tidak pernah sampai ke
 *      lapisan model sama sekali.
 *   3. `force` — yang melewati penggunaan-ulang hasil harian — hanya untuk
 *      pengelola. Bagi pengguna biasa, dua permintaan untuk simbol yang sama di
 *      hari yang sama memakai satu kunci sesi yang sama, dan yang kedua dijawab
 *      dari hasil yang sudah ada tanpa memanggil model lagi.
 *   4. Pagu harian di `lib/http/budget.ts` membatasi total belanja seluruh
 *      pemanggil bersama-sama. Inilah satu-satunya lapisan yang masih berlaku
 *      ketika penyerang datang dari seratus alamat berbeda.
 *
 * Lapisan keempat itu yang paling penting dan paling mudah dilupakan. Tiga
 * lapisan pertama semuanya bertanya "siapa yang memanggil"; hanya yang keempat
 * bertanya "berapa yang sudah dibelanjakan hari ini", dan hanya pertanyaan itu
 * yang jawabannya benar-benar menentukan apakah kuncinya masih hidup besok.
 */

import { NextResponse } from 'next/server'
import { runCommittee } from '@/lib/agents/committee'
import { getLatestAgentSessionForSymbol } from '@/lib/db/queries'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { refundLlmBudget, reserveLlmBudget } from '@/lib/http/budget'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import type { MarketCode } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/** Pasar yang dikenal. Apa pun di luar ini tidak pernah sampai ke kueri. */
const MARKETS: readonly MarketCode[] = ['CRYPTO', 'IDX', 'US', 'GLOBAL']

/**
 * Bentuk simbol yang diterima.
 *
 * Bukan sekadar kerapian: simbol ikut menyusun kunci sesi dan kunci cache, dan
 * nilai sepanjang sepuluh ribu karakter akan menumbuhkan kedua-duanya tanpa
 * batas. Huruf, angka, titik, dan strip sudah mencakup tiap simbol di ketiga
 * pasar yang didukung.
 */
const SYMBOL_PATTERN = /^[A-Za-z0-9.\-]{1,20}$/

function readTarget(input: { market?: unknown; symbol?: unknown }):
  | { ok: true; market: MarketCode; symbol: string }
  | { ok: false; message: string } {
  const { market, symbol } = input

  if (typeof market !== 'string' || typeof symbol !== 'string') {
    return { ok: false, message: 'Market dan symbol wajib diisi' }
  }
  if (!MARKETS.includes(market as MarketCode)) {
    return { ok: false, message: 'Market tidak dikenal' }
  }
  if (!SYMBOL_PATTERN.test(symbol)) {
    return { ok: false, message: 'Symbol tidak sah' }
  }

  return { ok: true, market: market as MarketCode, symbol: symbol.toUpperCase() }
}

/**
 * Baca hasil rapat yang sudah tersimpan.
 *
 * Hanya menyentuh basis data, tidak pernah memanggil model, jadi kuotanya
 * mengikuti pembacaan biasa. Tetap butuh sesi: isinya penilaian atas instrumen,
 * yang memang barang yang dijual terminal ini.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const target = readTarget({
    market: searchParams.get('market'),
    symbol: searchParams.get('symbol'),
  })

  if (!target.ok) return badRequest(target.message)

  try {
    const data = await getLatestAgentSessionForSymbol(target.market, target.symbol)
    return NextResponse.json(
      { session: data?.session ?? null, turns: data?.turns ?? [] },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('Committee GET', err)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Badan permintaan bukan JSON yang sah')
  }

  const { force } = body as { force?: unknown }
  const target = readTarget(body as { market?: unknown; symbol?: unknown })
  if (!target.ok) return badRequest(target.message)

  // `force` melewati penggunaan-ulang hasil harian, jadi ia selalu berarti satu
  // rapat baru yang sungguhan dibelanjakan. Pengguna biasa tidak perlu memaksa —
  // yang mereka cari adalah penilaian hari ini, dan penilaian hari ini sudah ada.
  const forced = force === true && user.role === 'admin'

  const todayStr = new Date().toISOString().slice(0, 10)
  const sessionKey = forced
    ? `on-demand-${target.symbol}-${Date.now()}`
    : `daily-${target.symbol}-${todayStr}`

  const budget = await reserveLlmBudget('public', { userId: user.uid })

  if (!budget.allowed) {
    const message =
      budget.scope === 'user'
        ? 'Jatah rapat harian akun ini sudah habis. Silakan lanjut besok.'
        : 'Jatah rapat komite hari ini sudah habis untuk seluruh pengguna. Silakan coba lagi besok.'

    // Pagu yang sedang turun kelas jauh lebih sempit daripada pagu sebenarnya,
    // jadi penolakannya bisa datang jauh lebih cepat daripada yang diduga
    // pembaca log. Dicatat supaya tidak ditelusuri sebagai kesalahan lain.
    if (budget.degraded) {
      console.warn(
        '[Committee] pagu turun kelas ke penghitung memori — Redis belum dikonfigurasi. ' +
          `Ditolak di ${budget.used}/${budget.ceiling}.`,
      )
    }

    return NextResponse.json(
      { error: message, retryAfterSeconds: budget.resetSeconds },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(budget.resetSeconds) } },
    )
  }

  try {
    const result = await runCommittee({
      market: target.market,
      symbol: target.symbol,
      sessionKey,
    })

    // Rapat yang dilewati tidak memanggil model sama sekali — hasilnya dibaca
    // dari rapat yang sudah selesai sebelumnya. Membiarkan satuannya terpakai
    // akan membuat pagu habis oleh permintaan yang tidak membelanjakan apa pun.
    if (result.skippedReason) {
      await refundLlmBudget('public', { userId: user.uid })
    }

    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (err) {
    await refundLlmBudget('public', { userId: user.uid })
    return failure('Committee POST', err)
  }
}
