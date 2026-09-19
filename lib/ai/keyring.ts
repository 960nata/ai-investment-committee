/**
 * Kolam kunci API
 *
 * Penyedia gratis membatasi kuota per kunci, bukan per akun, jadi sepuluh kunci
 * memberi sepuluh kali kuota. Yang menentukan apakah itu berguna adalah caranya
 * dipilih: memakai kunci pertama sampai jebol lalu pindah ke kedua akan membuat
 * kunci pertama selalu panas dan sisanya menganggur. File ini memutar kunci
 * secara bergilir dan mendinginkan yang kena 429.
 *
 * Kunci tidak pernah keluar dari modul ini dalam bentuk utuh — yang dicatat,
 * disimpan di Redis, dan muncul di log hanyalah indeks dan sidik pendeknya.
 * Kunci yang bocor lewat log sama saja dengan kunci yang dipublikasikan.
 */

import { createHash } from 'node:crypto'
import { cache } from '@/lib/cache/redis'

/** 429 biasanya kuota per menit; satu menit cukup untuk pulih. */
const RATE_LIMIT_COOLDOWN_SECONDS = 60

/** Kuota harian Gemini free tier baru pulih esok hari, bukan semenit. */
const DAILY_QUOTA_COOLDOWN_SECONDS = 60 * 60 * 6

/** Kunci yang ditolak autentikasinya tidak akan sembuh sendiri. */
const AUTH_COOLDOWN_SECONDS = 60 * 60 * 24

export interface PooledKey {
  /** Nilai kunci. Jangan pernah dicatat ke log atau disimpan. */
  value: string
  /** Posisi di dalam kolam, 0-based. Inilah yang aman muncul di jejak audit. */
  index: number
  /** Delapan hex pertama dari SHA-256. Cukup untuk membedakan kunci, tidak cukup untuk memakainya. */
  fingerprint: string
  /** Nama variabel env asalnya, mis. GEMINI_API_KEY_7. */
  envName: string
}

/**
 * Pungut semua kunci satu penyedia dari env.
 *
 * Konvensi penamaannya `PREFIX` lalu `PREFIX_2`, `PREFIX_3`, dan seterusnya.
 * Nomor yang bolong dilewati tanpa menghentikan pemungutan: satu kunci yang
 * dihapus di tengah daftar tidak boleh membuat kunci sesudahnya tak terlihat.
 */
export function collectKeys(envPrefix: string): PooledKey[] {
  const seen = new Set<string>()
  const keys: PooledKey[] = []

  const add = (envName: string, raw: string | undefined) => {
    const value = raw?.trim()
    if (!value) return
    // Placeholder di .env.example tidak boleh ikut terpungut sebagai kunci asli.
    if (value.startsWith('<') || value.includes('ganti-dengan')) return
    if (seen.has(value)) return
    seen.add(value)
    keys.push({
      value,
      index: keys.length,
      fingerprint: fingerprint(value),
      envName,
    })
  }

  add(envPrefix, process.env[envPrefix])

  // Batas 100 bukan asumsi soal jumlah kunci, hanya penjaga agar pemindaian
  // selalu berhenti. Nomor yang tidak ada dilewati, bukan mengakhiri perulangan.
  for (let n = 2; n <= 100; n++) {
    const envName = `${envPrefix}_${n}`
    add(envName, process.env[envName])
  }

  return keys
}

export function fingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8)
}

function cooldownKey(providerId: string, fp: string): string {
  return `llm:cooldown:${providerId}:${fp}`
}

function cursorKey(providerId: string): string {
  return `llm:cursor:${providerId}`
}

/**
 * Cadangan saat Redis tidak dikonfigurasi. Memori proses tidak dibagi antar
 * invocation serverless, jadi ini hanya menolong di mesin lokal — di produksi
 * tanpa Redis, pendinginan kunci praktis tidak berlaku dan kunci yang kena limit
 * akan dicoba lagi lebih cepat dari seharusnya.
 */
const localCooldowns = new Map<string, number>()
let localCursor = new Map<string, number>()

async function isCoolingDown(providerId: string, fp: string): Promise<boolean> {
  const key = cooldownKey(providerId, fp)

  if (cache.isAvailable()) {
    return (await cache.get<number>(key)) !== null
  }

  const until = localCooldowns.get(key)
  if (until === undefined) return false
  if (until <= Date.now()) {
    localCooldowns.delete(key)
    return false
  }
  return true
}

export type CooldownReason = 'rate_limited' | 'daily_quota' | 'auth'

const COOLDOWN_SECONDS: Record<CooldownReason, number> = {
  rate_limited: RATE_LIMIT_COOLDOWN_SECONDS,
  daily_quota: DAILY_QUOTA_COOLDOWN_SECONDS,
  auth: AUTH_COOLDOWN_SECONDS,
}

/** Istirahatkan satu kunci. Lamanya tergantung kenapa ia gagal. */
export async function penalise(
  providerId: string,
  key: PooledKey,
  reason: CooldownReason,
): Promise<void> {
  const seconds = COOLDOWN_SECONDS[reason]
  const redisKey = cooldownKey(providerId, key.fingerprint)

  if (cache.isAvailable()) {
    await cache.set(redisKey, Date.now(), seconds)
  } else {
    localCooldowns.set(redisKey, Date.now() + seconds * 1000)
  }

  console.warn(
    `[Keyring] ${providerId} kunci #${key.index} (${key.fingerprint}) ` +
      `diistirahatkan ${seconds}s — ${reason}`,
  )
}

/**
 * Ambil kunci berikutnya yang tidak sedang beristirahat.
 *
 * Kursor disimpan di Redis, bukan di memori: tiap invocation serverless memulai
 * memori dari nol, dan kursor yang selalu kembali ke nol berarti kunci pertama
 * menanggung semua beban sementara sisanya tidak pernah tersentuh.
 */
export async function nextKey(
  providerId: string,
  pool: PooledKey[],
): Promise<PooledKey | null> {
  if (pool.length === 0) return null

  const start = await readCursor(providerId, pool.length)

  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(start + offset) % pool.length]
    if (await isCoolingDown(providerId, candidate.fingerprint)) continue

    await writeCursor(providerId, (start + offset + 1) % pool.length)
    return candidate
  }

  return null
}

async function readCursor(providerId: string, poolSize: number): Promise<number> {
  const key = cursorKey(providerId)

  if (cache.isAvailable()) {
    const stored = await cache.get<number>(key)
    return typeof stored === 'number' ? stored % poolSize : 0
  }

  return (localCursor.get(key) ?? 0) % poolSize
}

async function writeCursor(providerId: string, value: number): Promise<void> {
  const key = cursorKey(providerId)

  if (cache.isAvailable()) {
    // TTL sehari: kursor adalah petunjuk pemerataan, bukan data yang harus abadi.
    await cache.set(key, value, 60 * 60 * 24)
  } else {
    localCursor.set(key, value)
  }
}

/** Dipakai halaman diagnostik untuk melihat berapa kunci yang benar-benar siap. */
export async function poolStatus(
  providerId: string,
  pool: PooledKey[],
): Promise<{ total: number; available: number; cooling: string[] }> {
  const cooling: string[] = []

  for (const key of pool) {
    if (await isCoolingDown(providerId, key.fingerprint)) {
      cooling.push(`#${key.index} ${key.fingerprint}`)
    }
  }

  return { total: pool.length, available: pool.length - cooling.length, cooling }
}

/** Hanya untuk pengujian: bersihkan keadaan cadangan dalam memori. */
export function resetLocalState(): void {
  localCooldowns.clear()
  localCursor = new Map()
}
