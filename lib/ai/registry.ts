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

import { geminiAdapter } from './providers/gemini'
import { deepSeekAdapter, groqAdapter, openRouterAdapter } from './providers/openai-compatible'
import { collectKeys, nextKey, penalise, poolStatus, type PooledKey } from './keyring'
import { LlmError, type LlmAdapter, type LlmRequest, type LlmResponse } from './types'

/** Berapa kunci berbeda dicoba di satu penyedia sebelum pindah penyedia. */
const MAX_KEYS_PER_PROVIDER = 4

interface ProviderEntry {
  adapter: LlmAdapter
  pool: PooledKey[]
}

/**
 * Urutan prioritas. Penyedia tanpa satu pun kunci di env langsung dilewati,
 * jadi menambah penyedia baru cukup dengan mengisi variabel env-nya.
 */
const ADAPTERS: LlmAdapter[] = [geminiAdapter, groqAdapter, openRouterAdapter, deepSeekAdapter]

let entries: ProviderEntry[] | null = null

function getEntries(): ProviderEntry[] {
  if (entries) return entries

  entries = ADAPTERS.map((adapter) => ({
    adapter,
    pool: collectKeys(adapter.envPrefix),
  })).filter((entry) => {
    if (entry.pool.length === 0) {
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

/**
 * Jalankan satu permintaan, turun ke kunci lalu penyedia berikutnya saat gagal.
 *
 * `bad_request` sengaja tidak memicu failover: kalau permintaannya sendiri yang
 * cacat, mencobanya di semua penyedia hanya membakar kuota untuk mendapat galat
 * yang sama empat kali.
 */
export async function complete(request: LlmRequest): Promise<LlmResponse> {
  const attempts: AttemptLog[] = []

  for (const entry of getEntries()) {
    const { adapter, pool } = entry
    const tries = Math.min(MAX_KEYS_PER_PROVIDER, pool.length)

    for (let attempt = 0; attempt < tries; attempt++) {
      const key = await nextKey(adapter.id, pool)

      if (!key) {
        attempts.push({
          providerId: adapter.id,
          keyIndex: -1,
          kind: 'exhausted',
          message: `Semua ${pool.length} kunci sedang beristirahat`,
        })
        break
      }

      try {
        const response = await adapter.complete(request, key.value, key.index)
        console.log(
          `[LLM] ${adapter.id} kunci #${key.index} berhasil (${response.latencyMs}ms, ` +
            `${response.outputTokens ?? '?'} token keluar)`,
        )
        return response
      } catch (err) {
        const llmError =
          err instanceof LlmError
            ? err
            : new LlmError(adapter.id, 'server', err instanceof Error ? err.message : String(err))

        attempts.push({
          providerId: adapter.id,
          keyIndex: key.index,
          kind: llmError.kind,
          message: llmError.message.slice(0, 200),
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
          // Kesalahan kita sendiri. Berhenti, jangan sebar ke penyedia lain.
          throw llmError
        }

        // server / network — kuncinya tidak bersalah, jadi tidak dihukum;
        // coba kunci berikutnya sekali, lalu turun ke penyedia lain.
        continue
      }
    }
  }

  throw new AllProvidersFailedError(attempts)
}

/** Ringkasan untuk halaman diagnostik: penyedia apa saja yang benar-benar siap. */
export async function llmStatus() {
  const configured = getEntries()

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
