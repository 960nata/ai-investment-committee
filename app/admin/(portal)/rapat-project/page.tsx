/**
 * Rapat project: peringatan mendesak yang sedang terbuka, tombol rapat dadakan,
 * dan arsip laporan harian, mingguan, dan bulanan dari agen AI.
 */

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-auth'
import { IconAlert, IconCourt } from '@/components/icons'
import { ProjectActions } from '@/components/admin/project-actions'
import { listAlerts, listReports, REPORT_PERIODS, type ProjectAlertRow, type ProjectReportRow, type ReportPeriod } from '@/lib/project/store'
import styles from '@/components/admin/project.module.css'
import { reportLead, reportTitle, WIB } from '@/components/admin/project-format'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Rapat Project — Admin AI Investdesk',
  description: 'Laporan harian, mingguan, dan bulanan dari rapat agen AI, beserta peringatan mendesak.',
}

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ProjectMeetingPage({ searchParams }: Props) {
  await requireAdmin()
  const requested = (await searchParams).period
  const period = REPORT_PERIODS.includes(requested as ReportPeriod) ? (requested as ReportPeriod) : null

  let alerts: ProjectAlertRow[] = []
  let reports: ProjectReportRow[] = []
  let error: string | null = null
  try {
    ;[alerts, reports] = await Promise.all([listAlerts(false), listReports(period, 36)])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  const urgent = alerts.filter((a) => a.severity === 'mendesak').length

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconCourt size={13} />
            <span>RAPAT PROJECT · AGEN AI</span>
          </div>
          <h1 className="admin-page-headline">
            Rapat <span className="admin-headline-accent">Project</span>
          </h1>
          <p className="admin-page-standfirst">
            Pelapor menyusun laporan dari angka basis data, pengkritik menyerang dan memberi saran, ketua rapat memutuskan
            tindak lanjut — tiap peran dari keluarga model berbeda. Laporan harian tiap tengah malam WIB, mingguan tiap
            Senin, bulanan tiap tanggal 1. Pemantau masalah berjalan tiap jam tanpa model.
          </p>
        </div>
      </div>

      <ProjectActions />
      {error && <p className={`${styles.notice} ${styles.noticeBad}`}>Data rapat gagal dimuat: {error}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <IconAlert size={14} /> Masalah terbuka ({alerts.length}
          {urgent ? `, ${urgent} mendesak` : ''})
        </h2>
        {alerts.length === 0 ? (
          <p className={styles.empty}>Tidak ada masalah terbuka. Pemantau terakhir tidak menemukan apa pun yang melewati ambang.</p>
        ) : (
          <div className={styles.alerts}>
            {alerts.map((a) => (
              <div key={a.id} className={`${styles.alert} ${styles[`alert_${a.severity}`]}`}>
                <span className={styles.alertSev}>{a.severity.toUpperCase()}</span>
                <span className={styles.alertTitle}>{a.title}</span>
                <span className={styles.alertTime}>sejak {new Date(a.firstSeen).toLocaleString('id-ID', WIB)}</span>
                <span className={styles.alertDetail}>{a.detail}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Arsip laporan</h2>
        <nav className={styles.tabs} aria-label="Periode laporan">
          <Link href="/admin/rapat-project" className={`${styles.tab} ${!period ? styles.tabActive : ''}`}>
            Semua
          </Link>
          {REPORT_PERIODS.map((p) => (
            <Link key={p} href={`/admin/rapat-project?period=${p}`} className={`${styles.tab} ${period === p ? styles.tabActive : ''}`}>
              {p}
            </Link>
          ))}
          <Link href="/admin/keuangan" className={styles.tab}>
            Buku kas →
          </Link>
        </nav>
        {reports.length === 0 ? (
          <p className={styles.empty}>Belum ada laporan. Gelar rapat dadakan di atas, atau tunggu jadwal tengah malam WIB.</p>
        ) : (
          <div className={styles.reports}>
            {reports.map((r) => {
              const urgentIssues = r.issues.filter((i) => i.severity === 'mendesak').length
              return (
                <Link key={r.id} href={`/admin/rapat-project/${r.id}`} className={styles.report}>
                  <div className={styles.reportHead}>
                    <span>#{r.id} · {r.trigger}</span>
                    <span>{new Date(r.createdAt).toLocaleString('id-ID', WIB)}</span>
                  </div>
                  <div className={styles.reportTitle}>{reportTitle(r)}</div>
                  <div className={styles.reportLead}>{reportLead(r)}</div>
                  <div className={styles.pills}>
                    {urgentIssues > 0 && <span className={`${styles.pill} ${styles.pillBad}`}>{urgentIssues} mendesak</span>}
                    {r.issues.length - urgentIssues > 0 && (
                      <span className={`${styles.pill} ${styles.pillWarn}`}>{r.issues.length - urgentIssues} perhatian</span>
                    )}
                    {r.status === 'tanpa-rapat' ? (
                      <span className={`${styles.pill} ${styles.pillWarn}`}>tanpa rapat</span>
                    ) : (
                      <span className={`${styles.pill} ${styles.pillOk}`}>{r.minutes.length} agen bicara</span>
                    )}
                    {r.actionItems.length > 0 && <span className={styles.pill}>{r.actionItems.length} tindakan</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
