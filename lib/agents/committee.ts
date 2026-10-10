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
import { cache } from '@/lib/cache/redis'
import type { LlmMessage } from '@/lib/ai/types'
import {
  closeAgentSession,
  findReusableAgentSession,
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
import { COMMITTEE, PEMERIKSA, type AgentRole } from './roles'
import { LLM_ADAPTERS } from '@/lib/ai/adapters'
import { parseVerdict, type CommitteeVerdict } from './verdict'
import {
  applyGuard,
  formatCheckTurn,
  parseCheck,
  parseCheckTurn,
  ruleFindings,
  type RuleFindings,
  type VerdictCheck,
} from './guard'

export { parseVerdict, type CommitteeVerdict }

/**
 * Versi prompt dan berkas fakta komite. Naikkan setiap kali isi FAKTA atau
 * peran berubah: putusan lama hanya dipakai ulang bila versinya sama, jadi
 * perbaikan prompt langsung berlaku tanpa menunggu candle baru.
 */
// 2026-09-29.1: blok fakta memuat fundamental, kepemilikan KSEI, dan skor sistem.
// 2026-10-10.1: putusan ketua diperiksa aturan pasti dan model dari keluarga lain.
export const COMMITTEE_VERSION = '2026-10-10.1'


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
  /**
   * Pakai ulang putusan rapat lain yang menilai candle terakhir yang sama.
   * Bawaannya aktif; rapat paksa admin mematikannya.
   */
  reuse?: boolean
}

