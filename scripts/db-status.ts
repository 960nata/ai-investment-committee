/**
 * Keadaan basis data — ukuran, cakupan, dan pembersihan.
 *
 *   npm run db:status
 *   npm run db:status -- --vacuum
 *
 * Ada karena paket gratis Supabase berhenti di 500 MB, dan yang berhenti bukan
 * job terakhir saja melainkan seluruh penulisan. Batas itu perlu dilihat sebelum
 * ditabrak, bukan sesudah.
 */

import './load-env'
import postgres from 'postgres'

/** Batas paket gratis Supabase. */
const LIMIT_MB = 500

/** Ambang peringatan, cukup jauh untuk masih sempat berbuat sesuatu. */
const WARN_RATIO = 0.85

async function main(): Promise<void> {
  const sql = postgres(process.env.DIRECT_URL!, { max: 1, connect_timeout: 20 })

  try {
    const [size] = await sql<{ bytes: string; pretty: string }[]>`
      select pg_database_size(current_database())::text bytes,
             pg_size_pretty(pg_database_size(current_database())) pretty`

    const mb = Number(size.bytes) / 1024 / 1024
    const ratio = mb / LIMIT_MB
    const bar = '█'.repeat(Math.round(ratio * 30)).padEnd(30, '·')

    console.log(`\nBasis data  ${size.pretty} dari ${LIMIT_MB} MB`)
    console.log(`  ${bar} ${(ratio * 100).toFixed(0)}%`)
    if (ratio >= WARN_RATIO) {
      console.log(`  Sisa ${(LIMIT_MB - mb).toFixed(0)} MB. Penulisan berhenti total bila penuh.`)
    }

    const tables = await sql<{ nama: string; ukuran: string; mati: number }[]>`
      select relname nama,
             pg_size_pretty(pg_total_relation_size(relid)) ukuran,
             n_dead_tup::int mati
      from pg_stat_user_tables
      order by pg_total_relation_size(relid) desc
      limit 6`

    console.log('\nTabel terbesar')
    for (const t of tables) {
      const mati = t.mati > 1000 ? `  ${t.mati.toLocaleString('id-ID')} tuple mati` : ''
      console.log(`  ${t.nama.padEnd(22)} ${t.ukuran.padStart(9)}${mati}`)
    }

    const versions = await sql<{ versi: string; baris: number; instrumen: number }[]>`
      select feature_set_version versi,
             count(*)::int baris,
             count(distinct instrument_id)::int instrumen
      from feature_daily group by 1 order by 1`

    console.log('\nVersi set fitur')
    for (const v of versions) {
      console.log(
        `  ${v.versi.padEnd(16)} ${v.baris.toLocaleString('id-ID').padStart(9)} baris · ${v.instrumen} instrumen`,
      )
    }

    const coverage = await sql<
      { pasar: string; total: number; berfitur: number; terawal: string | null }[]
    >`
      select i.market pasar,
             count(distinct i.id)::int total,
             count(distinct f.instrument_id)::int berfitur,
             min(f.date)::text terawal
      from instrument i
      left join feature_daily f
        on f.instrument_id = i.id
       and f.feature_set_version = (select max(feature_set_version) from feature_daily)
      where i.is_active
      group by 1 order by 1`

    console.log('\nCakupan fitur versi terbaru')
    for (const c of coverage) {
      const sejak = c.terawal ?? 'belum ada'
      console.log(
        `  ${c.pasar.padEnd(8)} ${String(c.berfitur).padStart(3)}/${String(c.total).padEnd(4)} instrumen · sejak ${sejak}`,
      )
    }

    if (process.argv.includes('--vacuum')) {
      // VACUUM biasa, bukan FULL. FULL menulis ulang seluruh tabel ke berkas
      // baru dan butuh ruang kosong sebesar tabelnya — persis yang tidak ada
      // ketika seseorang menjalankan ini.
      console.log('\nMembersihkan tuple mati...')
      for (const t of tables) {
        if (t.mati < 1000) continue
        await sql.unsafe(`vacuum (analyze) ${t.nama}`)
        console.log(`  ${t.nama} dibersihkan`)
      }
      const [after] = await sql<{ pretty: string }[]>`
        select pg_size_pretty(pg_database_size(current_database())) pretty`
      console.log(`  sekarang ${after.pretty}`)
    }

    console.log('')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(`\nGagal: ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
