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

/**
 * Bagian pagu untuk pengunjung tanpa akun (kalkulator publik).
 *
 * Sengaja kecil dan terpisah dari jatah publik: pengunjung anonim tidak punya
 * identitas yang bisa dimintai tanggung jawab, jadi merekalah yang paling mudah
 * dipakai untuk menguras kuota. Kalau jatah ini habis, pengguna yang sudah
 * masuk tidak ikut kehabisan.
 */
const ANON_SHARE = 0.1

/** Jatah satu pengunjung anonim (sidik IP) per hari. */
function perAnonCeiling(): number {
  const raw = Number(process.env.LLM_DAILY_PER_ANON)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5
}

export type SpendChannel = 'public' | 'scheduled' | 'anonymous'

/** Kunci penghitung per pemanggil: akun untuk saluran publik, sidik IP untuk anonim. */
function subjectKey(channel: SpendChannel, userId?: number, subject?: string): string | null {
  if (channel === 'public' && userId !== undefined) return `user:${userId}`
  if (channel === 'anonymous' && subject) return `anon:${subject}`
  return null
}

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
const localCounter = { day: '', public: 0, scheduled: 0, anonymous: 0, users: new Map<string, number>() }

function rollOverIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10)
  if (localCounter.day === today) return

  localCounter.day = today
  localCounter.public = 0
  localCounter.scheduled = 0
  localCounter.anonymous = 0
  localCounter.users.clear()
}

function localSpend(
  channel: SpendChannel,
  units: number,
  subject: string | null,
): { used: number; userCount: number } {
  rollOverIfNewDay()

  let userCount = 0
  if (subject !== null) {
    userCount = (localCounter.users.get(subject) ?? 0) + 1
    localCounter.users.set(subject, userCount)
  }

  localCounter[channel] += units
  return { used: localCounter[channel], userCount }
}

