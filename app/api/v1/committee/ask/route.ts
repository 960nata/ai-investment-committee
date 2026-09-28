/**
 * Tanya Komite (Beta) — tanya jawab bebas atas satu instrumen.
 *
 * Satu panggilan model per pertanyaan, dijaga persis seperti rapat komite:
 * jalurnya di bawah `/api/v1/committee/` sehingga `proxy.ts` memberinya kuota
 * `llm` yang ketat, sesi diwajibkan, dan tiap pertanyaan memesan satu satuan
 * dari pagu harian bersama di `lib/http/budget.ts`.
 *
 * Model hanya diberi fakta yang dihitung dari basis data (dan putusan komite
 * terakhir bila ada). Ia diminta menjawab dari fakta itu saja dan mengatakan
 * "tidak tahu" bila jawabannya tidak ada di sana — jawaban yang terdengar yakin
 * tanpa dasar lebih berbahaya daripada tidak menjawab.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { complete } from '@/lib/ai/registry'
import { gatherFacts, factsToPrompt, InsufficientDataError } from '@/lib/agents/tools'
import { getLatestAgentSessionForSymbol } from '@/lib/db/queries'
import { refundLlmBudget, reserveLlmBudget } from '@/lib/http/budget'
import { getEntitlement } from '@/lib/db/premium-queries'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import { verdictLabel } from '@/lib/format/verdict'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({
  market: z.enum(['CRYPTO', 'IDX', 'US', 'GLOBAL']),
  symbol: z.string().regex(/^[A-Za-z0-9.\-]{1,20}$/, 'Symbol tidak sah'),
  question: z.string().trim().min(3, 'Pertanyaan terlalu pendek.').max(500, 'Pertanyaan maksimal 500 huruf.'),
  /** Beberapa giliran sebelumnya, supaya pertanyaan lanjutan tetap nyambung. */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(6)
    .optional(),
})

const SYSTEM = [
  'Kamu adalah asisten riset "Tanya Komite" di terminal AI Investdesk. Jawab dalam bahasa Indonesia yang lugas.',
  'Jawab HANYA berdasarkan FAKTA dan PUTUSAN KOMITE yang diberikan di bawah. Kalau jawabannya tidak ada di sana, katakan terus terang bahwa datanya tidak tersedia — jangan menebak, jangan mengarang angka, berita, atau laporan keuangan.',
  'Kamu TIDAK memberi anjuran membeli, menjual, atau menahan, dan tidak menyebut target harga. Jelaskan ke mana bukti condong dan apa risikonya. Bila ditanya "harus beli atau tidak", jelaskan bahwa keputusan ada di tangan pengguna lalu uraikan bukti kedua sisi.',
  'Sebut tanggal data (asOf) bila menyebut angka. Maksimal sekitar 200 kata kecuali pengguna meminta rinci.',
].join('\n')

/** Pengguna Premium mendapat uraian yang lebih dalam, dengan batas token yang juga lebih longgar. */
const PREMIUM_NOTE =
  '\nPengguna ini Premium: boleh sampai sekitar 400 kata, uraikan skenario dan risikonya lebih mendalam bila pertanyaannya menuntut.'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = await readBody(request, Body)
  if (!body.ok) return body.response
  const { market, question, history } = body.data
  const symbol = body.data.symbol.toUpperCase()

  // Fakta dikumpulkan sebelum memesan pagu: instrumen yang tidak dikenal atau
  // datanya kurang tidak boleh menghabiskan satu satuan pun.
  let factsText: string
  let committeeText = 'Belum ada rapat komite untuk instrumen ini.'
  try {
    const facts = await gatherFacts(market, symbol)
    factsText = factsToPrompt(facts, 'summary')
    const latest = await getLatestAgentSessionForSymbol(market, symbol)
    if (latest?.session.status === 'done' && latest.session.verdict) {
      committeeText = [
        `Putusan terakhir: ${verdictLabel(latest.session.verdict)} (label data "${latest.session.verdict}")`,
        `Keyakinan: ${latest.session.confidence ?? '—'}/100`,
        `Selesai: ${latest.session.finishedAt?.toISOString() ?? '—'}`,
        `Alasan ketua: ${(latest.session.rationale ?? '').slice(0, 1500)}`,
      ].join('\n')
    }
  } catch (err) {
    if (err instanceof InsufficientDataError) return badRequest(err.message)
    return failure('Committee ask facts', err)
  }

  const entitlement = await getEntitlement(user.uid)
  const budget = await reserveLlmBudget('public', {
    userId: user.uid,
    perUserLimit: entitlement.limits.askPerDay,
  })
  if (!budget.allowed) {
    const message =
      budget.scope === 'user'
        ? entitlement.isPremium || !entitlement.forSale
          ? 'Jatah pertanyaan harian akun ini sudah habis. Silakan lanjut besok.'
          : `Jatah ${budget.ceiling} pertanyaan harian akun gratis sudah habis. Lanjut besok, atau buka kuota lebih besar dengan Premium.`
        : 'Jatah model AI hari ini sudah habis untuk seluruh pengguna. Silakan coba lagi besok.'
    return NextResponse.json(
      { error: message, retryAfterSeconds: budget.resetSeconds },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(budget.resetSeconds) } },
    )
  }

  try {
    const response = await complete({
      messages: [
        { role: 'system', content: `${SYSTEM}${entitlement.isPremium ? PREMIUM_NOTE : ''}\n\n=== FAKTA ===\n${factsText}\n\n=== PUTUSAN KOMITE ===\n${committeeText}` },
        ...(history ?? []),
        { role: 'user', content: question },
      ],
      maxOutputTokens: entitlement.isPremium ? 1400 : 700,
      temperature: 0.3,
      tier: entitlement.isPremium ? 'premium' : 'standard',
    })

    return NextResponse.json(
      {
        answer: response.text.trim(),
        model: response.model,
        provider: response.providerId,
        premium: entitlement.isPremium,
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    await refundLlmBudget('public', { userId: user.uid })
    return failure('Committee ask', err)
  }
}
