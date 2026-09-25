/**
 * Daftar blokir, hukuman bertingkat, dan catatan insiden.
 *
 * `shield.ts` memutuskan sebuah permintaan jahat. Berkas ini yang mengingatnya
 * — supaya permintaan kedua dari penyerang yang sama tidak perlu diperiksa dari
 * awal, dan supaya pemindai yang mencoba lima ribu alamat tidak menghabiskan
 * lima ribu perintah Redis untuk ditolak lima ribu kali.
 *
 * Tiga lapis ingatan, dari yang paling murah:
 *
 *   1. Memori proses. Nol perintah. Fungsi serverless dipakai ulang untuk
 *      banyak permintaan berturut-turut, jadi instance yang sedang panas akan
 *      mengenali penyerang yang sama tanpa menyentuh jaringan sama sekali.
 *   2. Kunci blokir di Redis. Satu perintah, dan hanya diklaim sekali per
 *      periode blokir lewat `SET ... NX` — bukan ditulis ulang tiap serangan.
 *   3. Penghitung pelanggaran, umurnya tujuh hari. Inilah yang membuat
 *      pelanggar berulang mendapat blokir lebih panjang daripada pelanggar
 *      pertama kali.
 *
 * Soal alamat IP: proyek ini memilih tidak menyimpannya utuh (lihat alasannya
 * di `lib/analytics/geo.ts`). Pilihan itu tetap dipegang di sini. Kunci blokir
 * memakai sidik ber-garam — secara fungsi sama persis, karena sidik yang sama
 * selalu dihitung ulang dari permintaan yang sama — dan catatan insiden hanya
 * menyimpan alamat bertopeng, cukup untuk melihat satu rentang jaringan
 * menyerang berulang kali, tidak cukup untuk menunjuk satu orang.
 */

import crypto from 'crypto'
import { Redis } from '@upstash/redis'
import type { SignalCode } from './shield'

let client: Redis | null | undefined

/** Klien Redis bersama untuk seluruh lapisan HTTP. */
export function redisClient(): Redis | null {
  if (client === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    client = url && token ? new Redis({ url, token }) : null
  }
  return client
}

// ---------------------------------------------------------------------------
// Identitas
// ---------------------------------------------------------------------------

function shieldSalt(): string {
  return (
    process.env.VISITOR_HASH_SALT ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_SECRET_KEY ||
    'komite-shield-salt-please-change'
  )
}

/** Alamat pemanggil menurut tepi jaringan. */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Sidik pemanggil. Stabil antar permintaan, tidak bisa dikembalikan jadi IP. */
export function callerHash(ip: string): string {
  return crypto.createHmac('sha256', shieldSalt()).update(ip).digest('hex').slice(0, 24)
}

/**
 * Alamat bertopeng untuk layar admin.
 *
 * Oktet terakhir IPv4 dan separuh belakang IPv6 dibuang. Yang tersisa cukup
 * untuk mengenali satu penyedia atau satu rentang yang menyerang berulang kali
 * — pertanyaan yang benar-benar ditanyakan saat membaca log serangan — tanpa
 * menyimpan pengenal satu perangkat.
 */
export function maskIp(ip: string): string {
  if (ip === 'unknown') return 'tidak diketahui'
  if (ip.includes(':')) {
    const groups = ip.split(':').filter(Boolean)
    return `${groups.slice(0, 3).join(':')}::/48`
  }
  const octets = ip.split('.')
  if (octets.length !== 4) return 'tidak diketahui'
  return `${octets.slice(0, 3).join('.')}.0/24`
}

// ---------------------------------------------------------------------------
// Ingatan proses
// ---------------------------------------------------------------------------

/**
 * Sidik yang sedang diblokir, menurut instance ini.
 *
 * Dibatasi jumlahnya supaya serangan dengan banyak alamat tidak menumbuhkan
 * peta ini tanpa batas sampai memakan memori fungsi. Ketika penuh, isi terlama
 * dibuang — kehilangan satu catatan di sini tidak berbahaya, paling-paling satu
 * permintaan berikutnya membayar satu perintah Redis.
 */
const localBans = new Map<string, number>()
const LOCAL_BAN_CAPACITY = 1000