/** Pasangan `localSpend` untuk satuan yang tidak jadi dipakai. */
function localRefund(channel: SpendChannel, units: number, subject: string | null): void {
  rollOverIfNewDay()

  localCounter[channel] = Math.max(0, localCounter[channel] - units)
  if (subject !== null) {
    localCounter.users.set(subject, Math.max(0, (localCounter.users.get(subject) ?? 0) - 1))
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
  options: { userId?: number; subject?: string; units?: number; perUserLimit?: number } = {},
): Promise<BudgetVerdict> {
  const units = options.units ?? 1
  // Batas per akun dari pengaturan Premium (gratis vs Premium) bila diberikan;
  // selain itu dari env seperti sebelumnya. Pengunjung anonim punya batasnya sendiri.
  const perUserLimit =
    channel === 'anonymous' ? perAnonCeiling() : (options.perUserLimit ?? perUserCeiling())
  const total = ceiling()
  const limit =
    channel === 'public'
      ? Math.floor(total * PUBLIC_SHARE)
      : channel === 'anonymous'
        ? Math.max(1, Math.floor(total * ANON_SHARE))
        : total
  const subject = subjectKey(channel, options.userId, options.subject)
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
    const fallbackUser = Math.max(3, Math.floor(perUserLimit / 4))
    const { used, userCount } = localSpend(channel, units, subject)

    if (subject !== null && userCount > fallbackUser) {
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
    if (subject !== null) {
      const key = todayKey(subject)
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, resetSeconds)

      const perUser = perUserLimit
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
    const { used } = localSpend(channel, units, subject)

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
  options: { userId?: number; subject?: string; units?: number } = {},
): Promise<void> {
  const units = options.units ?? 1
  const subject = subjectKey(channel, options.userId, options.subject)
  const redis = redisClient()

  if (!redis) {
    localRefund(channel, units, subject)
    return
  }

  try {
    const pipeline = redis.pipeline()
    pipeline.decrby(todayKey(channel), units)
    if (subject !== null) pipeline.decr(todayKey(subject))
    await pipeline.exec()
  } catch (err) {
    // Penghitung yang tadi menerima pesanan ini mungkin juga penghitung memori.
    // Mengembalikannya di sana tidak pernah salah: kalau pesanannya memang
    // masuk ke Redis, angkanya sudah nol dan `Math.max` menahannya di nol.
    console.error('[Budget] gagal mengembalikan satuan:', err)
    localRefund(channel, units, subject)
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

// ---------------------------------------------------------------------------
// Pagu terjemahan antarmuka
// ---------------------------------------------------------------------------

/*
 * Endpoint terjemahan terbuka untuk tamu, dan teksnya datang dari peramban —
 * tidak ada cara bagi server untuk tahu apakah sebuah kalimat memang tampil di
 * halaman atau dikarang pemanggil. Yang bisa dijamin hanyalah berapa banyak
 * yang boleh dibelanjakan untuknya.
 *
 * Satuannya karakter, bukan kalimat. Pagu per kalimat bisa dikuras dengan
 * mengirim kalimat sepanjang batas maksimum; pagu per karakter tidak peduli
 * bagaimana teksnya dipotong.
 *
 * Tiga kantong, supaya satu penyalahguna tidak bisa menghabiskan milik orang
 * lain:
 *   - tiap alamat tamu punya jatahnya sendiri;
 *   - seluruh tamu bersama-sama hanya boleh memakai sebagian pagu harian;
 *   - tiap akun punya jatahnya sendiri, di luar kantong tamu.
 * Bot tanpa akun paling jauh menghabiskan kantong tamu — anggota tetap mendapat
 * terjemahan hari itu.
 */

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

const translateLimits = () => {
  const isDev = process.env.NODE_ENV !== 'production'
  return {
    total: envInt('UI_TRANSLATE_DAILY_CHARS', isDev ? 2_000_000 : 400_000),
    guestShare: isDev ? 1.0 : 0.4,
    perIp: envInt('UI_TRANSLATE_DAILY_PER_IP', isDev ? 500_000 : 30_000),
    perUser: envInt('UI_TRANSLATE_DAILY_PER_USER', isDev ? 500_000 : 60_000),
  }
}

interface Bucket {
  key: string
  limit: number
}

function translateBuckets(caller: { ipHash: string; userId?: number }): Bucket[] {
  const limits = translateLimits()
  const buckets: Bucket[] = [{ key: todayKey('tr:all'), limit: limits.total }]

  if (caller.userId !== undefined) {
    buckets.push({ key: todayKey(`tr:user:${caller.userId}`), limit: limits.perUser })
  } else {
    buckets.push({ key: todayKey('tr:guest'), limit: Math.floor(limits.total * limits.guestShare) })
    buckets.push({ key: todayKey(`tr:ip:${caller.ipHash}`), limit: limits.perIp })
  }
  return buckets
}

/** Penghitung cadangan tanpa Redis; lihat catatan `localCounter` di atas. */
const localBuckets = { day: '', counts: new Map<string, number>() }

function localBucketCounts(): Map<string, number> {
  const today = new Date().toISOString().slice(0, 10)
  if (localBuckets.day !== today) {
    localBuckets.day = today
    localBuckets.counts.clear()
  }
  return localBuckets.counts
}

function localAdd(buckets: Bucket[], units: number): number[] {
  const counts = localBucketCounts()
  return buckets.map(({ key }) => {
    const next = (counts.get(key) ?? 0) + units
    counts.set(key, Math.max(0, next))
    return next
  })
}

/**
 * Pesan sebanyak mungkin dari `units` di seluruh kantong sekaligus.
 *
 * Tiap kantong dinaikkan lebih dulu dengan INCRBY — atomik, jadi permintaan
 * yang datang bersamaan tidak bisa sama-sama membaca "masih ada ruang" lalu
 * sama-sama melampauinya. Yang diberikan adalah ruang tersempit di antara
 * kantong-kantong itu, dan kelebihannya dikembalikan ke semuanya.
 *
 * Permintaan yang bersamaan bisa saling melihat pesanan sementara milik yang
 * lain dan menerima sedikit lebih kecil daripada yang sebenarnya tersedia.
 * Itu sengaja: kesalahan ke arah hemat.
 */
async function reserveAcross(
  buckets: Bucket[],
  units: number,
): Promise<{ granted: number; degraded: boolean }> {
  if (units <= 0) return { granted: 0, degraded: false }

  const resetSeconds = secondsUntilReset()
  const grantFrom = (after: number[], limits: number[]) =>
    Math.max(
      0,
      Math.min(units, ...after.map((value, i) => limits[i] - (value - units))),
    )

  const redis = redisClient()
  if (redis) {
    try {
      const pipeline = redis.pipeline()
      for (const { key } of buckets) pipeline.incrby(key, units)
      const after = (await pipeline.exec()) as number[]

      const granted = grantFrom(after, buckets.map((b) => b.limit))
      const excess = units - granted

      const followUp = redis.pipeline()
      buckets.forEach(({ key }, i) => {
        if (after[i] === units) followUp.expire(key, resetSeconds)
        if (excess > 0) followUp.decrby(key, excess)
      })
      if (excess > 0 || after.some((value) => value === units)) await followUp.exec()

      return { granted, degraded: false }
    } catch (err) {
      console.error('[Budget] pagu terjemahan tidak terjangkau:', err)
    }
  }

  // Tanpa Redis tiap instance menghitung sendiri, jadi pagunya dipotong
  // seperempat — alasan yang sama dengan pagu rapat di atas.
  const limits = buckets.map((b) => Math.max(1_000, Math.floor(b.limit / 4)))
  const after = localAdd(buckets, units)
  const granted = grantFrom(after, limits)
  if (units - granted > 0) localAdd(buckets, -(units - granted))
  return { granted, degraded: true }
}

async function releaseAcross(buckets: Bucket[], units: number, degraded: boolean): Promise<void> {
  if (units <= 0) return

  const redis = redisClient()
  if (redis && !degraded) {
    try {
      const pipeline = redis.pipeline()
      for (const { key } of buckets) pipeline.decrby(key, units)
      await pipeline.exec()
      return
    } catch (err) {
      console.error('[Budget] gagal mengembalikan pagu terjemahan:', err)
    }
  }
  localAdd(buckets, -units)
}

export interface TranslateAllowance {
  /** Karakter yang boleh dikirim ke model. */
  granted: number
  /** Kembalikan karakter yang tidak jadi dipakai. */
  release(units: number): Promise<void>
}

/**
 * Pesan pagu karakter untuk teks yang belum ada di cache.
 *
 * `ipHash` sudah berupa sidik, bukan alamat mentah, supaya alamat pengunjung
 * tidak pernah tersimpan sebagai kunci Redis.
 */
export async function reserveTranslateChars(
  units: number,
  caller: { ipHash: string; userId?: number },
): Promise<TranslateAllowance> {
  const buckets = translateBuckets(caller)
  const { granted, degraded } = await reserveAcross(buckets, units)
  return {
    granted,
    release: (unused) => releaseAcross(buckets, Math.min(unused, granted), degraded),
  }
}

export interface TranslateBudgetStatus {
  used: number
  ceiling: number
  guestUsed: number
  guestCeiling: number
  tracked: boolean
}

/** Keadaan pagu terjemahan hari ini, untuk layar admin. */
export async function translateBudgetStatus(): Promise<TranslateBudgetStatus> {
  const limits = translateLimits()
  const base: TranslateBudgetStatus = {
    used: 0,
    ceiling: limits.total,
    guestUsed: 0,
    guestCeiling: Math.floor(limits.total * limits.guestShare),
    tracked: false,
  }

  const redis = redisClient()
  if (!redis) {
    const counts = localBucketCounts()
    return {
      ...base,
      used: counts.get(todayKey('tr:all')) ?? 0,
      guestUsed: counts.get(todayKey('tr:guest')) ?? 0,
    }
  }

  try {
    const [used, guestUsed] = (await redis
      .pipeline()
      .get(todayKey('tr:all'))
      .get(todayKey('tr:guest'))
      .exec()) as (number | string | null)[]

    return {
      ...base,
      used: Number(used ?? 0) || 0,
      guestUsed: Number(guestUsed ?? 0) || 0,
      tracked: true,
    }
  } catch (err) {
    console.error('[Budget] gagal membaca pagu terjemahan:', err)
    return base
  }
}
