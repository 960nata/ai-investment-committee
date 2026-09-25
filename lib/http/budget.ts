/**
 * Pagu belanja model.
 *
 * Pembatas laju menjawab "seberapa cepat satu pemanggil boleh meminta". Ia
 * tidak menjawab pertanyaan yang sebenarnya membahayakan proyek ini: "berapa
 * banyak yang boleh dibelanjakan seluruh dunia hari ini". Seratus alamat yang
 * masing-masing patuh pada kuota per-alamat tetap bisa menghabiskan seluruh
 * kuota harian kunci gratisan sebelum tengah hari, dan tiap satu dari mereka
 * tidak pernah melanggar apa pun.
 *
 * Karena itu ada berkas ini: satu penghitung harian untuk seluruh pemanggil
 * bersama-sama, dengan jatah publik yang sengaja lebih kecil daripada pagunya.
 * Sisanya disimpan untuk pekerjaan terjadwal, sebab rapat komite harian adalah
 * alasan proyek ini ada — ia tidak boleh gagal hanya karena lalu lintas publik
 * kebetulan ramai di pagi yang sama.
 *
 * Yang dihitung di sini satuan rapat, bukan token. Token tidak bisa diketahui
 * sebelum panggilannya selesai, sedangkan keputusan menolak harus diambil
 * sebelum panggilannya dimulai. Satu rapat komite memakai beberapa panggilan
 * model dengan besaran yang cukup seragam, jadi menghitung rapat adalah
 * pendekatan yang cukup dekat dan bisa dihitung di muka.
 */

import { redisClient } from './blocklist'

/**
 * Pagu harian untuk seluruh rapat komite atas permintaan.
 *
 * Dibaca dari env supaya bisa dinaikkan tanpa deploy ulang ketika kunci
 * bertambah. Nilai bawaannya sengaja konservatif: lebih mudah menaikkan pagu
 * setelah melihat pemakaian nyata daripada menjelaskan kenapa seluruh kunci
 * mati di hari peluncuran.
 */
function ceiling(): number {
  const raw = Number(process.env.LLM_DAILY_CEILING)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300
}

/**
 * Bagian pagu yang boleh dipakai lalu lintas publik.
 *
 * Empat puluh persen sisanya bukan cadangan darurat, melainkan jatah pekerjaan
 * terjadwal yang sudah direncanakan. Pekerjaan itu tidak pernah memeriksa
 * jatah publik, jadi ia selalu punya ruang berapa pun ramainya situs.
 */
const PUBLIC_SHARE = 0.6

/** Jatah satu akun per hari, supaya satu orang tidak menghabiskan jatah publik. */
function perUserCeiling(): number {
  const raw = Number(process.env.LLM_DAILY_PER_USER)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15
}

export type SpendChannel = 'public' | 'scheduled'

export interface BudgetVerdict {
  allowed: boolean
  /** Sudah terpakai hari ini, termasuk permintaan ini bila diizinkan. */
  used: number
  /** Pagu yang berlaku untuk saluran ini. */
  ceiling: number
  /** Detik sampai penghitungnya berganti hari. */
  resetSeconds: number
  /** Diisi bila yang habis adalah jatah akun, bukan jatah global. */
  scope: 'global' | 'user'
  /** Benar bila yang menghitung hanyalah memori proses, bukan Redis. */
  degraded: boolean
}

/**
 * Penghitung cadangan di memori proses.
 *
 * Dipakai hanya ketika Redis tidak dikonfigurasi, dan sengaja tidak berpura-pura
 * setara: tiap instance serverless memegang salinannya sendiri, jadi pagu
 * sebenarnya terkalikan sebanyak instance yang sedang hidup. Karena itu pagunya
 * dipotong jadi seperempat — dengan empat instance, totalnya kembali mendekati
 * pagu yang dimaksud, dan dengan satu instance ia jauh lebih ketat daripada
 * perlu.
 *
 * Pilihan ini menggantikan dua jawaban yang sama-sama buruk. Meloloskan semua
 * berarti tidak ada perlindungan sama sekali persis di lapisan yang paling
 * dibutuhkan. Menolak semua berarti tombol rapat komite mati total di
 * pemasangan yang belum menyiapkan Redis — kerusakan yang tampak seperti bug
 * dan tidak menjelaskan dirinya sendiri. Yang ini tetap terbatas, tetap bekerja,
 * dan mengaku sedang turun kelas lewat `degraded`.
 */
