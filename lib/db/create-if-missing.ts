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
