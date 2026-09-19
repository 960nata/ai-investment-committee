/**
 * Pembatas laju permintaan.
 *
 * Seluruh API publik proyek ini membaca basis data dan cache berbayar-kuota.
 * Tanpa pembatas, satu skrip sederhana bisa menghabiskan sepuluh ribu perintah
 * Redis harian dalam hitungan menit, atau membuat tagihan basis data melonjak,
 * tanpa perlu menemukan celah apa pun. Penolakan layanan lewat kuota adalah
 * kerentanan yang paling murah dieksploitasi dan paling sering dilupakan.
 *
 * Bentuknya jendela tetap dengan INCR dan EXPIRE. Dibangun di atas klien Redis
 * yang memang sudah dipakai proyek ini, bukan paket baru: satu dependensi lebih
 * sedikit berarti satu permukaan rantai pasok lebih sedikit.
 */

import { Redis } from '@upstash/redis'

let client: Redis | null | undefined

function getRedis(): Redis | null {
  if (client === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    client = url && token ? new Redis({ url, token }) : null
  }
  return client
}

export interface RateLimitRule {
  /** Jumlah permintaan yang diizinkan dalam satu jendela. */
  limit: number
  /** Panjang jendela dalam detik. */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
  /** Benar bila pembatas tidak aktif karena Redis tidak terkonfigurasi. */
  bypassed: boolean
}

/**
 * Identitas pemanggil.
 *
 * Di Vercel, `x-forwarded-for` diisi oleh infrastrukturnya sendiri dan tidak
 * bisa dipalsukan pemanggil. Di belakang proksi lain, header ini bisa dikarang,
 * jadi pembatas ini melindungi dari penyalahgunaan biasa, bukan dari penyerang
 * yang memang berniat memutarinya lewat banyak alamat.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return ip
}

/**
 * Hitung satu permintaan terhadap kuotanya.
 *
 * Gagal terbuka bila Redis tidak tersedia. Pilihan ini disengaja: pembatas laju
 * melindungi dari kelebihan beban, dan mematikan seluruh situs ketika cache-nya
 * mati justru menimbulkan gangguan yang lebih besar daripada yang dicegahnya.
 * Kejadiannya tetap dicatat supaya tidak lolos tanpa diketahui.
 */
export async function rateLimit(
  scope: string,
  identity: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const redis = getRedis()

  if (!redis) {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, bypassed: true }
  }

  // Jendela ikut masuk ke kunci, jadi kunci lama kedaluwarsa sendiri dan tidak
  // perlu dibersihkan.
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds)
  const key = `ratelimit:${scope}:${identity}:${window}`

  try {
    const count = await redis.incr(key)

    // EXPIRE hanya dipasang pada permintaan pertama di jendela itu. Memasangnya
    // setiap kali akan menggandakan pemakaian kuota Redis tanpa guna.
    if (count === 1) {
      await redis.expire(key, rule.windowSeconds)
    }

    const remaining = Math.max(0, rule.limit - count)
    const secondsIntoWindow = Math.floor(Date.now() / 1000) % rule.windowSeconds

    return {
      allowed: count <= rule.limit,
      remaining,
      retryAfterSeconds: rule.windowSeconds - secondsIntoWindow,
      bypassed: false,
    }
  } catch (err) {
    console.error('[RateLimit] Redis tidak terjangkau, permintaan diloloskan:', err)
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, bypassed: true }
  }
}

/**
 * Kuota per kelompok endpoint.
 *
 * Angkanya longgar untuk pemakaian manusia lewat dashboard dan ketat untuk
 * pemakaian mesin. Endpoint yang memicu pekerjaan nyata jauh lebih mahal
 * daripada endpoint yang hanya membaca, jadi kuotanya jauh lebih kecil.
 */
export const RULES = {
  /** Pembacaan biasa dari dashboard. */
  read: { limit: 120, windowSeconds: 60 },
  /** Endpoint operasional; hanya dipakai sesekali oleh satu orang. */
  ops: { limit: 20, windowSeconds: 60 },
  /** Endpoint yang memicu penarikan data dari sumber luar. */
  expensive: { limit: 5, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>
