/**
 * Registry LLM
 *
 * Kembaran `lib/adapters/registry.ts`, dengan satu lapis tambahan. Registry
 * harga menjatuhkan satu adaptor saat gagal; di sini tiap penyedia punya kolam
 * kunci, jadi kegagalan dicoba ulang dua tingkat: kunci lain dulu di penyedia
 * yang sama, baru penyedia berikutnya.
 *
 * Urutannya bukan selera. Yang di atas adalah yang kuotanya paling besar dan
 * latensinya paling rendah; yang di bawah adalah jaring pengaman berbayar.
 */

import { randomUUID } from 'node:crypto'
import { LLM_ADAPTERS, PREMIUM_LLM_ADAPTERS } from './adapters'
import { collectKeys, nextKey, penalise, poolStatus, type PooledKey } from './keyring'
import { recordLlmCall } from './telemetry'
import { LlmError, type LlmAdapter, type LlmRequest, type LlmResponse } from './types'

/** Berapa kunci berbeda dicoba di satu penyedia sebelum pindah penyedia. */
const MAX_KEYS_PER_PROVIDER = 4

interface ProviderEntry {
  adapter: LlmAdapter
  pool: PooledKey[]
}

/**
 * GITHUB_TOKEN sengaja TIDAK dipasang di sini meski GitHub Models menerima
 * format yang sama. Token itu bukan kunci LLM murni — ia fine-grained PAT yang
 * juga bisa membaca dan menulis repositori. Menaruhnya di env aplikasi web
 * berarti satu kebocoran env menyerahkan repo, bukan sekadar kuota model.
 * Kalau GitHub Models memang mau dipakai, buat token terpisah tanpa akses repo
 * dan daftarkan sebagai GITHUB_MODELS_TOKEN.
 */

let entries: ProviderEntry[] | null = null
let premiumEntries: ProviderEntry[] | null = null

/** Kunci berbayar yang terpasang. Diam saja bila kosong: Premium memang opsional. */
function getPremiumEntries(): ProviderEntry[] {
  if (premiumEntries) return premiumEntries
  premiumEntries = PREMIUM_LLM_ADAPTERS.map((adapter) => ({
    adapter,
    pool: collectKeys(adapter.envPrefix),
  })).filter((entry) => entry.pool.length > 0)
  return premiumEntries
}

function getEntries(): ProviderEntry[] {
  if (entries) return entries

  entries = LLM_ADAPTERS.map((adapter) => ({
    adapter,
    pool: collectKeys(adapter.envPrefix),
  })).filter((entry) => {
    if (entry.pool.length === 0 || entry.adapter.configurationIssue?.()) {
      console.warn(
        `[LLM] ${entry.adapter.id} dilewati — ${entry.adapter.envPrefix} belum diset.`,
      )
      return false
    }
    return true
  })

  return entries
}

/** Dipakai pengujian dan saat env berubah di mode pengembangan. */
export function resetRegistry(): void {
  entries = null
  premiumEntries = null
}

export interface AttemptLog {
  providerId: string
  keyIndex: number
  kind: string
  message: string
}

export class AllProvidersFailedError extends Error {
  readonly attempts: AttemptLog[]

  constructor(attempts: AttemptLog[]) {
    super(
      attempts.length === 0
        ? 'Tidak ada penyedia LLM yang dikonfigurasi. Isi minimal satu GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY.'
        : `Semua penyedia LLM gagal setelah ${attempts.length} percobaan: ` +
            attempts.map((a) => `${a.providerId}#${a.keyIndex} ${a.kind}`).join(', '),
    )
    this.name = 'AllProvidersFailedError'
    this.attempts = attempts
  }
}

/** Susun ulang rantai: yang diminta lebih dulu, sisanya di urutan asal. */
function preferred(chain: ProviderEntry[], prefer: string[] | undefined): ProviderEntry[] {
  if (!prefer?.length) return chain
  const first = prefer
    .map((id) => chain.find((e) => e.adapter.id === id))
    .filter((e): e is ProviderEntry => e !== undefined)
  return [...new Set([...first, ...chain])]
}

/**
 * Jalankan satu permintaan, turun ke kunci lalu penyedia berikutnya saat gagal.
 *
 * `bad_request` sengaja tidak memicu failover: kalau permintaannya sendiri yang
 * cacat, mencobanya di semua penyedia hanya membakar kuota untuk mendapat galat
 * yang sama empat kali.
 */
