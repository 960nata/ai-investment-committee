import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Supabase memberi dua URL dan keduanya dipakai untuk hal berbeda:
 *
 *   DATABASE_URL  port 6543  pooler transaksi  -> runtime aplikasi
 *   DIRECT_URL    port 5432  pooler sesi       -> migrasi dan perkakas
 *
 * `prepare: false` wajib di pooler transaksi: mode itu tidak mendukung prepared
 * statement, dan tanpa flag ini error-nya muncul acak di produksi.
 */

type Database = ReturnType<typeof drizzle<typeof schema>>

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Batas waktu kueri di sisi server.
 *
 * Jaring pengaman, bukan setelan kinerja. Kueri yang macet harus berakhir
 * sebagai galat dalam hitungan detik, bukan sebagai halaman yang berputar tanpa
 * ujung. Seluruh kueri di sistem ini normalnya selesai di bawah satu detik.
 */
const STATEMENT_TIMEOUT_MS = 15_000

/**
 * Banyak koneksi per klien.
 *
 * Pooler transaksi Supabase (port 6543) dirancang untuk multiplexing.
 * Menyetel 8 koneksi di produksi memungkinkan query di Promise.all
 * berjalan paralel tanpa harus mengantre satu per satu di satu soket.
 */
//
// Sepuluh, bukan lima atau delapan: halaman terminal menjalankan tujuh kueri
// sekaligus (lima di `load`, tiga lagi di dalam `getDashboardStats`). Bila
// jumlahnya melebihi kolam, kueri mengantre di koneksi yang sedang dipakai, dan
// lewat pooler transaksi Supabase antrean itu sesekali macet tanpa ujung —
// halaman saham kedua yang dibuka menggantung sampai batas waktu. Terukur:
// dengan 5 macet di putaran kedua, dengan 10 tidak pernah.
const MAX_CONNECTIONS = 10

declare global {
  var __pgDb: Database | undefined
}

function connect(): Database {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL belum diset. Salin .env.example ke .env.local atau .env.')
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: MAX_CONNECTIONS,
    // Satu kueri per koneksi pada satu waktu. Bawaan postgres.js menumpuk
    // sampai 100 kueri di satu soket (pipelining), dan pooler transaksi
    // Supabase tidak tahan itu: sesekali koneksinya macet di tengah protokol —
    // Postgres menunggu `ClientRead` tanpa ujung — lalu seluruh kueri yang
    // antre di belakangnya ikut menggantung sampai halaman menyerah. Paralelnya
    // tetap ada, lewat `max` koneksi di kolam.
    // Opsi ini ada di runtime postgres.js 3.4 tetapi tidak di deklarasi tipenya.
    ...({ max_pipeline: 1 } as object),
    idle_timeout: 20,
    connect_timeout: 10,
    // extra_float_digits sengaja TIDAK dipasang di sini: pooler Supabase
    // membuang parameter koneksi itu, jadi nilainya tetap 0 dari berkas
    // konfigurasi server. Pembacaan `real` yang presisi ditangani di kueri
    // lewat `featureValuesExact` di queries.ts.
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  })

  guardClient(client)
  return drizzle(client, { schema })
}

/**
 * Batas waktu di sisi KLIEN, di atas `statement_timeout` di sisi server.
 *
 * `statement_timeout` hanya menghentikan kueri yang sedang dikerjakan Postgres.
 * Macet yang tercatat di proyek ini bukan itu: pooler transaksi Supabase
 * sesekali diam di tengah protokol, Postgres tidak sedang mengerjakan apa pun
 * (`pg_stat_activity` kosong), dan janji kuerinya tidak pernah selesai — job
 * menggantung sampai function dibunuh, halaman admin berputar tanpa ujung.
 *
 * Bila sebuah kueri belum selesai setelah CLIENT_TIMEOUT_MS, klien itu
 * dianggap rusak: ia ditutup (`end` menggagalkan semua kueri yang tergantung di
 * sana, jadi tidak ada yang menunggu selamanya) dan kueri berikutnya membuka
 * klien baru. Kueri BACA dicoba sekali lagi di klien baru; kueri tulis tidak,
 * karena INSERT yang ternyata sudah sampai akan tertulis dua kali.
 */
const CLIENT_TIMEOUT_MS = 16_000

export class QueryTimeoutError extends Error {
  constructor(ms: number) {
    super(`Kueri tidak dijawab basis data dalam ${ms / 1000} detik; koneksi diganti.`)
    this.name = 'QueryTimeoutError'
  }
}

