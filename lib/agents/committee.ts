/**
 * Komite investasi
 *
 * Empat agen bergiliran bicara di atas satu berkas fakta. Tiap giliran melihat
 * seluruh transkrip sebelumnya, jadi strateg benar-benar menanggapi laporan
 * analis dan ketua benar-benar menimbang keberatan pengawas risiko — bukan
 * empat pendapat terpisah yang kebetulan disatukan di akhir.
 *
 * Dua keputusan rancangan yang menentukan:
 *
 * Pertama, fakta dikumpulkan lebih dulu secara deterministik dan pemeriksaan
 * kelayakannya dilakukan SEBELUM satu pun model dipanggil. Rapat di atas data
 * basi tidak menghasilkan putusan yang lebih buruk — ia menghasilkan putusan
 * yang terlihat sama meyakinkannya dengan yang benar. Lebih baik berhenti dan
 * menjawab "abstain" daripada membakar kuota untuk keyakinan palsu.
 *
 * Kedua, transkrip ditulis ke database per giliran, bukan sekaligus di akhir.
 * Function serverless punya batas waktu; rapat yang kehabisan waktu di giliran
 * ketiga bisa dilanjutkan oleh retry QStash dari giliran ketiga, bukan diulang
 * dari nol dengan kuota yang sudah terpakai.
 */

import { complete } from '@/lib/ai/registry'
import type { LlmMessage } from '@/lib/ai/types'
import {
  closeAgentSession,
  getAgentTranscript,
  getInstrumentBySymbol,
  openAgentSession,
  recordAgentMessage,
} from '@/lib/db/queries'
import type { AgentVerdict, MarketCode } from '@/lib/db/schema'
import {
  InsufficientDataError,
  STALE_LIMIT_DAYS,
  factsToPrompt,
  gatherFacts,
  type MarketFacts,
} from './tools'
import { COMMITTEE, type AgentRole } from './roles'
import { parseVerdict, type CommitteeVerdict } from './verdict'

export { parseVerdict, type CommitteeVerdict }


export interface CommitteeResult {
  sessionId: number
  symbol: string
  market: MarketCode
  status: 'done' | 'failed'
  verdict: AgentVerdict | null
  confidence: number | null
  rationale: string | null
  /** Terisi saat rapat dihentikan sebelum model dipanggil. */
  skippedReason?: string
  turns: { agent: string; content: string; providerId?: string; latencyMs?: number }[]
  facts?: MarketFacts
}

export interface CommitteeInput {
  market: MarketCode
  symbol: string
  /** Kunci idempotensi. Rapat dengan kunci sama tidak akan dijalankan dua kali. */
  sessionKey: string
}