const localCounter = { day: '', public: 0, scheduled: 0, users: new Map<number, number>() }

function rollOverIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10)
  if (localCounter.day === today) return

  localCounter.day = today
  localCounter.public = 0
  localCounter.scheduled = 0
  localCounter.users.clear()
}

function localSpend(
  channel: SpendChannel,
  units: number,
  userId?: number,
): { used: number; userCount: number } {
  rollOverIfNewDay()

  let userCount = 0
  if (userId !== undefined) {
    userCount = (localCounter.users.get(userId) ?? 0) + 1
    localCounter.users.set(userId, userCount)
  }

  localCounter[channel] += units
  return { used: localCounter[channel], userCount }
}

/** Pasangan `localSpend` untuk satuan yang tidak jadi dipakai. */
function localRefund(channel: SpendChannel, units: number, userId?: number): void {
  rollOverIfNewDay()

  localCounter[channel] = Math.max(0, localCounter[channel] - units)
  if (userId !== undefined) {
    localCounter.users.set(userId, Math.max(0, (localCounter.users.get(userId) ?? 0) - 1))
  }
}

function todayKey(suffix: string): string {
  return `budget:llm:${new Date().toISOString().slice(0, 10)}:${suffix}`
}

/** Detik tersisa sampai tengah malam UTC — saat penghitung harian berganti. */
function secondsUntilReset(): number {
  const now = new Date()
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  )
  return Math.max(1, Math.floor((midnight - now.getTime()) / 1000))
}

/**
 * Pesan satu satuan belanja sebelum memanggil model.
 *
 * Dipanggil SEBELUM pekerjaannya dimulai, bukan sesudah. Menghitung sesudah
 * berarti pagunya baru diketahui terlampaui setelah kuota benar-benar terpakai,
 * dan pada saat itu tidak ada lagi yang bisa dilindungi.
 *
 * Gagal TERTUTUP untuk saluran publik ketika Redis tidak ada — berbeda dari
 * pembatas laju di `ratelimit.ts`, yang gagal terbuka. Perbedaannya disengaja
 * dan penting: pembatas laju melindungi dari beban berlebih, dan mematikan
 * situs demi itu merugikan lebih banyak daripada yang diselamatkan. Pagu ini
 * melindungi sumber daya yang benar-benar habis dan tidak kembali sampai besok.
 * Kalau penghitungnya tidak bisa dibaca, satu-satunya jawaban yang tidak
 * berujung kunci mati adalah menolak.
 *
 * Saluran terjadwal tetap lolos ketika Redis mati: ia dipanggil sejumlah tetap
 * kali per hari oleh penjadwal yang sudah bertanda tangan, jadi jumlahnya
 * memang sudah terbatas dari sananya.
 */
export async function reserveLlmBudget(
  channel: SpendChannel,
  options: { userId?: number; units?: number } = {},
): Promise<BudgetVerdict> {
  const units = options.units ?? 1
  const total = ceiling()
  const limit = channel === 'public' ? Math.floor(total * PUBLIC_SHARE) : total
  const resetSeconds = secondsUntilReset()

  const redis = redisClient()
  if (!redis) {
    // Pekerjaan terjadwal dipanggil sejumlah tetap kali per hari oleh penjadwal
    // yang sudah bertanda tangan, jadi jumlahnya memang sudah terbatas dari
    // sananya dan tidak perlu dihitung ulang di sini.
    if (channel === 'scheduled') {
      return { allowed: true, used: 0, ceiling: limit, resetSeconds, scope: 'global', degraded: true }
    }

    const fallbackLimit = Math.max(5, Math.floor(limit / 4))
    const fallbackUser = Math.max(3, Math.floor(perUserCeiling() / 4))
    const { used, userCount } = localSpend(channel, units, options.userId)

    if (options.userId !== undefined && userCount > fallbackUser) {
      return {
        allowed: false,
        used: userCount,
        ceiling: fallbackUser,
        resetSeconds,
        scope: 'user',
        degraded: true,
      }
    }

    return {
      allowed: used <= fallbackLimit,
      used,
      ceiling: fallbackLimit,
      resetSeconds,
      scope: 'global',
      degraded: true,
    }
  }

  try {
    // Jatah akun diperiksa lebih dulu. Kalau yang habis adalah jatah satu orang,
    // penghitung global tidak boleh ikut naik — kalau ikut naik, satu akun yang
    // terus menabrak batasnya sendiri tetap bisa menghabiskan jatah orang lain.
    if (channel === 'public' && options.userId !== undefined) {
      const key = todayKey(`user:${options.userId}`)
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, resetSeconds)

      const perUser = perUserCeiling()
      if (count > perUser) {
        return {
          allowed: false,
          used: count,
          ceiling: perUser,
          resetSeconds,
          scope: 'user',
          degraded: false,
        }
      }
    }

    const key = todayKey(channel)
    const used = await redis.incrby(key, units)
    if (used === units) await redis.expire(key, resetSeconds)

    return {
      allowed: used <= limit,
      used,
      ceiling: limit,
      resetSeconds,
      scope: 'global',
      degraded: false,
    }
  } catch (err) {
    // Redis ada tapi sedang tidak menjawab. Turun ke penghitung memori dengan
    // pagu yang sama ketatnya — sama seperti ketika ia memang tidak dipasang.
    console.error('[Budget] penghitung tidak terjangkau:', err)

    if (channel === 'scheduled') {
      return { allowed: true, used: 0, ceiling: limit, resetSeconds, scope: 'global', degraded: true }
    }

    const fallbackLimit = Math.max(5, Math.floor(limit / 4))
    const { used } = localSpend(channel, units, options.userId)

    return {
      allowed: used <= fallbackLimit,
      used,
      ceiling: fallbackLimit,
      resetSeconds,
      scope: 'global',
      degraded: true,
    }
  }
}

