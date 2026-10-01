import './load-env'
import { appendFileSync } from 'node:fs'

/** Explicit operator smoke test. Prints metadata only, never credentials or provider error bodies. */
async function main() {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50', {
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) {
      const data = await response.json() as { result?: { id: string }[] }
      if (data.result?.length === 1 && /^[a-f0-9]{32}$/i.test(data.result[0].id)) {
        process.env.CLOUDFLARE_ACCOUNT_ID = data.result[0].id
        if (process.argv.includes('--save-account')) {
          appendFileSync('.env.local', `\n# Workers AI account discovered by check-ai-integration\nCLOUDFLARE_ACCOUNT_ID=${data.result[0].id}\n`)
        }
        console.log('Cloudflare: satu account ditemukan.')
      } else console.log('Cloudflare: Account ID harus dipilih secara eksplisit.')
    } else console.log(`Cloudflare account discovery: HTTP ${response.status}; isi CLOUDFLARE_ACCOUNT_ID secara manual.`)
  }
  const { ALL_LLM_ADAPTERS } = await import('../lib/ai/adapters')
  const { collectKeys } = await import('../lib/ai/keyring')
  const { recordLlmCall } = await import('../lib/ai/telemetry')
  let failed = false
  for (const id of ['cloudflare', 'openai']) {
    const adapter = ALL_LLM_ADAPTERS.find((a) => a.id === id)!
    const key = collectKeys(adapter.envPrefix)[0]
    const issue = adapter.configurationIssue?.()
    if (!key || issue) { console.log(`${id}: ${issue ?? 'Kunci belum dikonfigurasi'}`); failed = true; continue }
    const started = Date.now()
    try {
      const response = await adapter.complete({ messages: [{ role: 'user', content: 'Reply with exactly OK.' }], maxOutputTokens: 128, timeoutMs: 30_000 }, key.value, key.index)
      await recordLlmCall({ providerId: id, model: response.model, keyIndex: key.index, keyFingerprint: key.fingerprint, success: true, status: 200, feature: 'operator-smoke', requestId: crypto.randomUUID(), attempt: 1, inputTokens: response.inputTokens ?? 0, outputTokens: response.outputTokens ?? 0, latencyMs: response.latencyMs })
      console.log(`${id}: sukses, model=${response.model}, latency=${response.latencyMs}ms, tokens=${response.inputTokens ?? 0}/${response.outputTokens ?? 0}`)
    } catch (error) {
      const { LlmError } = await import('../lib/ai/types')
      const status = error instanceof LlmError ? error.status ?? 500 : 500
      const kind = error instanceof LlmError ? error.kind : 'unknown'
      await recordLlmCall({ providerId: id, model: adapter.model, keyIndex: key.index, keyFingerprint: key.fingerprint, success: false, status, errorKind: kind, feature: 'operator-smoke', requestId: crypto.randomUUID(), attempt: 1, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started })
      console.log(`${id}: gagal, kind=${kind}, status=${status}`)
      failed = true
    }
  }
  process.exitCode = failed ? 1 : 0
}
main().catch(() => { console.error('Pemeriksaan gagal sebelum selesai (jaringan/konfigurasi).'); process.exitCode = 1 })
