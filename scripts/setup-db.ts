/**
 * Siapkan basis data — jalankan: npm run db:setup
 *
 * Menggantikan rangkaian `drizzle-kit push` yang menunggu jawaban di layar.
 * Perintah yang berhenti menanyakan sesuatu terlihat persis seperti perintah
 * yang menggantung, dan keduanya sama-sama membuat orang menunggu sia-sia.
 *
 * Skrip ini tidak pernah bertanya dan tidak pernah menghapus apa pun. Ia
 * memeriksa keadaan basis data lebih dulu, memilih satu dari tiga jalur, lalu
 * mengatakan persis apa yang dikerjakannya.
 *
 * Semua langkah punya batas waktu. Sambungan yang tidak pernah terjawab harus
 * berakhir dengan pesan, bukan dengan kursor berkedip.
 */

import './load-env'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../lib/db/schema'

const FOLDER = resolve(process.cwd(), 'drizzle')
const CONNECT_TIMEOUT_SECONDS = 15

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

/** Nama tabel yang seharusnya ada, dibaca dari skema itu sendiri. */
function expectedTables(): string[] {
  const tables: PgTable[] = []
  for (const value of Object.values(schema)) {
    // `is` milik drizzle, bukan instanceof: tabel dibungkus proxy sehingga
    // pemeriksaan prototipe biasa tidak selalu mengenalinya.
    if (is(value, PgTable)) tables.push(value)
  }
  return tables.map((table) => getTableConfig(table).name).sort()
}

function journal(): JournalEntry[] {
  const raw = readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries
}

/** Hash dihitung persis seperti drizzle-orm menghitungnya: sha256 atas isi mentah. */
function migrationHash(tag: string): string {
  return createHash('sha256').update(readFileSync(resolve(FOLDER, `${tag}.sql`), 'utf8')).digest('hex')
}

function step(text: string): void {
  console.log(`\n${text}`)
}

function line(text: string): void {
  console.log(`  ${text}`)
}

async function main(): Promise<void> {
  // Migrasi memakai koneksi langsung: pooler transaksi tidak mendukung
  // prepared statement, dan DDL lewat sana gagal dengan cara yang membingungkan.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('DIRECT_URL atau DATABASE_URL belum diset di .env.local maupun .env.')
  }

  const usingFallback = !process.env.DIRECT_URL
  const sql = postgres(url, {
    max: 1,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    idle_timeout: 10,
  })

  try {
    step('1/4 · Memeriksa sambungan')
    if (usingFallback) {
      line('DIRECT_URL belum diset, memakai DATABASE_URL. Kalau ia menunjuk pooler')
      line('transaksi (port 6543), pembuatan tabel bisa gagal.')
    }

    const [info] = await sql<{ db: string; port: string }[]>`
      select current_database() as db, inet_server_port()::text as port
    `
    line(`terhubung ke ${info.db} lewat port ${info.port}`)

    step('2/4 · Memeriksa tabel yang sudah ada')
    const rows = await sql<{ name: string }[]>`
      select tablename as name from pg_tables where schemaname = 'public'
    `
    const present = new Set(rows.map((r) => r.name))
    const expected = expectedTables()
    const missing = expected.filter((t) => !present.has(t))

    line(`skema mengharapkan ${expected.length} tabel, ${expected.length - missing.length} sudah ada`)
    if (missing.length > 0 && missing.length < expected.length) {
      line(`belum ada: ${missing.join(', ')}`)
    }

    const applied = await appliedHashes(sql)
    line(`jurnal migrasi mencatat ${applied.size} migrasi terpasang`)

    step('3/4 · Menyelaraskan skema')

    if (missing.length === expected.length) {
      // Basis data kosong. Jalur paling bersih: jalankan migrasi apa adanya.
      line('basis data kosong, menjalankan seluruh migrasi')
      await migrate(drizzle(sql), { migrationsFolder: FOLDER })
      line('selesai')
    } else if (missing.length === 0 && applied.size === 0) {
      // Tabelnya dipasang lewat push, yang tidak menulis apa pun ke jurnal.
      // Migrasi ditandai terpasang tanpa menjalankan satu pernyataan DDL pun.
      line('tabel sudah lengkap tetapi jurnalnya kosong, menandai migrasi terpasang')
      const marked = await baseline(sql, applied)
      line(`${marked} migrasi ditandai, tidak ada DDL yang dijalankan`)
    } else if (missing.length === 0) {
      line('tabel sudah lengkap, menjalankan migrasi yang belum terpasang')
      await migrate(drizzle(sql), { migrationsFolder: FOLDER })
      line('selesai')
    } else if (journal().some((e) => !applied.has(migrationHash(e.tag)))) {
      // Ada tabel yang belum berdiri, tetapi juga ada migrasi yang belum
      // dijalankan. Itu keadaan normal setelah menarik perubahan skema, bukan
      // kerusakan: jalankan migrasinya, lalu periksa ulang hasilnya.
      line('ada migrasi yang belum dijalankan, menjalankannya sekarang')
      await migrate(drizzle(sql), { migrationsFolder: FOLDER })

      const after = await sql<{ name: string }[]>`
        select tablename as name from pg_tables where schemaname = 'public'
      `
      const stillMissing = expected.filter((t) => !new Set(after.map((r) => r.name)).has(t))

      if (stillMissing.length > 0) {
        throw new Error(
          `Migrasi selesai tetapi tabel ini tetap belum ada: ${stillMissing.join(', ')}`,
        )
      }
      line('selesai, seluruh tabel berdiri')
    } else {
      // Ada tabel hilang tanpa satu pun migrasi tertunda yang menjelaskannya.
      // Skrip ini tidak menebak dan tidak menghapus.
      line('skema terpasang sebagian dan tidak ada migrasi tertunda yang menjelaskannya.')
      line('')
      line('Kalau belum ada data yang sayang hilang, cara tercepat:')
      line('  npx drizzle-kit push')
      line('')
      line('Perintah itu akan menanyakan tiap perubahan yang berisiko sebelum')
      line('menjalankannya, jadi baca dulu sebelum menjawab ya.')
      throw new Error(`Tabel yang belum ada: ${missing.join(', ')}`)
    }

    step('4/4 · Siap')
    line('lanjutkan dengan: npm run db:seed')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/** Hash migrasi yang sudah tercatat terpasang. Tabel jurnal boleh belum ada. */
async function appliedHashes(sql: postgres.Sql): Promise<Set<string>> {
  const exists = await sql<{ ok: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as ok
  `
  if (!exists[0].ok) return new Set()

  const rows = await sql<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`
  return new Set(rows.map((r) => r.hash))
}

/** Tandai seluruh migrasi sebagai terpasang, tanpa menjalankan isinya. */
async function baseline(sql: postgres.Sql, applied: Set<string>): Promise<number> {
  await sql`create schema if not exists drizzle`
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `

  let marked = 0
  for (const entry of journal()) {
    const hash = migrationHash(entry.tag)
    if (applied.has(hash)) continue

    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${entry.when})
    `
    marked++
  }
  return marked
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nGagal: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
