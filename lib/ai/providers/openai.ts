import OpenAI from 'openai'
import { classifyStatus, LlmError, type LlmAdapter } from '../types'

/** Native Responses API; credentials stay on the server and responses are not stored. */
export const openAiAdapter: LlmAdapter = {
  id: 'openai',
  name: 'OpenAI GPT',
  model: process.env.OPENAI_MODEL || 'gpt-6-luna',
  envPrefix: 'OPENAI_API_KEY',
  async complete(request, apiKey, keyIndex) {
    const started = Date.now()
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: request.timeoutMs ?? 30_000 })
    try {
      const response = await client.responses.create({
        model: this.model,
        input: request.messages,
        max_output_tokens: request.maxOutputTokens ?? 1024,
        store: false,
        ...(request.json ? { text: { format: { type: 'json_object' as const } } } : {}),
      })
      if (response.status !== 'completed' || !response.output_text?.trim()) {
        throw new LlmError(this.id, 'server', 'Respons model tidak lengkap atau kosong')
      }
      return {
        text: response.output_text.trim(), providerId: this.id, model: response.model,
        keyIndex, latencyMs: Date.now() - started,
        inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens,
      }
    } catch (error) {
      if (error instanceof LlmError) throw error
      const status = error instanceof OpenAI.APIError ? error.status : undefined
      throw new LlmError(this.id, status ? classifyStatus(status) : 'network',
        status ? `OpenAI HTTP ${status}` : 'OpenAI tidak dapat dihubungi', status)
    }
  },
}
