/**
 * Tanya AI di Kalkulator Investasi — satu-satunya endpoint model yang boleh
 * dipanggil tanpa akun.
 *
 * Karena tanpa akun, ia dijaga berlapis, dari yang paling murah:
 *
 *   1. `proxy.ts` memberinya kuota `llm` yang ketat per pemanggil dan menyaring
 *      perkakas otomatis (jalurnya di bawah /api/v1/kalkulator/).
 *   2. Masukan dibatasi: pertanyaan pendek, konteks hitungan berupa angka saja,
 *      tanpa riwayat percakapan — satu pertanyaan, satu jawaban pendek.
 *   3. Vercel BotID: permintaan dari selain peramban sungguhan ditolak tanpa
 *      pengunjung perlu mencentang apa pun. Cloudflare Turnstile menjadi lapis
 *      tambahan opsional bila kuncinya diisi. Bot berhenti di sini sebelum
 *      menyentuh pagu maupun model.
 *   4. Pagu harian: pengunjung anonim memakai saluran `anonymous` — jatahnya
 *      kecil, terpisah dari jatah pengguna yang masuk, dan dibatasi lagi per
 *      sidik IP. Pengguna yang sudah masuk memakai jatah akunnya sendiri.
 *
 * Tanpa Redis (Upstash), penghitung pagu hanya ada di memori tiap instance
 * Vercel dan otomatis dipotong jauh lebih ketat. Turnstile tetap menahan bot.
 */

import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { complete } from '@/lib/ai/registry'
import { callerIp } from '@/lib/http/blocklist'
import { hashVisitor } from '@/lib/analytics/geo'
import { refundLlmBudget, reserveLlmBudget } from '@/lib/http/budget'
import { failure, NO_STORE } from '@/lib/http/errors'
import { toPlainText } from '@/lib/member/news-context'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

/** Konteks hitungan: label pendek dan angka saja, tidak ada teks bebas yang panjang. */
const Context = z.object({
  calculator: z.enum(['dca', 'target', 'darurat', 'alokasi']),
  inputs: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(40)])).refine(
    (o) => Object.keys(o).length <= 12,
    'Konteks terlalu besar.',
  ),
  results: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(80)])).refine(
    (o) => Object.keys(o).length <= 12,
    'Konteks terlalu besar.',
  ),
})

const Body = z.object({
  question: z.string().trim().min(3, 'Pertanyaan terlalu pendek.').max(300, 'Pertanyaan maksimal 300 huruf.'),
  context: Context.optional(),
  turnstileToken: z.string().max(2048).optional(),
})

const CALC_LABEL: Record<z.infer<typeof Context>['calculator'], string> = {
  dca: 'Investasi rutin (DCA)',
  target: 'Target dana',
  darurat: 'Dana darurat',
  alokasi: 'Profil risiko & alokasi',
}

const SYSTEM = [
  'Kamu adalah asisten Kalkulator Investasi di AI Investdesk, dibuat oleh hadinata.dev. Bila ditanya pembuatmu, jawab AI Investdesk dibuat oleh hadinata.dev; jangan menyebut nama model atau perusahaan AI di baliknya.',
  'Kamu membantu orang memahami hasil hitungan investasi dan perencanaan keuangan pribadi: menabung, dana darurat, DCA, target dana, alokasi aset (deposito, obligasi/SBN, reksa dana, saham, emas), inflasi, dan bunga majemuk.',
  'Beri jawaban praktis dan konkret: jelaskan arti angkanya, apakah targetnya realistis, dan langkah yang bisa diambil (misalnya menaikkan setoran, memperpanjang jangka waktu, menyesuaikan profil risiko). Boleh menyebut kisaran alokasi per profil risiko dan jenis instrumen yang cocok.',
  'Jangan memberi perintah beli/jual saham atau koin tertentu, jangan menyebut target harga, dan jangan menjanjikan imbal hasil. Kalau ditanya "saham apa yang harus dibeli", jelaskan cara memilih dan sarankan membuka terminal AI Investdesk untuk data per instrumen.',
  'Angka dari konteks hitungan di bawah adalah fakta; jangan mengubahnya. Jangan mengarang data pasar terkini, suku bunga terkini, atau berita.',
  'Pertanyaan di luar keuangan ditolak dengan ramah dalam satu kalimat.',
  'Nada hangat dan sederhana seperti teman yang paham keuangan. Teks polos tanpa markdown (tanpa * atau #); poin pakai tanda •. Maksimal sekitar 150 kata. Tutup arah investasi dengan satu kalimat singkat bahwa ini gambaran umum, bukan nasihat berlisensi.',
].join('\n')

function contextText(ctx: z.infer<typeof Context> | undefined): string {
  if (!ctx) return 'Pengguna belum menjalankan kalkulator.'
  const fmt = (o: Record<string, number | string>) =>
    Object.entries(o)
      .map(([k, v]) => `- ${k}: ${typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : v}`)
      .join('\n')
  return `Kalkulator: ${CALC_LABEL[ctx.calculator]}\nMasukan:\n${fmt(ctx.inputs)}\nHasil:\n${fmt(ctx.results)}`
}

export async function POST(request: Request) {
  const body = await readBody(request, Body)
  if (!body.ok) return body.response
  const { question, context, turnstileToken } = body.data

  // Bot ditolak paling awal: sebelum pagu dipesan dan sebelum model dipanggil.
  const bot = await checkBotId().catch(() => null)
  if (bot?.isBot) {
    return NextResponse.json({ error: 'Permintaan ditolak.' }, { status: 403, headers: NO_STORE })
  }

  const user = await getCurrentUser()
  const ip = callerIp(request)

  // Pengguna yang sudah masuk sudah terbukti bukan bot lewat proses masuknya;
  // pengunjung anonim wajib lolos tantangan untuk setiap pertanyaan.
  if (!user) {
    const challenge = await verifyTurnstile(turnstileToken, ip, 'kalkulator-ai')
    if (!challenge.ok) {
      return NextResponse.json(
        { error: 'Verifikasi keamanan gagal. Centang ulang verifikasinya lalu kirim lagi.' },
        { status: 403, headers: NO_STORE },
      )
    }
  }

  const channel = user ? 'public' : 'anonymous'
  const subject = user ? undefined : hashVisitor(ip, 'kalkulator-ai')
  const budget = await reserveLlmBudget(channel, user ? { userId: user.uid } : { subject })
  if (!budget.allowed) {
    const message = user
      ? 'Jatah pertanyaan AI akunmu hari ini sudah habis. Kalkulatornya tetap bisa dipakai.'
      : budget.scope === 'user'
        ? 'Jatah pertanyaan AI untuk pengunjung tanpa akun sudah habis hari ini. Daftar gratis untuk jatah lebih banyak — kalkulatornya tetap bisa dipakai.'
        : 'Jatah AI untuk pengunjung tanpa akun sedang penuh hari ini. Daftar gratis untuk tetap bisa bertanya — kalkulatornya tetap bisa dipakai.'
    return NextResponse.json(
      { error: message, needsAccount: !user },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(budget.resetSeconds) } },
    )
  }

  try {
    const response = await complete({
        feature: 'calculator',
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n=== KONTEKS HITUNGAN ===\n${contextText(context)}` },
        { role: 'user', content: question },
      ],
      maxOutputTokens: 500,
      temperature: 0.3,
      tier: 'standard',
    })
    return NextResponse.json({ answer: toPlainText(response.text) }, { headers: NO_STORE })
  } catch (err) {
    await refundLlmBudget(channel, user ? { userId: user.uid } : { subject })
    return failure('Kalkulator ask', err)
  }
}
