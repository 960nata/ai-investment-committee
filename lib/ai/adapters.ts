/**
 * Daftar adaptor LLM, urut prioritas.
 *
 * Dipisah dari registry supaya telemetri bisa membaca daftar yang sama tanpa
 * impor melingkar (registry sendiri mengimpor telemetri). Urutannya bukan
 * selera: yang di atas kuotanya paling besar dan latensinya paling rendah,
 * yang di bawah jaring pengaman berbayar.
 */

import { openAiAdapter } from './providers/openai'
import { cloudflareAdapter } from './providers/cloudflare'
import { geminiAdapter } from './providers/gemini'
import {
  agnesAdapter,
  cerebrasAdapter,
  cohereAdapter,
  deepSeekAdapter,
  groqAdapter,
  llm7Adapter,
  mistralAdapter,
  nvidiaAdapter,
  ollamaAdapter,
  openRouterAdapter,
  premiumAdapter,
  zaiAdapter,
} from './providers/openai-compatible'
import type { LlmAdapter } from './types'

export const LLM_ADAPTERS: LlmAdapter[] = [
  cerebrasAdapter, // latensi ultra-cepat (~100ms) Wafer-Scale Engine untuk agen & komite
  cloudflareAdapter,
  openAiAdapter,
  groqAdapter, // latensi terendah, sangat cepat (~300ms) untuk terjemahan & komite
  geminiAdapter, // kolam kunci cadangan terbesar
  openRouterAdapter, // model gratis, kuota harian
  deepSeekAdapter,
  mistralAdapter,
  llm7Adapter, // DeepSeek V4 Flash gratis, ±1 detik
  agnesAdapter,
  ollamaAdapter, // gpt-oss 120b, kuota gratis per jam/minggu
  cohereAdapter, // kunci trial dibatasi ±1.000 panggilan/bulan, jadi cadangan
  nvidiaAdapter,
  zaiAdapter, // GLM gratis, konkurensi kecil — cadangan terakhir
]

/**
 * Model berbayar untuk permintaan bertingkat 'premium'. Dipisah dari rantai di
 * atas supaya permintaan biasa tidak pernah membelanjakan kunci berbayar.
 */
export const PREMIUM_LLM_ADAPTERS: LlmAdapter[] = [premiumAdapter]

/** Seluruh adaptor, untuk telemetri dan dashboard admin. */
export const ALL_LLM_ADAPTERS: LlmAdapter[] = [...LLM_ADAPTERS, ...PREMIUM_LLM_ADAPTERS]