export async function complete(request: LlmRequest): Promise<LlmResponse> {
  const requestId = randomUUID()
  const deadline = Date.now() + (request.timeoutMs ?? 60_000)
  let attemptNumber = 0
  const attempts: AttemptLog[] = []
  const base = preferred(getEntries(), request.prefer)
  const chain = request.tier === 'premium' ? [...getPremiumEntries(), ...base] : base

  for (const entry of chain) {
    const { adapter, pool } = entry
    const tries = Math.min(MAX_KEYS_PER_PROVIDER, pool.length)
    const tried = new Set<string>()

    for (let attempt = 0; attempt < tries; attempt++) {
      const key = await nextKey(adapter.id, pool.filter((candidate) => !tried.has(candidate.fingerprint)))

      if (!key) {
        attempts.push({
          providerId: adapter.id,
          keyIndex: -1,
          kind: 'exhausted',
          message: `Semua ${pool.length} kunci sedang beristirahat`,
        })
        break
      }

      tried.add(key.fingerprint)
      if (Date.now() >= deadline) break
      const startedAt = Date.now()
      attemptNumber++
      try {
        const response = await adapter.complete({ ...request, timeoutMs: Math.min(30_000, deadline - Date.now()) }, key.value, key.index)
        console.log(
          `[LLM] ${adapter.id} kunci #${key.index} berhasil (${response.latencyMs}ms, ` +
            `${response.outputTokens ?? '?'} token keluar)`,
        )
        await recordLlmCall({
          requestId,
          feature: request.feature ?? 'unspecified',
          attempt: attemptNumber,
          providerId: adapter.id,
          model: response.model,
          keyIndex: key.index,
          keyFingerprint: key.fingerprint,
          success: true,
          status: 200,
          inputTokens: response.inputTokens ?? 0,
          outputTokens: response.outputTokens ?? 0,
          latencyMs: response.latencyMs,
        })
        return response
      } catch (err) {
        const llmError =
          err instanceof LlmError
            ? err
            : new LlmError(adapter.id, 'server', err instanceof Error ? err.message : String(err))

        await recordLlmCall({
          requestId,
          feature: request.feature ?? 'unspecified',
          attempt: attemptNumber,
          providerId: adapter.id,
          model: adapter.model,
          keyIndex: key.index,
          keyFingerprint: key.fingerprint,
          success: false,
          status: llmError.status ?? (llmError.kind === 'rate_limited' ? 429 : 500),
          errorKind: llmError.kind,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startedAt,
        })

        attempts.push({
          providerId: adapter.id,
          keyIndex: key.index,
          kind: llmError.kind,
          message: `${llmError.kind}${llmError.status ? ` HTTP ${llmError.status}` : ''}`,
        })

        if (llmError.kind === 'rate_limited') {
          // Penanda [daily] dipasang adaptor Gemini saat yang habis kuota harian.
          await penalise(
            adapter.id,
            key,
            llmError.message.startsWith('[daily]') ? 'daily_quota' : 'rate_limited',
          )
          continue
        }

        if (llmError.kind === 'auth') {
          await penalise(adapter.id, key, 'auth')
          continue
        }

        if (llmError.kind === 'bad_request') {
          // Format atau parameter ditolak oleh penyedia ini (mis. parameter spesifik model atau batasan penyedia).
          // Beralih ke penyedia berikutnya dalam rantai alih-alih langsung membatalkan rapat.
          console.warn(
            `[LLM] ${adapter.id} menolak permintaan (HTTP ${llmError.status ?? 400}: ${llmError.message}). Beralih ke penyedia berikutnya.`,
          )
          break
        }

        // Server/network failures affect the provider; try the next provider immediately.
        break
      }
    }
  }

  throw new AllProvidersFailedError(attempts)
}

/** Ringkasan untuk halaman diagnostik: penyedia apa saja yang benar-benar siap. */
export async function llmStatus() {
  const configured = [...getEntries(), ...getPremiumEntries()]

  return Promise.all(
    configured.map(async (entry) => ({
      id: entry.adapter.id,
      name: entry.adapter.name,
      model: entry.adapter.model,
      ...(await poolStatus(entry.adapter.id, entry.pool)),
    })),
  )
}

export function isLlmConfigured(): boolean {
  return getEntries().length > 0
}