/**
 * Kembalikan satuan yang sudah dipesan tetapi tidak jadi dipakai.
 *
 * Dipanggil ketika pekerjaannya gagal sebelum menyentuh model sama sekali —
 * simbol tidak ditemukan, misalnya. Tanpa ini, kesalahan pemanggil ikut
 * memakan pagu yang tidak pernah benar-benar dibelanjakan.
 */
export async function refundLlmBudget(
  channel: SpendChannel,
  options: { userId?: number; units?: number } = {},
): Promise<void> {
  const units = options.units ?? 1
  const redis = redisClient()

  if (!redis) {
    localRefund(channel, units, options.userId)
    return
  }

  try {
    const pipeline = redis.pipeline()
    pipeline.decrby(todayKey(channel), units)
    if (channel === 'public' && options.userId !== undefined) {
      pipeline.decr(todayKey(`user:${options.userId}`))
    }
    await pipeline.exec()
  } catch (err) {
    // Penghitung yang tadi menerima pesanan ini mungkin juga penghitung memori.
    // Mengembalikannya di sana tidak pernah salah: kalau pesanannya memang
    // masuk ke Redis, angkanya sudah nol dan `Math.max` menahannya di nol.
    console.error('[Budget] gagal mengembalikan satuan:', err)
    localRefund(channel, units, options.userId)
  }
}

export interface BudgetStatus {
  publicUsed: number
  publicCeiling: number
  scheduledUsed: number
  scheduledCeiling: number
  resetSeconds: number
  /** Salah bila penghitungnya tidak punya tempat disimpan. */
  tracked: boolean
}

/** Keadaan pagu hari ini, untuk layar admin dan endpoint status. */
export async function budgetStatus(): Promise<BudgetStatus> {
  const total = ceiling()
  const base: BudgetStatus = {
    publicUsed: 0,
    publicCeiling: Math.floor(total * PUBLIC_SHARE),
    scheduledUsed: 0,
    scheduledCeiling: total,
    resetSeconds: secondsUntilReset(),
    tracked: false,
  }

  const redis = redisClient()
  if (!redis) {
    rollOverIfNewDay()
    return {
      ...base,
      publicUsed: localCounter.public,
      publicCeiling: Math.max(5, Math.floor(base.publicCeiling / 4)),
      scheduledUsed: localCounter.scheduled,
    }
  }

  try {
    const [publicUsed, scheduledUsed] = (await redis
      .pipeline()
      .get(todayKey('public'))
      .get(todayKey('scheduled'))
      .exec()) as (number | string | null)[]

    return {
      ...base,
      publicUsed: Number(publicUsed ?? 0) || 0,
      scheduledUsed: Number(scheduledUsed ?? 0) || 0,
      tracked: true,
    }
  } catch (err) {
    console.error('[Budget] gagal membaca keadaan pagu:', err)
    return base
  }
}
