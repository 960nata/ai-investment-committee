/**
 * Baseline jurnal migrasi — jalankan: npx tsx scripts/baseline-migrations.ts
 *
 * Dipakai satu kali, untuk database yang skemanya sampai lewat `drizzle-kit
 * push` dan bukan `migrate`. Push memasang tabelnya tetapi tidak menulis apa pun
 * ke `drizzle.__drizzle_migrations`, jadi drizzle mengira belum ada migrasi yang
 * terpasang. `db:migrate` berikutnya akan mencoba membuat ulang tabel yang sudah
 * berdiri dan gagal.
 *
 * Skrip ini menandai migrasi yang isinya SUDAH ada di database sebagai terpasang,
 * tanpa menjalankan satu pernyataan DDL pun. Hash dihitung persis seperti
 * drizzle-orm menghitungnya — sha256 atas isi mentah berkas .sql — karena hash
 * yang meleset membuat migrasi itu dianggap belum terpasang dan dicoba lagi.
 *
 * Idempoten: hash yang sudah tercatat dilewati.
 */

import './load-env'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

const FOLDER = resolve(process.cwd(), 'drizzle')

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DIRECT_URL / DATABASE_URL belum diset.')

  const journal = JSON.parse(
    readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] }

  const sql = postgres(url, { max: 1, connect_timeout: 15 })

  try {
    // Dibuat kalau belum ada; bentuknya sama dengan yang dibuat drizzle sendiri.
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle')
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)

    const existing = await sql<{ hash: string }[]>`
      select hash from drizzle.__drizzle_migrations
    `
    const known = new Set(existing.map((r) => r.hash))

    console.log(`\nJurnal berkas: ${journal.entries.length} migrasi`)
    console.log(`Tercatat di database: ${known.size}\n`)

    let added = 0
    for (const entry of journal.entries) {
      const content = readFileSync(resolve(FOLDER, `${entry.tag}.sql`), 'utf8')
      const hash = createHash('sha256').update(content).digest('hex')

      if (known.has(hash)) {
        console.log(`  lewat  ${entry.tag} (sudah tercatat)`)
        continue
      }

      await sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `
      console.log(`  tandai ${entry.tag}  ${hash.slice(0, 16)}…`)
      added++
    }

    console.log(
      `\n${added} migrasi ditandai terpasang. ` +
        'Tidak ada DDL yang dijalankan.\n' +
        'Verifikasi: npm run db:migrate (harus selesai tanpa membuat tabel).\n',
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('\nBaseline gagal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
