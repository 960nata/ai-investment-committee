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
 *
 * Pembatas ini satu dari tiga lapis, dan sengaja bukan yang pertama:
 *
 *   1. `shield.ts` menyaring pola serangan tanpa satu pun perintah berbayar.
 *   2. `blocklist.ts` mengingat penyerang supaya tidak diperiksa berulang kali.
 *   3. Berkas ini mengukur laju pemanggil yang lolos keduanya.
 *   4. `budget.ts` membatasi total belanja model seluruh pemanggil bersama-sama.
 *
 * Urutan itu penting. Lapisan yang mahal tidak boleh dipakai untuk menolak
 * sesuatu yang bisa ditolak lapisan yang gratis.
 */

import { callerHash, callerIp, redisClient } from './blocklist'

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
 * yang memang berniat memutarinya lewat banyak alamat. Yang menutup celah itu
 * adalah pagu belanja di `budget.ts`, yang tidak peduli dari alamat mana
 * permintaannya datang.
 */
export function callerKey(request: Request): string {
  return callerIp(request)
}

function windowKey(scope: string, identity: string, rule: RateLimitRule): string {
  // Jendela ikut masuk ke kunci, jadi kunci lama kedaluwarsa sendiri dan tidak
  // perlu dibersihkan.
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds)
  return `ratelimit:${scope}:${identity}:${window}`
}

function secondsIntoWindow(rule: RateLimitRule): number {
  return Math.floor(Date.now() / 1000) % rule.windowSeconds
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
  const redis = redisClient()

  if (!redis) {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, bypassed: true }
  }

  const key = windowKey(scope, identity, rule)

  try {
    const count = await redis.incr(key)

    // EXPIRE hanya dipasang pada permintaan pertama di jendela itu. Memasangnya
    // setiap kali akan menggandakan pemakaian kuota Redis tanpa guna.
    if (count === 1) {
      await redis.expire(key, rule.windowSeconds)
    }

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: rule.windowSeconds - secondsIntoWindow(rule),
      bypassed: false,
    }
  } catch (err) {
    console.error('[RateLimit] Redis tidak terjangkau, permintaan diloloskan:', err)
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, bypassed: true }
  }
}

export interface GateResult extends RateLimitResult {
  /** Benar bila pemanggil sedang menjalani blokir dari pelanggaran sebelumnya. */
  banned: boolean
}

/**
 * Periksa blokir dan kuota sekaligus.
 *
 * Dua pertanyaan, satu perjalanan jaringan. Upstash berbicara lewat REST, jadi
 * tiap perintah terpisah adalah satu permintaan HTTP penuh dengan latensinya
 * sendiri — dan lapisan ini berjalan di depan tiap panggilan API. Menggabungkan
 * keduanya lewat pipeline memangkas separuh latensi yang ditambahkan penjaga
 * ini ke tiap permintaan yang sah.
 *
 * Pemanggil yang sedang diblokir tetap ikut terhitung di pembatas laju. Itu
 * disengaja: yang masih mengetuk pintu setelah diblokir memang layak dihitung
 * sebagai lalu lintas.
 */
export async function gate(
  scope: string,
  request: Request,
  rule: RateLimitRule,
): Promise<GateResult> {
  const redis = redisClient()

  if (!redis) {
    return {
      banned: false,
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: 0,
      bypassed: true,
    }
  }

  const hash = callerHash(callerIp(request))
  const key = windowKey(scope, callerKey(request), rule)

  try {
    const [ban, count] = (await redis
      .pipeline()
      .get(`shield:ban:${hash}`)
      .incr(key)
      .exec()) as [unknown, number]

    if (count === 1) {
      await redis.expire(key, rule.windowSeconds)
    }

    return {
      // Apa pun isinya, adanya kunci itu sendiri sudah berarti sedang diblokir.
      banned: ban !== null && ban !== undefined,
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: rule.windowSeconds - secondsIntoWindow(rule),
      bypassed: false,
    }
  } catch (err) {
    console.error('[RateLimit] Redis tidak terjangkau, permintaan diloloskan:', err)
    return {
      banned: false,
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: 0,
      bypassed: true,
    }
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
  /**
   * Ketukan telemetri dari peramban.
   *
   * Satu kunjungan halaman menghasilkan satu ketukan, jadi tiga puluh per menit
   * sudah jauh di atas pemakaian manusia mana pun. Kuotanya ada bukan karena
   * endpointnya mahal, melainkan karena tiap ketukan menulis satu baris ke
   * Postgres — dan tabel yang bisa ditumbuhkan orang asing sesuka hati adalah
   * tagihan yang menunggu waktu.
   */
  beacon: { limit: 30, windowSeconds: 60 },
  /**
   * Masuk, daftar, dan segala yang menerima kata sandi.
   *
   * Sepuluh percobaan per lima menit. Cukup untuk orang yang lupa kata sandinya
   * dan mencoba beberapa kemungkinan, jauh terlalu sempit untuk menebak satu per
   * satu. Angka ini sengaja jauh lebih ketat daripada `ops`: endpoint lain paling
   * banter boros, endpoint inilah satu-satunya yang kalau ditembus, ditembus
   * sungguhan.
   */
  auth: { limit: 10, windowSeconds: 300 },
  /** Endpoint yang memicu penarikan data dari sumber luar. */
  expensive: { limit: 5, windowSeconds: 300 },
  /**
   * Endpoint yang membelanjakan kuota model.
   *
   * Paling ketat di seluruh daftar, dan itu memang mencerminkan biayanya: satu
   * panggilan ke sini menjalankan beberapa panggilan model sekaligus. Tiga per
   * jam per pemanggil adalah kuota untuk orang yang sedang meneliti satu-dua
   * instrumen, bukan untuk skrip.
   */
  llm: { limit: 3, windowSeconds: 3600 },
  /**
   * Terjemahan antarmuka dari pemilih bahasa.
   *
   * Satu halaman besar butuh beberapa permintaan (teks dikirim berkelompok),
   * dan membuka lima halaman berturut-turut tidak boleh terkunci. Yang mahal
   * hanya kalimat baru, dan itu sudah dibatasi pagu harian di sisi server.
   */
  translate: { limit: 40, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>
