/**
 * Lemari arsip rapat: empat laci bergaris, satu per periode. Laci yang dipilih
 * tertarik keluar, dan map laporannya tampil di bawah lemari. Pemilihnya
 * tautan biasa, jadi laci yang terbuka ikut tersimpan di alamat.
 */

import Link from 'next/link'
import type { ProjectReportRow, ReportPeriod } from '@/lib/project/store'
import { reportLead, reportTitle, WIB } from '@/components/admin/project-format'
import styles from './meeting-room.module.css'

const DRAWERS: ReportPeriod[] = ['harian', 'mingguan', 'bulanan', 'tahunan']

export function ArchiveCabinet({
  reports,
  open,
}: {
  reports: ProjectReportRow[]
  open: ReportPeriod
}) {
  const counts = Object.fromEntries(DRAWERS.map((d) => [d, reports.filter((r) => r.period === d).length])) as Record<ReportPeriod, number>
  const folders = reports.filter((r) => r.period === open)

  return (
    <section className={styles.cabinetWrap} id="lemari" aria-label="Lemari arsip rapat">
      <svg viewBox="0 0 360 330" className={styles.cabinet} role="group" aria-label="Laci arsip per periode">
        {/* Badan lemari, alas, dan kaki */}
        <rect x="40" y="10" width="280" height="296" rx="8" className={styles.art} />
        <line x1="40" y1="306" x2="320" y2="306" className={styles.art} />
        <line x1="60" y1="306" x2="60" y2="320" className={styles.art} />
        <line x1="300" y1="306" x2="300" y2="320" className={styles.art} />

        {DRAWERS.map((d, i) => {
          const y = 22 + i * 71
          const isOpen = d === open
          // Laci yang terbuka digambar tertarik keluar ke kiri, sedikit lebih lebar.
          const dx = isOpen ? -26 : 0
          return (
            <Link key={d} href={`/admin/rapat-project?laci=${d}#lemari`} aria-label={`Laci ${d}, ${counts[d]} laporan`}>
              <g className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}>
                <rect x={54 + dx} y={y} width={252 - dx} height="60" rx="5" className={styles.drawerFront} />
                {isOpen && (
                  <>
                    {/* Map yang menyembul dari laci terbuka */}
                    <path d={`M${70 + dx} ${y} l6 -10 h40 l6 10`} className={styles.artAccent} />
                    <path d={`M${128 + dx} ${y} l6 -8 h34 l6 8`} className={styles.artAccent} />
                  </>
                )}
                <rect x={150 + dx / 2} y={y + 36} width="60" height="10" rx="5" className={styles.drawerHandle} />
                <rect x={78 + dx} y={y + 10} width="88" height="20" rx="2" className={styles.drawerLabel} />
                <text x={122 + dx} y={y + 24} textAnchor="middle" className={styles.drawerText}>
                  {d.toUpperCase()}
                </text>
                <text x={290} y={y + 25} textAnchor="end" className={styles.drawerCount}>
                  {counts[d]} map
                </text>
              </g>
            </Link>
          )
        })}
      </svg>

      <div className={styles.folders}>
        <div className={styles.foldersHead}>
          Laci <strong>{open}</strong> · {folders.length} laporan
        </div>
        {folders.length === 0 ? (
          <p className={styles.boardEmpty}>Laci ini masih kosong.</p>
        ) : (
          <div className={styles.folderGrid}>
            {folders.map((r) => {
              const urgent = r.issues.filter((i) => i.severity === 'mendesak').length
              return (
                <Link key={r.id} href={`/admin/rapat-project/${r.id}`} className={styles.folder}>
                  <span className={styles.folderTab}>#{r.id}</span>
                  <span className={styles.folderTitle}>{reportTitle(r)}</span>
                  <span className={styles.folderLead}>{reportLead(r)}</span>
                  <span className={styles.folderMeta}>
                    {new Date(r.createdAt).toLocaleString('id-ID', WIB)} · {r.trigger === 'jadwal' ? 'terjadwal' : 'dadakan'}
                    {urgent ? ` · ${urgent} mendesak` : ''}
                    {r.status === 'tanpa-rapat' ? ' · tanpa rapat' : ''}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
