/**
 * Papan jadwal rapat: empat kalender dinding bergaris, satu per periode,
 * dengan aturan, jadwal berikutnya, dan kapan terakhir digelar.
 */

import type { ReportPeriod } from '@/lib/project/store'
import styles from './meeting-room.module.css'

export interface ScheduleItem {
  period: ReportPeriod
  rule: string
  next: string
  last: string | null
  count: number
}

const DAY: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
const STAMP: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }

export function ScheduleBoard({ items }: { items: ScheduleItem[] }) {
  return (
    <section className={styles.schedule} aria-label="Jadwal rapat">
      {items.map((it) => {
        const next = new Date(it.next)
        return (
          <div key={it.period} className={styles.calendar}>
            {/* Kalender dinding: paku gantung, cincin, dan lembar tanggal */}
            <svg viewBox="0 0 120 120" className={styles.calendarArt} aria-hidden="true">
              <line x1="60" y1="2" x2="60" y2="10" className={styles.art} />
              <rect x="14" y="14" width="92" height="96" rx="8" className={styles.art} />
              <line x1="14" y1="38" x2="106" y2="38" className={styles.art} />
              <circle cx="38" cy="14" r="4" className={styles.artAccent} />
              <circle cx="82" cy="14" r="4" className={styles.artAccent} />
              <text x="60" y="31" textAnchor="middle" className={styles.calMonth}>
                {next.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'short' }).toUpperCase()}
              </text>
              <text x="60" y="84" textAnchor="middle" className={styles.calDay}>
                {next.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric' })}
              </text>
              <text x="60" y="100" textAnchor="middle" className={styles.calYear}>
                {next.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric' })}
              </text>
            </svg>
            <div className={styles.calendarText}>
              <div className={styles.calendarTitle}>Rapat {it.period}</div>
              <div className={styles.calendarRule}>{it.rule}</div>
              <div className={styles.calendarNext}>berikutnya: {next.toLocaleDateString('id-ID', DAY)}, 00.00 WIB</div>
              <div className={styles.calendarLast}>
                {it.last ? `terakhir: ${new Date(it.last).toLocaleString('id-ID', STAMP)} · ${it.count} laporan` : 'belum pernah digelar'}
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
