import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Supabase memberi dua URL dan keduanya dipakai untuk hal berbeda:
 *
 *   DATABASE_URL  port 6543  transaction pooler (pgBouncer)  -> runtime aplikasi
 *   DIRECT_URL    port 5432  koneksi langsung                -> migrasi drizzle-kit
 *
 * `prepare: false` wajib di pooler: pgBouncer mode transaction tidak mendukung
 * prepared statement, dan tanpa flag ini error-nya muncul acak di produksi.
 */

type Database = ReturnType<typeof drizzle<typeof schema>>

declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined
  var __db: Database | undefined
}

function connect(): Database {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL belum diset. Salin .env.example ke .env.local.')
  }

  // Di serverless tiap invocation bisa memakai ulang modul yang sama; klien
  // disimpan di global supaya koneksi tidak dibuat berulang saat hot reload.
  const client =
    globalThis.__pgClient ??
    postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })

  if (process.env.NODE_ENV !== 'production') globalThis.__pgClient = client

  return drizzle(client, { schema })
}

/**
 * Koneksi dibuat pada pemakaian pertama, bukan saat modul dimuat.
 *
 * `next build` mengimpor tiap route untuk menganalisisnya, jadi sambungan yang
 * dibuka di tingkat modul akan menuntut database hidup hanya untuk membangun
 * aplikasi. Proxy ini membuat kegagalan muncul di tempat yang benar: pada query
 * yang dijalankan, bukan pada proses build.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = (globalThis.__db ??= connect())
    const value = Reflect.get(instance, property)
    // Metode diikat ke instance aslinya; kalau `this` menunjuk ke proxy,
    // Drizzle kehilangan state internalnya.
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export { schema }
