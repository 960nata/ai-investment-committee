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