function rememberBan(hash: string, untilMs: number): void {
  if (localBans.size >= LOCAL_BAN_CAPACITY) {
    const oldest = localBans.keys().next()
    if (!oldest.done) localBans.delete(oldest.value)
  }
  localBans.set(hash, untilMs)
}

function locallyBanned(hash: string): boolean {
  const until = localBans.get(hash)
  if (until === undefined) return false
  if (until <= Date.now()) {
    localBans.delete(hash)
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Hukuman
// ---------------------------------------------------------------------------

/**
 * Tangga hukuman, dalam detik.
 *
 * Pelanggaran pertama dihukum satu jam. Cukup panjang untuk mematahkan
 * pemindaian yang sedang berjalan, cukup pendek untuk tidak menghukum berhari-hari
 * satu alamat NAT kantor yang kebetulan dipakai seseorang yang sedang bereksperimen
 * dengan perkakas. Pengulangnya yang dihukum lama, dan pengulangan adalah sinyal
 * yang jauh lebih jarang salah daripada pelanggaran tunggal.
 */
const PENALTY_LADDER = [
  60 * 60, // 1 jam
  60 * 60 * 6, // 6 jam
  60 * 60 * 24, // sehari
  60 * 60 * 24 * 7, // sepekan
]

const STRIKE_MEMORY_SECONDS = 60 * 60 * 24 * 7
const EVENT_LOG_KEY = 'shield:events'
const EVENT_LOG_LENGTH = 200
const EVENT_LOG_TTL = 60 * 60 * 24 * 14

function banKey(hash: string): string {
  return `shield:ban:${hash}`
}

function strikeKey(hash: string): string {
  return `shield:strike:${hash}`
}

function dailyKey(code: string): string {
  return `shield:count:${new Date().toISOString().slice(0, 10)}:${code}`
}

export interface SecurityEvent {
  /** Detik epoch. */
  at: number
  reason: SignalCode
  /** Alamat bertopeng, bukan alamat utuh. */
  from: string
  path: string
  method: string
  evidence: string | null
  /** Pelanggaran ke berapa dari sidik yang sama. */
  strike: number
  /** Lama blokir yang dijatuhkan, dalam detik. */
  banSeconds: number
}

/**
 * Catat pelanggaran dan jatuhkan blokirnya.
 *
 * Klaim blokirnya lewat `SET ... NX`: satu perintah yang sekaligus menjawab
 * "apakah sidik ini sudah diblokir" dan "kalau belum, blokir sekarang". Kalau
 * klaimnya kalah — artinya sidik ini sudah diblokir permintaan sebelumnya —
 * fungsi berhenti di situ. Tanpa itu, satu pemindai bisa menulis ribuan baris
 * log yang isinya sama persis, dan justru pencatat serangannyalah yang
 * menghabiskan kuota.
 *
 * Gagal diam bila Redis tidak ada. Blokirnya tetap berlaku di memori proses,
 * dan penolakannya tetap terjadi — yang hilang hanya ingatan lintas instance.
 */
export async function punish(
  request: Request,
  reason: SignalCode,
  evidence: string | null,
): Promise<void> {
  const ip = callerIp(request)
  const hash = callerHash(ip)

  if (locallyBanned(hash)) return

  const redis = redisClient()
  if (!redis) {
    rememberBan(hash, Date.now() + PENALTY_LADDER[0] * 1000)
    return
  }

  try {
    // Nilainya objek, bukan teks telanjang. Klien Upstash mencoba mengurai tiap
    // nilai yang dibacanya sebagai JSON, dan teks yang bukan JSON berada di
    // wilayah yang perilakunya pernah berubah antar versi. Objek tidak pernah
    // ambigu — dan isinya sekalian berguna saat menelusuri satu blokir.
    const claimed = await redis.set(
      banKey(hash),
      { reason, at: Math.floor(Date.now() / 1000) },
      { ex: PENALTY_LADDER[0], nx: true },
    )

    if (claimed === null) {
      // Sudah diblokir oleh permintaan sebelumnya. Cukup diingat di sini supaya
      // permintaan berikutnya dari instance ini tidak membayar perintah lagi.
      rememberBan(hash, Date.now() + PENALTY_LADDER[0] * 1000)
      return
    }

    const strikes = await redis.incr(strikeKey(hash))
    const seconds = PENALTY_LADDER[Math.min(strikes, PENALTY_LADDER.length) - 1]

    const event: SecurityEvent = {
      at: Math.floor(Date.now() / 1000),
      reason,
      from: maskIp(ip),
      path: new URL(request.url).pathname.slice(0, 120),
      method: request.method,
      evidence,
      strike: strikes,
      banSeconds: seconds,
    }

    const pipeline = redis.pipeline()
    pipeline.expire(strikeKey(hash), STRIKE_MEMORY_SECONDS)
    // Blokir pertama sudah dipasang satu jam oleh klaim di atas; hanya pelanggar
    // berulang yang perlu diperpanjang.
    if (seconds !== PENALTY_LADDER[0]) pipeline.expire(banKey(hash), seconds)
    pipeline.lpush(EVENT_LOG_KEY, JSON.stringify(event))
    pipeline.ltrim(EVENT_LOG_KEY, 0, EVENT_LOG_LENGTH - 1)
    pipeline.expire(EVENT_LOG_KEY, EVENT_LOG_TTL)
    pipeline.incr(dailyKey(reason))
    pipeline.expire(dailyKey(reason), 60 * 60 * 24 * 30)
    pipeline.incr(dailyKey('total'))
    pipeline.expire(dailyKey('total'), 60 * 60 * 24 * 30)
    await pipeline.exec()

    rememberBan(hash, Date.now() + seconds * 1000)

    console.warn(
      `[Shield] blokir ${seconds}s — ${reason} dari ${event.from} di ${event.method} ${event.path}` +
        ` (pelanggaran ke-${strikes})`,
    )
  } catch (err) {
    console.error('[Shield] gagal mencatat pelanggaran:', err)
    rememberBan(hash, Date.now() + PENALTY_LADDER[0] * 1000)
  }
}

/** Benar bila sidik ini sedang diblokir menurut ingatan proses. Nol perintah. */
export function bannedInMemory(request: Request): boolean {
  return locallyBanned(callerHash(callerIp(request)))
}

// ---------------------------------------------------------------------------
// Pembacaan untuk portal admin
// ---------------------------------------------------------------------------

/** Insiden terakhir, terbaru lebih dulu. */
export async function recentEvents(limit = 50): Promise<SecurityEvent[]> {
  const redis = redisClient()
  if (!redis) return []

  try {
    const rows = await redis.lrange<SecurityEvent | string>(EVENT_LOG_KEY, 0, limit - 1)
    return rows
      .map((row) => {
        // Upstash mengurai JSON sendiri kalau nilainya berbentuk JSON, jadi baris
        // yang sama bisa sampai ke sini sebagai objek atau sebagai teks.
        if (typeof row !== 'string') return row
        try {
          return JSON.parse(row) as SecurityEvent
        } catch {
          return null
        }
      })
      .filter((row): row is SecurityEvent => row !== null)
  } catch (err) {
    console.error('[Shield] gagal membaca catatan insiden:', err)
    return []
  }
}

export interface ShieldDay {
  /** Tanggal ISO. */
  date: string
  total: number
}

/** Jumlah blokir per hari untuk beberapa hari terakhir. */
export async function blockHistory(days = 14): Promise<ShieldDay[]> {
  const redis = redisClient()
  if (!redis) return []

  const dates: string[] = []
  for (let back = days - 1; back >= 0; back--) {
    dates.push(new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10))
  }

  try {
    const pipeline = redis.pipeline()
    for (const date of dates) pipeline.get(`shield:count:${date}:total`)
    const counts = (await pipeline.exec()) as (number | string | null)[]

    return dates.map((date, index) => ({
      date,
      total: Number(counts[index] ?? 0) || 0,
    }))
  } catch (err) {
    console.error('[Shield] gagal membaca riwayat blokir:', err)
    return []
  }
}

/** Benar bila lapisan ini punya tempat menyimpan keadaannya. */
export function shieldIsPersistent(): boolean {
  return redisClient() !== null
}

/** Hanya untuk pengujian: kosongkan ingatan proses. */
export function resetLocalBans(): void {
  localBans.clear()
}
