/**
 * Pindahkan `feature_daily.values` dari jsonb ke `real[]` TANPA kehilangan data.
 *
 *   npx tsx scripts/migrate-feature-storage.ts backup   <berkas.jsonl.gz>
 *   npx tsx scripts/migrate-feature-storage.ts migrate  <berkas.jsonl.gz> --yes
 *   npx tsx scripts/migrate-feature-storage.ts verify   <berkas.jsonl.gz>
 *
 * Kenapa bukan `compact-features.ts`: skrip itu mengosongkan tabel lalu
 * mengandalkan job fitur untuk mengisinya kembali. Selama jeda itu fitur
 * kosong, dan kalau job gagal di tengah, sebagian riwayat hilang. Skrip ini
 * memasukkan kembali DATA YANG SAMA dari cadangan lokal, jadi hasilnya tidak
 * bergantung pada job mana pun.
 *
 * Kenapa lewat cadangan dan bukan konversi di tempat: menulis ulang tabel butuh
 * ruang kerja sebesar tabel barunya, sementara basis data tinggal 6 MB.
 * Mengosongkan dulu membebaskan ruangnya; cadangan yang sudah diverifikasi
 * membuat pengosongan itu aman.
 *
 * `migrate` menolak berjalan bila jumlah baris cadangan tidak sama persis
 * dengan jumlah baris di tabel. Cadangan yang kurang satu baris pun berarti
 * satu baris hilang.
 */

import './load-env'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGzip, createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import postgres from 'postgres'

type Row = { i: number; d: string; v: string; x: Record<string, unknown>; c: string }

const [, , mode, file] = process.argv
const sql = postgres(process.env.DIRECT_URL!, {
  max: 1, connect_timeout: 30, idle_timeout: 60,
  // Pembacaan memakai ::float8[] — lihat featureValuesExact di queries.ts.
})

async function* readBackup(path: string): AsyncGenerator<Row> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) if (line) yield JSON.parse(line) as Row
}

async function backup(path: string) {
  const out = createGzip()
  const done = new Promise<void>((res, rej) => out.pipe(createWriteStream(path)).on('finish', res).on('error', rej))
  let n = 0
  // Per instrumen, bukan satu kursor panjang: Supabase memutus kueri yang
  // berjalan melewati statement_timeout, dan percobaan pertama tewas di tengah
  // jalan dengan berkas setengah jadi. Kueri per instrumen selesai dalam detik.
  const ids = await sql<{ id: number }[]>`select distinct instrument_id as id from feature_daily order by 1`
  for (const { id } of ids) {
    const batch = await sql`
      select instrument_id, date::text as date, feature_set_version, "values", computed_at
      from feature_daily where instrument_id = ${id} order by date, feature_set_version`
    for (const r of batch) {
      const row: Row = { i: r.instrument_id, d: r.date, v: r.feature_set_version, x: r.values, c: new Date(r.computed_at).toISOString() }
      if (!out.write(JSON.stringify(row) + '\n')) await new Promise((r) => out.once('drain', r))
      n++
    }
  }
  out.end()
  await done
  let check = 0
  for await (const _ of readBackup(path)) check++
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from feature_daily`
  console.log(`dicadangkan ${n} baris · dibaca ulang dari berkas ${check} · di tabel ${count}`)
  if (n !== check || String(n) !== count) throw new Error('CADANGAN TIDAK UTUH — jangan lanjut')
  console.log('cadangan UTUH')
}

/** Urutan kunci: sesuai kemunculan pertama, lalu sisanya berurutan abjad. */
async function collectKeys(path: string): Promise<Map<string, string[]>> {
  const seen = new Map<string, Set<string>>()
  const order = new Map<string, string[]>()
  for await (const r of readBackup(path)) {
    if (!seen.has(r.v)) { seen.set(r.v, new Set()); order.set(r.v, []) }
    for (const k of Object.keys(r.x)) if (!seen.get(r.v)!.has(k)) { seen.get(r.v)!.add(k); order.get(r.v)!.push(k) }
  }
  return order
}

const encode = (x: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => { const v = x[k]; return typeof v === 'number' && Number.isFinite(v) ? v : null })

async function migrate(path: string) {
  if (!process.argv.includes('--yes')) throw new Error('tambahkan --yes')
  const [{ udt }] = await sql<{ udt: string }[]>`
    select udt_name as udt from information_schema.columns where table_name='feature_daily' and column_name='values'`
  if (udt === '_float4') throw new Error('kolom sudah real[] — tidak ada yang dikerjakan')

  let inBackup = 0
  for await (const _ of readBackup(path)) inBackup++
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from feature_daily`
  if (String(inBackup) !== count) throw new Error(`cadangan ${inBackup} ≠ tabel ${count} — BATAL`)

  const keysByVersion = await collectKeys(path)
  for (const [v, k] of keysByVersion) console.log(`versi ${v}: ${k.length} kunci`)

  const size = async () => (await sql<{ p: string }[]>`select pg_size_pretty(pg_database_size(current_database())) p`)[0].p
  console.log(`sebelum: ${await size()}`)

  await sql.begin(async (tx) => {
    await tx`truncate table feature_daily`
    await tx`alter table feature_daily alter column "values" type real[] using null`
    await tx`create table if not exists feature_key_set (
      feature_set_version varchar(32) primary key, keys text[] not null,
      updated_at timestamptz not null default now())`
    for (const [v, k] of keysByVersion)
      await tx`insert into feature_key_set (feature_set_version, keys) values (${v}, ${k}::text[])
               on conflict (feature_set_version) do update set keys = excluded.keys, updated_at = now()`
  })
  console.log(`setelah dikosongkan: ${await size()}`)

  let batch: Row[] = []
  let written = 0
  const flush = async () => {
    if (!batch.length) return
    const rows = batch.map((r) => ({
      instrument_id: r.i, date: r.d, feature_set_version: r.v,
      values: encode(r.x, keysByVersion.get(r.v)!), computed_at: r.c,
    }))
    await sql`insert into feature_daily ${sql(rows, 'instrument_id', 'date', 'feature_set_version', 'values', 'computed_at')}`
    written += batch.length
    batch = []
    if (written % 20000 < 1000) console.log(`  dimasukkan ${written}`)
  }
  for await (const r of readBackup(path)) { batch.push(r); if (batch.length >= 1000) await flush() }
  await flush()

  const [{ count: after }] = await sql<{ count: string }[]>`select count(*)::text as count from feature_daily`
  console.log(`dimasukkan ${written} · di tabel ${after} · cadangan ${inBackup}`)
  if (after !== String(inBackup)) throw new Error('JUMLAH TIDAK SAMA — periksa sebelum apa pun')
  console.log(`sesudah: ${await size()}`)
}

