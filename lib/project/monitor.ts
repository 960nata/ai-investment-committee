/**
 * Pemantau mendesak — tiap jam, tanpa model.
 *
 * Membaca angka 24 jam terakhir, menjalankan ambang tetap di `detectIssues`,
 * lalu menyamakan tabel peringatan: yang baru dibuka, yang sudah pulih
 * ditutup. Peringatan "mendesak" yang BARU muncul dikirim sebagai notifikasi
 * ke setiap akun admin; yang masih sama sejak jam lalu tidak dikirim ulang.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { collectProjectMetrics, detectIssues } from './metrics'
import { syncAlerts, type ProjectIssue } from './store'

export interface MonitorResult {
  open: number
  fresh: ProjectIssue[]
  notified: number
}

export async function runUrgentMonitor(now = new Date()): Promise<MonitorResult> {
  const metrics = await collectProjectMetrics(new Date(now.getTime() - 86_400_000), now)
  const issues = detectIssues(metrics)
  const fresh = await syncAlerts(issues)
  const urgent = fresh.filter((i) => i.severity === 'mendesak')

  let notified = 0
  if (urgent.length > 0) {
    try {
      const rows = await db.execute<{ id: number }>(sql`
        INSERT INTO user_notification (user_id, title, body, link_url)
        SELECT u.id, ${`Mendesak: ${urgent[0].title}${urgent.length > 1 ? ` (+${urgent.length - 1} lainnya)` : ''}`.slice(0, 200)},
               ${urgent.map((i) => `${i.title} — ${i.detail}`).join('\n')}, '/admin/rapat-project'
        FROM app_user u WHERE u.role = 'admin' AND u.is_active
        RETURNING id
      `)
      notified = rows.length
    } catch (err) {
      console.warn('[Monitor] notifikasi admin gagal:', err instanceof Error ? err.message : err)
    }
  }

  return { open: issues.length, fresh, notified }
}
