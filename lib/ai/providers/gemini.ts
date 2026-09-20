/**
 * Penyedia Gemini
 *
 * Bentuk permintaannya berbeda dari yang lain: pesan sistem punya tempat
 * tersendiri (`systemInstruction`), peran asisten dinamai `model`, dan kunci
 * dikirim lewat header, bukan `Authorization`.
 *
 * Satu perilakunya perlu penanganan khusus. Free tier punya dua jenis batas —
 * per menit dan per hari — dan keduanya dilaporkan sebagai 429 yang sama.
 * Mendinginkan kunci yang kuota hariannya habis selama satu menit berarti
 * mencobanya lagi ratusan kali sampai besok, jadi pesan galatnya dibaca untuk
 * membedakan keduanya.
 */

import { fetchWithTimeout, MODEL_TIMEOUT_MS } from '@/lib/http/fetch'
import {
  LlmError,
  classifyStatus,
  type LlmAdapter,
  type LlmRequest,
  type LlmResponse,
} from '../types'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 30_000

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

/**
 * Apakah 429 ini soal batas harian, bukan batas per menit.
 * Google menyebut kuota harian dengan `PerDay` di dalam detail galatnya.
 */
export function isDailyQuotaError(detail: string): boolean {
  return /PerDay|per day|daily limit/i.test(detail)
}

export const geminiAdapter: LlmAdapter = {
  id: 'gemini',
  name: 'Google Gemini',
  model: MODEL,
  envPrefix: 'GEMINI_API_KEY',

  async complete(request: LlmRequest, apiKey: string, keyIndex: number): Promise<LlmResponse> {
    const startedAt = Date.now()

    const system = request.messages.filter((m) => m.role === 'system')
    const turns = request.messages.filter((m) => m.role !== 'system')

    const body: Record<string, unknown> = {
      contents: turns.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.temperature ?? 0.4,
        maxOutputTokens: request.maxOutputTokens ?? 1024,
        thinkingConfig: { thinkingBudget: 0 },
        ...(request.json ? { responseMimeType: 'application/json' } : {}),
      },
    }

    if (system.length > 0) {
      body.systemInstruction = { parts: [{ text: system.map((m) => m.content).join('\n\n') }] }
    }

    let response: Response
    try {
      response = await fetchWithTimeout(`${BASE_URL}/models/${MODEL}:generateContent`, {
        label: 'Gemini',
        timeoutMs: MODEL_TIMEOUT_MS,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Header, bukan query string: kunci di URL ikut tercatat di log akses.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      throw new LlmError('gemini', 'network', err instanceof Error ? err.message : String(err))
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      const kind = classifyStatus(response.status)

      throw new LlmError(
        'gemini',
        kind,
        // Penanda ini dibaca registry untuk memilih lama pendinginan.
        kind === 'rate_limited' && isDailyQuotaError(detail)
          ? `[daily] HTTP ${response.status}: ${detail}`
          : `HTTP ${response.status}: ${detail}`,
        response.status,
      )
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      promptFeedback?: { blockReason?: string }
    }

    if (payload.promptFeedback?.blockReason) {
      // Pemblokiran karena filter keamanan bukan kesalahan kunci; mencoba kunci
      // lain akan diblokir dengan alasan yang sama.
      throw new LlmError(
        'gemini',
        'bad_request',
        `Permintaan diblokir: ${payload.promptFeedback.blockReason}`,
      )
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim()

    if (!text) {
      const reason = payload.candidates?.[0]?.finishReason ?? 'tidak diketahui'
      throw new LlmError('gemini', 'server', `Balasan kosong (finishReason: ${reason})`)
    }

    return {
      text,
      providerId: 'gemini',
      model: MODEL,
      keyIndex,
      latencyMs: Date.now() - startedAt,
      inputTokens: payload.usageMetadata?.promptTokenCount,
      outputTokens: payload.usageMetadata?.candidatesTokenCount,
    }
  },
}