export async function runCommittee(input: CommitteeInput): Promise<CommitteeResult> {
  const { market, symbol, sessionKey } = input

  const instrument = await getInstrumentBySymbol(market, symbol)
  const session = await openAgentSession({
    sessionKey,
    instrumentId: instrument?.id ?? null,
    market,
    symbol,
  })

  // Rapat yang sudah tuntas tidak diulang. Ini yang membuat pengiriman ulang
  // QStash aman: putusan lama dikembalikan apa adanya.
  if (session.status === 'done') {
    const transcript = await getAgentTranscript(session.id)
    return {
      sessionId: session.id,
      symbol,
      market,
      status: 'done',
      verdict: null,
      confidence: null,
      rationale: null,
      skippedReason: 'Rapat dengan kunci ini sudah selesai sebelumnya.',
      turns: transcript.map((m) => ({ agent: m.agent, content: m.content })),
    }
  }

  // --- Tahap 1: fakta, tanpa model sama sekali -----------------------------

  let facts: MarketFacts
  try {
    facts = await gatherFacts(market, symbol)
  } catch (err) {
    if (err instanceof InsufficientDataError) {
      return abstain(session.id, market, symbol, err.message, null)
    }
    const message = err instanceof Error ? err.message : String(err)
    await closeAgentSession({ sessionId: session.id, status: 'failed', error: message })
    throw err
  }

  const staleLimit = STALE_LIMIT_DAYS[market]
  if (facts.staleDays > staleLimit) {
    return abstain(
      session.id,
      market,
      symbol,
      `Data terakhir ${facts.asOf}, umur ${facts.staleDays} hari — melewati ambang ` +
        `${staleLimit} hari untuk pasar ${market}. Komite tidak dijalankan.`,
      facts,
    )
  }

  // --- Tahap 2: rapat ------------------------------------------------------

  const factsBlock = `FAKTA (satu-satunya sumber angka yang boleh kamu pakai):\n\n${factsToPrompt(facts)}`

  // Giliran yang sudah tercatat dilewati; inilah yang membuat rapat bisa
  // dilanjutkan setelah invocation sebelumnya kehabisan waktu.
  const existing = await getAgentTranscript(session.id)
  const turns: CommitteeResult['turns'] = existing.map((m) => ({
    agent: m.agent,
    content: m.content,
  }))

  let rawVerdict: string | null =
    existing.find((m) => m.agent === 'ketua')?.content ?? null

  for (const [seq, role] of COMMITTEE.entries()) {
    if (existing.some((m) => m.seq === seq)) continue

    const messages = buildMessages(role, factsBlock, turns)

    try {
      const response = await complete({
        messages,
        temperature: role.temperature,
        maxOutputTokens: role.maxOutputTokens,
        json: role.json,
      })

      await recordAgentMessage({
        sessionId: session.id,
        seq,
        agent: role.name,
        content: response.text,
        providerId: response.providerId,
        model: response.model,
        keyIndex: response.keyIndex,
        latencyMs: response.latencyMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      })

      turns.push({
        agent: role.name,
        content: response.text,
        providerId: response.providerId,
        latencyMs: response.latencyMs,
      })

      if (role.name === 'ketua') rawVerdict = response.text
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await closeAgentSession({
        sessionId: session.id,
        status: 'failed',
        factsSnapshot: facts as unknown as Record<string, unknown>,
        error: `Giliran ${role.name} gagal: ${message}`.slice(0, 2000),
      })
      // Dilempar supaya worker membalas 5xx dan QStash mencoba lagi; giliran yang
      // sudah tercatat tidak akan diulang pada percobaan berikutnya.
      throw err
    }
  }

  // --- Tahap 3: putusan ----------------------------------------------------

  const parsed = parseVerdict(rawVerdict)

  if (!parsed) {
    return abstain(
      session.id,
      market,
      symbol,
      'Putusan ketua tidak bisa diurai sebagai JSON yang sah. ' +
        'Abstain dipakai agar balasan yang rusak tidak diam-diam menjadi rekomendasi.',
      facts,
      turns,
    )
  }

  await closeAgentSession({
    sessionId: session.id,
    status: 'done',
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    rationale: [
      parsed.rationale,
      parsed.key_risk ? `Risiko utama: ${parsed.key_risk}` : '',
      parsed.invalidation ? `Pembatalan: ${parsed.invalidation}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    factsSnapshot: facts as unknown as Record<string, unknown>,
  })

  return {
    sessionId: session.id,
    symbol,
    market,
    status: 'done',
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    turns,
    facts,
  }
}

/**
 * Rakit pesan untuk satu giliran.
 *
 * Transkrip sebelumnya dikirim sebagai pesan `user` berlabel nama agen, bukan
 * sebagai `assistant`. Kalau dikirim sebagai `assistant`, model membacanya
 * sebagai ucapannya sendiri dan cenderung menyetujuinya — persis kebalikan dari
 * yang dibutuhkan pengawas risiko.
 */
/**
 * Pagu panjang satu catatan saat diteruskan ke giliran berikutnya.
 *
 * Protokol ringkas di `roles.ts` seharusnya menjaga catatan tetap pendek, tetapi
 * prompt adalah permintaan, bukan jaminan. Tanpa pagu, satu model yang
 * mengabaikannya akan menggandakan biaya setiap giliran sesudahnya — catatan
 * yang sama ikut terkirim tiga kali sampai ketua.
 */
const MAX_FORWARDED_CHARS = 1_200

function clip(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= MAX_FORWARDED_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_FORWARDED_CHARS)}\n[dipotong]`
}

function buildMessages(
  role: AgentRole,
  factsBlock: string,
  turns: CommitteeResult['turns'],
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: 'system', content: role.system }]

  const parts = [factsBlock]

  for (const turn of turns) {
    parts.push(`[${turn.agent.toUpperCase()}]\n${clip(turn.content)}`)
  }

  parts.push(`[GILIRANMU: ${role.title.toUpperCase()}]`)
  messages.push({ role: 'user', content: parts.join('\n\n') })

  return messages
}

/** Tutup rapat sebagai abstain, dengan alasannya tercatat. */
async function abstain(
  sessionId: number,
  market: MarketCode,
  symbol: string,
  reason: string,
  facts: MarketFacts | null,
  turns: CommitteeResult['turns'] = [],
): Promise<CommitteeResult> {
  await closeAgentSession({
    sessionId,
    status: 'done',
    verdict: 'abstain',
    confidence: 0,
    rationale: reason,
    factsSnapshot: facts ? (facts as unknown as Record<string, unknown>) : null,
  })

  console.log(`[Komite] ${market}:${symbol} abstain — ${reason}`)

  return {
    sessionId,
    symbol,
    market,
    status: 'done',
    verdict: 'abstain',
    confidence: 0,
    rationale: reason,
    skippedReason: reason,
    turns,
    facts: facts ?? undefined,
  }
}
