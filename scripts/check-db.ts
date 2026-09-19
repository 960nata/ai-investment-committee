/**
 * Cek koneksi database — jalankan: npx tsx scripts/check-db.ts
 *
 * Menguji kedua URL secara terpisah. Keduanya sering gagal dengan cara berbeda:
 * pooler transaksi (6543) menolak prepared statement, sedangkan koneksi langsung
 * (5432) yang dipakai migrasi kadang tidak terjangkau dari jaringan IPv4.
 */

import './load-env'
import postgres from 'postgres'

async function probe(label: string, url: string | undefined, prepare: boolean) {
  if (!url) {
    console.log(`  ${label.padEnd(12)} BELUM DISET`)
    return false
  }

  const host = url.replace(/\/\/[^@]*@/, '//***@')
  const sql = postgres(url, { prepare, max: 1, connect_timeout: 15, idle_timeout: 5 })

  try {
    const started = Date.now()
    const rows = await sql`select current_database() as db, version() as v`
    const tables = await sql<{ name: string }[]>`
      select tablename as name from pg_tables where schemaname = 'public' order by tablename
    `
    console.log(`  ${label.padEnd(12)} OK (${Date.now() - started}ms) db=${rows[0].db}`)
    console.log(`  ${''.padEnd(12)} ${String(rows[0].v).split(' ').slice(0, 2).join(' ')}`)
    console.log(
      `  ${''.padEnd(12)} tabel public: ${tables.length === 0 ? '(kosong)' : tables.map((t) => t.name).join(', ')}`,
    )
    return true
  } catch (err) {
    console.log(`  ${label.padEnd(12)} GAGAL — ${err instanceof Error ? err.message : String(err)}`)
    console.log(`  ${''.padEnd(12)} ${host}`)
    return false
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Jurnal migrasi drizzle. Kosong berarti skema sampai ke database lewat
 * `push`, bukan `migrate` — tabelnya ada, tetapi tidak ada catatan versi mana
 * yang sudah terpasang, dan migrasi berikutnya akan mencoba membuat ulang
 * tabel yang sudah berdiri.
 */
async function journal(url: string | undefined) {
  if (!url) return
  const sql = postgres(url, { prepare: true, max: 1, connect_timeout: 15, idle_timeout: 5 })
  try {
    const rows = await sql<{ hash: string; created_at: string }[]>`
      select hash, created_at from drizzle.__drizzle_migrations order by created_at
    `
    console.log(`\nJurnal migrasi: ${rows.length} migrasi tercatat`)
    for (const r of rows) {
      const when = new Date(Number(r.created_at)).toISOString().slice(0, 19).replace('T', ' ')
      console.log(`  ${when}  ${String(r.hash).slice(0, 16)}…`)
    }
  } catch {
    console.log('\nJurnal migrasi: BELUM ADA — skema dipasang lewat push, bukan migrate')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main() {
  console.log('\nKoneksi Supabase')
  const pooler = await probe('DATABASE_URL', process.env.DATABASE_URL, false)
  await probe('DIRECT_URL', process.env.DIRECT_URL, true)
  await journal(process.env.DIRECT_URL)
  console.log('')
  if (!pooler) process.exitCode = 1
}

main()
