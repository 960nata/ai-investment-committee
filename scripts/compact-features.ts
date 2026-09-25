/**
 * Pindahkan `feature_daily` dari jsonb ke deret `real[]`.
 *
 *   npx tsx scripts/compact-features.ts --yes
 *
 * Kenapa dikosongkan, bukan dikonversi di tempat: menulis ulang tabel butuh
 * ruang kerja sebesar tabel barunya, dan paket gratis Supabase sudah hampir
 * penuh. `feature_daily` adalah hasil turunan yang selalu boleh dibuang lalu
 * dihitung ulang dari `candle_daily`, jadi jalur termurahnya: kosongkan, ubah
 * tipe kolom, lalu jalankan job fitur lagi.
 *
 * Aman diulang. Kalau kolomnya sudah `real[]`, skrip hanya melapor dan berhenti.
 */

import './load-env'
import postgres from 'postgres'

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.error('\nSkrip ini MENGOSONGKAN feature_daily. Jalankan ulang dengan --yes bila yakin.\n')
    process.exit(1)
  }

  const sql = postgres(process.env.DIRECT_URL!, { max: 1, connect_timeout: 20 })

  try {
    const size = async () =>
      (await sql<{ p: string }[]>`select pg_size_pretty(pg_database_size(current_database())) p`)[0].p

    const [column] = await sql<{ udt: string }[]>`
      select udt_name as udt from information_schema.columns
      where table_name = 'feature_daily' and column_name = 'values'`

    if (column?.udt === '_float4') {
      console.log('\nfeature_daily sudah berformat real[]. Tidak ada yang dikerjakan.')
      console.log(`Basis data sekarang ${await size()}.\n`)
      return
    }

    console.log(`\nSebelum: ${await size()}`)

    await sql.begin(async (tx) => {
      await tx`truncate table feature_daily`
      await tx`alter table feature_daily alter column "values" type real[] using null`
      await tx`
        create table if not exists feature_key_set (
          feature_set_version varchar(32) primary key,
          keys text[] not null,
          updated_at timestamptz not null default now()
        )`
      await tx`truncate table feature_key_set`
    })

    console.log(`Sesudah: ${await size()}`)
    console.log('\nJalankan job fitur untuk mengisi ulang:')
    console.log('  npm run job compute-features-crypto (dan -idx, -us, -global)')
    console.log('  npm run job normalise-cross-section\n')
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
