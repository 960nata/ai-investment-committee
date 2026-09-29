/**
 * Definisi tipe lapisan LLM
 *
 * Bentuknya sengaja dibuat kembar dengan `lib/adapters/types.ts`: satu antarmuka
 * seragam, banyak penyedia di belakangnya. Alasannya sama persis seperti pada
 * sumber harga — saat satu penyedia mati atau kena limit, yang berubah cuma
 * urutan di registry, bukan kode agen.
 *
 * Perbedaannya satu, dan penting: penyedia harga gagal secara jujur (HTTP error),
 * sedangkan penyedia LLM gratis gagal dengan dua cara berbeda yang harus
 * dibedakan — kunci mati (401/403, permanen) dan kuota habis (429, sementara).
 * Memperlakukan keduanya sama akan membuang kunci sehat hanya karena ia sibuk.
 */

export type LlmRole = 'system' | 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmRequest {
  messages: LlmMessage[]
  /** Dibatasi agar satu giliran agen tidak menghabiskan kuota harian. */
  maxOutputTokens?: number
  temperature?: number
  /** Minta penyedia mengembalikan JSON saja, bila ia mendukungnya. */
  json?: boolean
  /**
   * 'premium' mencoba model berbayar terkuat (PREMIUM_LLM_*) lebih dulu, lalu
   * turun ke rantai biasa bila gagal atau belum dikonfigurasi. Pengguna
   * Premium tidak boleh mendapat jawaban kosong hanya karena satu kunci mati.
   */
  tier?: 'standard' | 'premium'
  /**
   * Penyedia yang didahulukan, urut. Penyedia yang tidak disebut tetap jadi
   * cadangan di urutan registry, jadi preferensi tidak pernah membuat
   * permintaan gagal — ia hanya menentukan siapa yang ditanya lebih dulu.
   */
  prefer?: string[]
}

export interface LlmResponse {
  text: string
  providerId: string
  model: string
  /** Indeks kunci yang dipakai di dalam kolam. Untuk jejak audit, bukan kunci itu sendiri. */
  keyIndex: number
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
}

/**
 * Kategori kegagalan. Registry memakai ini untuk memutuskan nasib kunci:
 * `rate_limited` mendinginkan satu kunci, `auth` mematikannya selamanya,
 * `server`/`network` menghukum penyedia tapi tidak menyalahkan kuncinya.
 */
export type LlmFailureKind = 'rate_limited' | 'auth' | 'server' | 'network' | 'bad_request'

export class LlmError extends Error {
  readonly kind: LlmFailureKind
  readonly status?: number
  readonly providerId: string

  constructor(providerId: string, kind: LlmFailureKind, message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.providerId = providerId
    this.kind = kind
    this.status = status
  }
}

/**
 * Terjemahkan status HTTP menjadi kategori kegagalan.
 *
 * 429 dan 5xx layak dicoba lagi di kunci atau penyedia lain. 401/403 tidak:
 * mengulangnya dengan kunci yang sama hanya menghabiskan waktu. 400 berarti
 * permintaan kita yang salah — mengganti kunci tidak akan memperbaikinya, jadi
 * ia tidak boleh memicu failover sama sekali.
 */
export function classifyStatus(status: number): LlmFailureKind {
  if (status === 429) return 'rate_limited'
  // 402: saldo kunci berbayar habis. Sama seperti kunci mati — kunci itu tidak
  // akan menjawab sampai diisi ulang, penyedia lain masih bisa.
  if (status === 401 || status === 402 || status === 403) return 'auth'
  // 404 dan 410: model atau endpoint penyedia ini sudah tidak ada. Itu masalah
  // penyedianya, bukan permintaan kita — penyedia lain masih bisa menjawab.
  if (status === 404 || status === 410 || status >= 500) return 'server'
  return 'bad_request'
}

export interface LlmAdapter {
  /** Pengenal unik, mis. 'gemini', 'groq', 'openrouter'. */
  id: string
  name: string
  /** Model yang dipakai penyedia ini. */
  model: string
  /** Nama variabel env dasar; varian bernomor ikut dipungut oleh keyring. */
  envPrefix: string
  /**
   * Kirim satu permintaan memakai kunci yang sudah dipilih keyring.
   * Melempar `LlmError` supaya registry bisa membedakan jenis kegagalan.
   */
  complete(request: LlmRequest, apiKey: string, keyIndex: number): Promise<LlmResponse>
}
