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
const MAX_CONNECTIONS = isProduction ? 8 : 5

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
    idle_timeout: 20,
    connect_timeout: 10,
    // extra_float_digits sengaja TIDAK dipasang di sini: pooler Supabase
    // membuang parameter koneksi itu, jadi nilainya tetap 0 dari berkas
    // konfigurasi server. Pembacaan `real` yang presisi ditangani di kueri
    // lewat `featureValuesExact` di queries.ts.
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  })

  return drizzle(client, { schema })
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
    const instance = isProduction ? (globalThis.__pgDb ??= connect()) : (moduleDb ??= connect())
    const value = Reflect.get(instance, property)
    // Metode diikat ke instance aslinya; kalau `this` menunjuk ke proxy,
    // Drizzle kehilangan state internalnya.
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export { schema }
