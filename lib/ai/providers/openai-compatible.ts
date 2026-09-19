/**
 * Penyedia berformat OpenAI
 *
 * Groq, OpenRouter, DeepSeek, Mistral, dan NVIDIA semuanya memakai bentuk
 * permintaan yang sama persis — `/chat/completions` dengan `Bearer` di header.
 * Menulis satu adaptor per penyedia hanya akan menyalin fungsi ini lima kali,
 * jadi yang dibedakan cuma base URL dan nama modelnya.
 */

import {
  LlmError,
  classifyStatus,
  type LlmAdapter,
  type LlmRequest,
  type LlmResponse,
} from '../types'

/** Batas waktu per panggilan. Function Vercel punya batasnya sendiri; agen harus menyerah lebih dulu. */
const TIMEOUT_MS = 30_000

export interface OpenAiCompatibleConfig {
  id: string
  name: string
  baseUrl: string
  model: string
  envPrefix: string
  /** Header tambahan; OpenRouter meminta atribusi aplikasi. */
  extraHeaders?: Record<string, string>
}

export function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): LlmAdapter {
  return {
    id: config.id,
    name: config.name,
    model: config.model,
    envPrefix: config.envPrefix,

    async complete(request: LlmRequest, apiKey: string, keyIndex: number): Promise<LlmResponse> {
      const startedAt = Date.now()

      const body: Record<string, unknown> = {
        model: config.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxOutputTokens ?? 1024,
      }

      if (request.json) {
        body.response_format = { type: 'json_object' }
      }

      let response: Response
      try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            ...config.extraHeaders,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (err) {
        // Gagal jaringan dan kehabisan waktu sama-sama belum sampai ke penyedia,
        // jadi kuncinya tidak boleh ikut dihukum.
        throw new LlmError(
          config.id,
          'network',
          err instanceof Error ? err.message : String(err),
        )
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 400)
        throw new LlmError(
          config.id,
          classifyStatus(response.status),
          `HTTP ${response.status}: ${detail}`,
          response.status,
        )
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
        error?: { message?: string }
      }

      // OpenRouter kadang membalas 200 dengan galat di dalam badan — misalnya saat
      // model yang diminta sedang tidak tersedia. Tanpa pemeriksaan ini, agen
      // menerima teks kosong dan mengira panggilannya berhasil.
      if (payload.error) {
        throw new LlmError(config.id, 'server', payload.error.message ?? 'galat tanpa pesan')
      }

      const text = payload.choices?.[0]?.message?.content?.trim()
      if (!text) {
        throw new LlmError(config.id, 'server', 'Balasan tidak berisi teks')
      }

      return {
        text,
        providerId: config.id,
        model: config.model,
        keyIndex,
        latencyMs: Date.now() - startedAt,
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      }
    },
  }
}

export const groqAdapter = createOpenAiCompatibleAdapter({
  id: 'groq',
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  envPrefix: 'GROQ_API_KEY',
})

export const openRouterAdapter = createOpenAiCompatibleAdapter({
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free',
  envPrefix: 'OPENROUTER_API_KEY',
  extraHeaders: {
    'http-referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'x-title': 'investasi',
  },
})

export const deepSeekAdapter = createOpenAiCompatibleAdapter({
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  envPrefix: 'DEEPSEEK_API_KEY',
})
