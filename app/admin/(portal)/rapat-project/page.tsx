/**
 * Ruang rapat project: meja sidang agen AI, papan ceklis usulan untuk owner,
 * papan jadwal rapat, dan lemari arsip laporan.
 */

import { requireAdmin } from '@/lib/auth/admin-auth'
import { IconAlert, IconCourt } from '@/components/icons'
import { MeetingTable } from '@/components/admin/meeting-room/meeting-table'
import { ChecklistBoard } from '@/components/admin/meeting-room/checklist-board'
import { ScheduleBoard, type ScheduleItem } from '@/components/admin/meeting-room/schedule-board'
import { ArchiveCabinet } from '@/components/admin/meeting-room/archive-cabinet'
import { listAlerts, listReports, REPORT_PERIODS, type ProjectAlertRow, type ProjectReportRow, type ReportPeriod } from '@/lib/project/store'
import { listProposals, type Proposal } from '@/lib/project/proposals'
import { nextScheduledAt } from '@/lib/project/meeting'
import styles from '@/components/admin/project.module.css'
import { reportTitle, WIB } from '@/components/admin/project-format'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Rapat Project — Admin AI Investdesk',
  description: 'Meja sidang agen AI, papan usulan perbaikan, jadwal rapat, dan arsip laporan.',
}

const RULES: Record<ReportPeriod, string> = {
  harian: 'Tiap hari, membahas hari kemarin',
  mingguan: 'Tiap Senin, membahas pekan lalu',
  bulanan: 'Tiap tanggal 1, membahas bulan lalu',
  tahunan: 'Tiap 1 Januari, membahas tahun lalu',
}

interface Props {
  searchParams: Promise<{ laci?: string }>
}

export default async function ProjectMeetingPage({ searchParams }: Props) {
  await requireAdmin()
  const requested = (await searchParams).laci
  const drawer = REPORT_PERIODS.includes(requested as ReportPeriod) ? (requested as ReportPeriod) : 'harian'

  let alerts: ProjectAlertRow[] = []
  let reports: ProjectReportRow[] = []
  let proposals: Proposal[] = []
  let error: string | null = null
  try {
    ;[alerts, reports, proposals] = await Promise.all([listAlerts(false), listReports(null, 400), listProposals(null, 200)])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const latest = reports[0] ?? null
  const urgent = alerts.filter((a) => a.severity === 'mendesak').length
  const pending = proposals.filter((p) => p.status === 'menunggu').length
  const now = new Date()
  const schedule: ScheduleItem[] = REPORT_PERIODS.map((period) => {
    const mine = reports.filter((r) => r.period === period)
    return {
      period,
      rule: RULES[period],
      next: nextScheduledAt(period, now).toISOString(),
      last: mine[0]?.createdAt ?? null,
      count: mine.length,
    }
  })

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconCourt size={13} />
            <span>RUANG RAPAT PROJECT · AGEN AI</span>
          </div>
          <h1 className="admin-page-headline">
            Rapat <span className="admin-headline-accent">Project</span>
          </h1>
          <p className="admin-page-standfirst">
            Pelapor membaca angka, peneliti menggali penyebab dan merancang perbaikan, pengkritik mengujinya, seluruh
            penyedia AI memberi suara, lalu ketua rapat memutuskan. Usulan yang lolos naik ke papan — keputusannya di
            tangan owner.
          </p>
        </div>
      </div>

      {error && <p className={`${styles.notice} ${styles.noticeBad}`}>Data rapat gagal dimuat: {error}</p>}

      {alerts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <IconAlert size={14} /> Masalah terbuka ({alerts.length}
            {urgent ? `, ${urgent} mendesak` : ''})
          </h2>
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
        </section>
      )}

      <div className={styles.roomGrid}>
        <MeetingTable
          report={latest}
          reportLabel={latest ? reportTitle(latest) : null}
          openIssues={alerts.length}
          pendingProposals={pending}
        />
        <ChecklistBoard proposals={proposals} now={now.getTime()} />
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Jadwal rapat</h2>
        <ScheduleBoard items={schedule} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Lemari arsip</h2>
        <ArchiveCabinet reports={reports} open={drawer} />
      </section>
    </div>
  )
}