export async function runCommittee(input: CommitteeInput): Promise<CommitteeResult> {
  const { market, symbol, sessionKey, reuse = true } = input

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

  const snapshot = { ...facts, committeeVersion: COMMITTEE_VERSION } as Record<string, unknown>

  // Giliran yang sudah tercatat dilewati; inilah yang membuat rapat bisa
  // dilanjutkan setelah invocation sebelumnya kehabisan waktu.
  const existing = await getAgentTranscript(session.id)

  if (reuse && existing.length === 0) {
    const reused = await reusePreviousSession(session.id, market, symbol, facts, snapshot)
    if (reused) return reused
  }

  const factsBlocks = {
    full: `FAKTA (satu-satunya sumber angka yang boleh kamu pakai):\n\n${factsToPrompt(facts, 'full')}`,
    summary: `FAKTA (satu-satunya sumber angka yang boleh kamu pakai):\n\n${factsToPrompt(facts, 'summary')}`,
  }

  const turns: CommitteeResult['turns'] = existing.map((m) => ({
    agent: m.agent,
    content: m.content,
    providerId: m.providerId ?? undefined,
  }))

  let rawVerdict: string | null =
    existing.find((m) => m.agent === 'ketua')?.content ?? null

  for (const [seq, role] of COMMITTEE.entries()) {
    if (existing.some((m) => m.seq === seq)) continue

    const messages = buildMessages(role, factsBlocks[role.facts], turns)

    try {
      const response = await complete({
        feature: 'committee',
        messages,
        temperature: role.temperature,
        maxOutputTokens: role.maxOutputTokens,
        json: role.json,
        prefer: await speakingOrder(role.provider, role.name, turns),
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
        factsSnapshot: snapshot,
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

  // --- Tahap 4: pemeriksaan ----------------------------------------------

  const rules = ruleFindings(parsed, facts, factsBlocks.full)
  const check = await checkVerdict(session.id, rules, factsBlocks.summary, turns, existing)
  const guarded = applyGuard(parsed, rules, check?.result ?? null, check?.providerId)

  await closeAgentSession({
    sessionId: session.id,
    status: 'done',
    verdict: guarded.verdict,
    confidence: guarded.confidence,
    rationale: [
      parsed.rationale,
      guarded.note,
      parsed.key_risk ? `Risiko utama: ${parsed.key_risk}` : '',
      parsed.invalidation ? `Pembatalan: ${parsed.invalidation}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    factsSnapshot: snapshot,
  })

  return {
    sessionId: session.id,
    symbol,
    market,
    status: 'done',
    verdict: guarded.verdict,
    confidence: guarded.confidence,
    rationale: [parsed.rationale, guarded.note].filter(Boolean).join(' '),
    turns,
    facts,
  }
}

/**
 * Giliran pemeriksa. Tidak pernah menggagalkan rapat: bila semua penyedia
 * selain milik ketua sedang kena limit, atau balasannya rusak, hasilnya null
 * dan `applyGuard` membatasi keyakinan alih-alih membuang empat giliran yang
 * sudah dibayar.
 */
async function checkVerdict(
  sessionId: number,
  rules: RuleFindings,
  factsBlock: string,
  turns: CommitteeResult['turns'],
  existing: Awaited<ReturnType<typeof getAgentTranscript>>,
): Promise<{ result: VerdictCheck; providerId?: string } | null> {
  const seq = COMMITTEE.length
  const recorded = existing.find((m) => m.seq === seq)
  if (recorded) {
    const result = parseCheckTurn(recorded.content)
    return result ? { result, providerId: recorded.providerId ?? undefined } : null
  }

  const ketuaProvider = turns.find((t) => t.agent === 'ketua')?.providerId
  const findings = [
    rules.shortHistory ? '- Riwayat kurang dari 1 tahun.' : '',
    rules.untracedNumbers.length
      ? `- Angka di putusan yang tidak ditemukan di FAKTA: ${rules.untracedNumbers.join(', ')}`
      : '- Semua angka di putusan terlacak ke FAKTA.',
    rules.bannedWords.length ? `- Kata transaksi terlarang di putusan: ${rules.bannedWords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await complete({
      feature: 'committee-check',
      messages: buildMessages(PEMERIKSA, factsBlock, [...turns, { agent: 'temuan sistem', content: findings }]),
      temperature: PEMERIKSA.temperature,
      maxOutputTokens: PEMERIKSA.maxOutputTokens,
      json: true,
      prefer: await speakingOrder(PEMERIKSA.provider, PEMERIKSA.name, turns),
      exclude: ketuaProvider ? [ketuaProvider] : [],
      timeoutMs: 25_000,
    })

    const result = parseCheck(response.text)
    if (!result) {
      console.warn(`[Komite] balasan pemeriksa dari ${response.providerId} tidak bisa diurai`)
      return null
    }

    const content = formatCheckTurn(rules, result)
    await recordAgentMessage({
      sessionId,
      seq,
      agent: PEMERIKSA.name,
      content,
      providerId: response.providerId,
      model: response.model,
      keyIndex: response.keyIndex,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    })
    turns.push({ agent: PEMERIKSA.name, content, providerId: response.providerId, latencyMs: response.latencyMs })

    return { result, providerId: response.providerId }
  } catch (err) {
    console.warn(`[Komite] pemeriksa tidak terjangkau: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Salin rapat lain yang menilai candle terakhir yang sama, tanpa memanggil model.
 *
 * Giliran disalin ke rapat baru — bukan sekadar dirujuk — supaya halaman yang
 * membaca rapat terbaru tetap menampilkan transkrip lengkap. Hitungan token
 * sengaja dikosongkan: tidak ada token yang dibelanjakan untuk salinan ini.
 */
async function reusePreviousSession(
  sessionId: number,
  market: MarketCode,
  symbol: string,
  facts: MarketFacts,
  snapshot: Record<string, unknown>,
): Promise<CommitteeResult | null> {
  const previous = await findReusableAgentSession({
    market,
    symbol,
    asOf: facts.asOf,
    committeeVersion: COMMITTEE_VERSION,
    excludeSessionId: sessionId,
  })
  if (!previous) return null

  // Putusan ketua yang tidak bisa diurai berakhir sebagai abstain darurat; itu
  // kegagalan model, bukan penilaian, jadi tidak layak disalin.
  const ketua = parseVerdict(previous.turns.find((t) => t.agent === 'ketua')?.content ?? null)
  if (!ketua) return null

  for (const turn of previous.turns) {
    await recordAgentMessage({
      sessionId,
      seq: turn.seq,
      agent: turn.agent,
      content: turn.content,
      providerId: turn.providerId,
      model: turn.model,
    })
  }

  await closeAgentSession({
    sessionId,
    status: 'done',
    verdict: previous.session.verdict,
    confidence: previous.session.confidence,
    rationale: previous.session.rationale,
    factsSnapshot: { ...snapshot, reusedFromSessionId: previous.session.id },
  })

  return {
    sessionId,
    symbol,
    market,
    status: 'done',
    verdict: previous.session.verdict,
    confidence: previous.session.confidence,
    rationale: ketua.rationale,
    skippedReason:
      `Belum ada candle baru sejak rapat #${previous.session.id} (data per ${facts.asOf}); ` +
      'putusannya dipakai ulang tanpa memanggil model.',
    turns: previous.turns.map((t) => ({ agent: t.agent, content: t.content })),
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
 * Urutan penyedia untuk satu giliran: penyedia peran itu dulu, lalu yang belum
 * bicara di rapat ini, baru yang sudah.
 *
 * Tanpa urutan kedua, penyedia peran yang sedang kena limit membuat gilirannya
 * jatuh ke penyedia teratas registry — yang besar kemungkinan sudah menjawab
 * giliran sebelumnya — dan rapat empat model diam-diam menyusut jadi dua.
 */
const localRoleCursors = new Map<string, number>()

/**
 * Urutan penyedia untuk satu giliran:
 * - Jika peran memiliki beberapa kandidat (mis. "openrouter|cerebras"),
 *   sistem merotasi siapa yang maju pertama kali secara bergantian (Round-Robin).
 * - Kandidat yang belum/tidak maju menjadi prioritas cadangan (backup pertama).
 * - Baru kemudian sisa penyedia yang belum bicara di rapat ini.
 */
async function speakingOrder(
  providerSpec: string,
  roleName: string,
  turns: { providerId?: string }[],
): Promise<string[]> {
  const candidates = providerSpec.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
  let orderedCandidates = candidates

  if (candidates.length > 1) {
    const redisKey = `llm:cursor:role:${roleName}`
    let cur = 0

    if (cache.isAvailable()) {
      const stored = await cache.get<number>(redisKey)
      if (typeof stored === 'number') cur = stored
    } else {
      cur = localRoleCursors.get(roleName) ?? 0
    }

    const start = cur % candidates.length
    orderedCandidates = [
      ...candidates.slice(start),
      ...candidates.slice(0, start),
    ]

    const nextCur = (cur + 1) % candidates.length
    if (cache.isAvailable()) {
      await cache.set(redisKey, nextCur)
    }
    localRoleCursors.set(roleName, nextCur)
  }

  const spoken = new Set(turns.map((t) => t.providerId).filter(Boolean))
  const candSet = new Set(orderedCandidates)
  const others = LLM_ADAPTERS.map((a) => a.id).filter((id) => !candSet.has(id))

  return [
    ...orderedCandidates,
    ...others.filter((id) => !spoken.has(id)),
    ...others.filter((id) => spoken.has(id)),
  ]
}

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

  parts.push(
    role.json
      ? `[GILIRANMU: ${role.title.toUpperCase()} — BALAS HANYA OBJEK JSON]`
      : `[GILIRANMU: ${role.title.toUpperCase()}]`,
  )
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
    factsSnapshot: facts ? { ...facts, committeeVersion: COMMITTEE_VERSION } : null,
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