/** Hanya kueri yang pasti tidak mengubah data yang aman diulang. */
export function isReadOnlyQuery(text: string): boolean {
  const q = text.trim().replace(/^\(+/, '').toLowerCase()
  if (!(q.startsWith('select') || q.startsWith('with'))) return false
  return !/\b(insert|update|delete|merge|alter|create|drop|truncate)\b/.test(q)
}

type Client = ReturnType<typeof postgres>
const poisoned = new WeakSet<Client>()

function guardClient(client: Client): void {
  const rawUnsafe = client.unsafe.bind(client)

  client.unsafe = ((query: string, params?: unknown[], options?: unknown) => {
    const pending = rawUnsafe(query, params as never, options as never)
    let asValues = false
    const rawValues = pending.values.bind(pending)
    pending.values = (() => {
      asValues = true
      rawValues()
      return pending
    }) as unknown as typeof pending.values

    // Timer dipasang saat kueri dibuat dan dilepas saat jawabannya diterima.
    // `then` dibungkus, bukan dipanggil di sini: memanggilnya lebih awal akan
    // menjalankan kueri sebelum Drizzle sempat meminta mode `.values()`.
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      discard(client)
    }, CLIENT_TIMEOUT_MS)
    timer.unref?.()

    const rawThen = pending.then.bind(pending)
    pending.then = ((onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      rawThen(
        (value: unknown) => {
          clearTimeout(timer)
          return onFulfilled ? onFulfilled(value) : value
        },
        async (error: unknown) => {
          clearTimeout(timer)
          if (timedOut) {
            if (isReadOnlyQuery(query)) {
              console.warn('[DB] kueri baca macet, dicoba ulang di koneksi baru')
              try {
                const fresh = freshClient().unsafe(query, params as never, options as never)
                const value = await (asValues ? fresh.values() : fresh)
                return onFulfilled ? onFulfilled(value) : value
              } catch (retryError) {
                if (onRejected) return onRejected(retryError)
                throw retryError
              }
            }
            error = new QueryTimeoutError(CLIENT_TIMEOUT_MS)
          }
          if (onRejected) return onRejected(error)
          throw error
        },
      )) as typeof pending.then

    return pending
  }) as typeof client.unsafe
}

/** Lepaskan klien yang macet: kueri berikutnya membuka klien baru. */
function discard(client: Client): void {
  if (poisoned.has(client)) return
  poisoned.add(client)
  console.warn('[DB] pooler tidak menjawab; klien ditutup dan diganti')
  if (isProduction ? globalThis.__pgDb?.$client === client : moduleDb?.$client === client) {
    if (isProduction) globalThis.__pgDb = undefined
    else moduleDb = undefined
  }
  // `end` menolak semua kueri yang masih tergantung di klien ini.
  client.end({ timeout: 1 }).catch(() => undefined)
}

function currentInstance(): Database {
  return isProduction ? (globalThis.__pgDb ??= connect()) : (moduleDb ??= connect())
}

function freshClient(): Client {
  return currentInstance().$client as Client
}

/**
 * Klien dibuat pada pemakaian pertama, bukan saat modul dimuat.
 *
 * `next build` mengimpor tiap route untuk menganalisisnya, jadi sambungan yang
 * dibuka di tingkat modul akan menuntut basis data hidup hanya untuk membangun
 * aplikasi. Proxy ini membuat kegagalan muncul di tempat yang benar: pada kueri
 * yang dijalankan, bukan pada proses build.
 *
 * Klien hanya disimpan di `globalThis` pada produksi, dan itu disengaja.
 *
 * Di pengembangan, tiap penyuntingan berkas memuat ulang modul sementara
 * `globalThis` bertahan. Klien yang tersimpan di sana tetap memegang soket milik
 * konteks modul yang sudah dibongkar: kuerinya sampai ke Postgres dan tercatat
 * di sana sebagai `active`, tetapi jawabannya tidak pernah ada yang membaca.
 * Gejalanya halaman menggantung tanpa satu pun pesan galat, dan penyebabnya
 * tidak terlihat dari mana pun. Di produksi tidak ada muat ulang modul, jadi di
 * sana penyimpanan itu aman sekaligus perlu.
 *
 * Di luar produksi klien disimpan di variabel modul: ikut dibuang saat modul
 * dimuat ulang, jadi tidak ada soket basi, tetapi tetap satu klien untuk
 * seluruh umur modul. Membuat klien baru di tiap akses berarti TCP, TLS, dan
 * autentikasi ulang untuk tiap kueri — ±0,7 detik ke pooler Seoul — dan klien
 * lamanya tidak pernah ditutup. Skrip `npm run job` juga berjalan di mode ini.
 */
let moduleDb: Database | undefined

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = currentInstance()
    const value = Reflect.get(instance, property)
    // Metode diikat ke instance aslinya; kalau `this` menunjuk ke proxy,
    // Drizzle kehilangan state internalnya.
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export { schema }
