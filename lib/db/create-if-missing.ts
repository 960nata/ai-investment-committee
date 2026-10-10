/**
 * Jalankan DDL pembuatan tabel hanya bila tabelnya memang belum ada.
 *
 * `CREATE ... IF NOT EXISTS` tetap mengambil kunci katalog dan mencetak NOTICE
 * di setiap cold start; di produksi ia bisa antre di belakang tulisan yang
 * sedang mengalir (lihat catatan di `visit-queries.ts`). Cek `to_regclass`
 * yang murah dulu, DDL hanya pada pemakaian pertama di basis data baru.
 */

import { sql, type SQL } from 'drizzle-orm'
import { db } from './client'

export async function createIfMissing(tables: string | string[], ddl: SQL): Promise<void> {
  const names = Array.isArray(tables) ? tables : [tables]
  const [state] = await db.execute<{ ready: boolean }>(sql`
    SELECT ${sql.join(
      names.map((t) => sql`to_regclass(${t}) IS NOT NULL`),
      sql` AND `,
    )} AS ready
  `)
  if (state?.ready) return
  await db.execute(ddl)
}

/**
 * Tambahkan satu kolom ke tabel yang sudah ada, hanya bila kolomnya belum ada.
 * Untuk kolom yang datang sesudah tabelnya terpasang di produksi — DDL
 * pembuatan tabel tidak lagi dijalankan di sana. `definition` ditulis pemanggil
 * di kode, tidak pernah dari masukan pengguna.
 */
export async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const [state] = await db.execute<{ ready: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}
    ) AS ready
  `)
  if (!state?.ready) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`))
  }
}
