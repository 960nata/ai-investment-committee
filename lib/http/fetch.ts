/**
 * Pemanggilan HTTP keluar dengan batas waktu.
 *
 * `fetch` bawaan tidak punya batas waktu. Kalau lawan bicaranya tidak pernah
 * menjawab, dan itu sering terjadi pada bursa yang diblokir jaringan atau
 * penyedia model yang sedang kewalahan, panggilannya menggantung selamanya.
 *
 * Akibatnya berbeda-beda dan semuanya buruk: di mesin sendiri skrip tampak
 * berputar tanpa ujung tanpa pesan apa pun, di Vercel satu panggilan menggantung
 * menghabiskan seluruh jatah durasi function sampai dihentikan paksa, dan di
 * antrian job batch yang sama diulang terus karena tidak pernah selesai.
 *
 * Aturan di proyek ini: tidak ada satu pun `fetch` telanjang. Semuanya lewat
 * sini, dan semuanya punya batas waktu beserta pesan yang menyebutkan siapa yang
 * tidak menjawab.
 */

/** Sumber data pasar biasanya menjawab di bawah satu detik. */
export const DATA_TIMEOUT_MS = 12_000

/** Model bahasa jauh lebih lambat, terutama saat menghasilkan teks panjang. */
export const MODEL_TIMEOUT_MS = 60_000

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} tidak menjawab dalam ${Math.round(timeoutMs / 1000)} detik`)
    this.name = 'TimeoutError'
  }
}

export interface TimedFetchOptions extends RequestInit {
  /** Nama yang muncul di pesan galat, misalnya "Binance". */
  label: string
  timeoutMs?: number
}

export async function fetchWithTimeout(
  url: string,
  { label, timeoutMs = DATA_TIMEOUT_MS, signal, ...init }: TimedFetchOptions,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)

  // Sinyal pemanggil tetap dihormati. Job yang dibatalkan harus ikut membatalkan
  // panggilan keluarnya, bukan menunggu batas waktunya sendiri habis.
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    return await fetch(url, { ...init, signal: combined })
  } catch (err) {
    // Batas waktu dan pembatalan biasa sama-sama muncul sebagai AbortError, jadi
    // yang membedakan keduanya adalah sinyal mana yang benar-benar menyala.
    if (timeout.aborted) throw new TimeoutError(label, timeoutMs)
    throw err
  }
}