async function verify(path: string) {
  const keysRows = await sql<{ feature_set_version: string; keys: string[] }[]>`select feature_set_version, keys from feature_key_set`
  const keysBy = new Map(keysRows.map((r) => [r.feature_set_version, r.keys]))
  let checked = 0, bad = 0, n = 0, maxRel = 0
  for await (const r of readBackup(path)) {
    if (n++ % 577 !== 0) continue // sampel tersebar ±200 baris
    const [row] = await sql<{ values: number[] }[]>`
      select "values"::float8[] as "values" from feature_daily where instrument_id=${r.i} and date=${r.d} and feature_set_version=${r.v}`
    if (!row) { bad++; continue }
    const keys = keysBy.get(r.v)!
    keys.forEach((k, idx) => {
      const want = r.x[k]; const got = row.values[idx]
      const wantNum = typeof want === 'number' && Number.isFinite(want)
      const gotNum = typeof got === 'number' && Number.isFinite(got)
      if (wantNum !== gotNum) { bad++; return }
      if (wantNum && gotNum) {
        const rel = Math.abs((got as number) - (want as number)) / Math.max(1e-12, Math.abs(want as number))
        if (Math.abs(want as number) > 1e-30) maxRel = Math.max(maxRel, rel)
        if (rel > 6e-8 && Math.abs((got as number) - (want as number)) > 1e-30) bad++ // batas galat float4: 2^-24
      }
    })
    checked++
  }
  console.log(`sampel ${checked} baris · selisih ${bad} · selisih relatif maks ${maxRel.toExponential(2)}`)
  if (bad) throw new Error('ADA NILAI BERBEDA')
  console.log('VERIFIKASI LOLOS')
}

const run = { backup, migrate, verify }[mode as 'backup']
if (!run || !file) { console.error('mode: backup | migrate | verify, plus path berkas'); process.exit(1) }
run(file).then(() => sql.end()).catch(async (e) => { console.error(e.message ?? e); await sql.end(); process.exit(1) })
