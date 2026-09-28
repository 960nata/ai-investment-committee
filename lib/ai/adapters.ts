/**
 * Daftar adaptor LLM, urut prioritas.
 *
 * Dipisah dari registry supaya telemetri bisa membaca daftar yang sama tanpa
 * impor melingkar (registry sendiri mengimpor telemetri). Urutannya bukan
 * selera: yang di atas kuotanya paling besar dan latensinya paling rendah,
 * yang di bawah jaring pengaman berbayar.
 */

import { geminiAdapter } from './providers/gemini'
import {
  deepSeekAdapter,
  groqAdapter,
  mistralAdapter,
  nvidiaAdapter,
  openRouterAdapter,
  premiumAdapter,
} from './providers/openai-compatible'
import type { LlmAdapter } from './types'

export const LLM_ADAPTERS: LlmAdapter[] = [
  groqAdapter, // latensi terendah, sangat cepat (~300ms) untuk terjemahan & komite
  geminiAdapter, // kolam kunci cadangan terbesar
  openRouterAdapter, // model gratis, kuota harian
  deepSeekAdapter,
  mistralAdapter,
  nvidiaAdapter,
]

/**
 * Model berbayar untuk permintaan bertingkat 'premium'. Dipisah dari rantai di
 * atas supaya permintaan biasa tidak pernah membelanjakan kunci berbayar.
 */
export const PREMIUM_LLM_ADAPTERS: LlmAdapter[] = [premiumAdapter]

/** Seluruh adaptor, untuk telemetri dan dashboard admin. */
export const ALL_LLM_ADAPTERS: LlmAdapter[] = [...LLM_ADAPTERS, ...PREMIUM_LLM_ADAPTERS]
