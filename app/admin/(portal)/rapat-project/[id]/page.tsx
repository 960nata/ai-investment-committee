import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-auth'
import { getReport } from '@/lib/project/store'
import { proposalsForReport, type Proposal } from '@/lib/project/proposals'
import { isMissing, type ProjectMetrics } from '@/lib/project/metrics'
import styles from '@/components/admin/project.module.css'
import { reportTitle, rupiah, WIB } from '@/components/admin/project-format'
import { ReportLetter } from '@/components/admin/meeting-room/report-letter'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Laporan Rapat Project — Admin AI Investdesk' }

export default async function ProjectReportDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const report = await getReport(id)
  if (!report) notFound()
  const proposals: Proposal[] = await proposalsForReport(id).catch(() => [])

  const m = report.metrics as unknown as ProjectMetrics

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <Link href="/admin/rapat-project" className={styles.tab} style={{ alignSelf: 'flex-start' }}>
        ← Rapat project
      </Link>
      <div>
        <div className={styles.muted}>
          Laporan #{report.id} · {report.trigger === 'jadwal' ? 'terjadwal' : 'rapat dadakan'} · dibuat{' '}
          {new Date(report.createdAt).toLocaleString('id-ID', WIB)}
        </div>
        <h1 className="admin-page-headline">{reportTitle(report)}</h1>
      </div>

      <ReportLetter report={report} />

      <h2 className={styles.sectionTitle}>Berkas data rapat</h2>
      <KeyNumbers m={m} />

      {report.issues.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Temuan otomatis</h2>
          <div className={styles.alerts}>
            {report.issues.map((i) => (
              <div key={i.key} className={`${styles.alert} ${styles[`alert_${i.severity}`]}`}>
                <span className={styles.alertSev}>{i.severity.toUpperCase()}</span>
                <span className={styles.alertTitle}>{i.title}</span>
                <span />
                <span className={styles.alertDetail}>{i.detail}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.actionItems.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tindak lanjut keputusan rapat</h2>
          <ul className={styles.todo}>
            {report.actionItems.map((a, i) => (
              <li key={i} className={a.startsWith('[MENDESAK]') ? styles.todoUrgent : ''}>
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.votes && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Daftar hadir voting · {report.votes.attendance.filter((a) => a.hadir).length} hadir,{' '}
            {report.votes.attendance.filter((a) => !a.hadir).length} absen
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Anggota</th>
                  <th>Model</th>
                  <th>Kehadiran</th>
                  <th className={styles.num}>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {report.votes.attendance.map((a) => (
                  <tr key={a.providerId}>
                    <td className={styles.mono}>{a.providerId}</td>
                    <td className={styles.muted}>{a.model ?? '—'}</td>
                    <td className={a.hadir ? (a.alasan ? styles.down : styles.up) : styles.down}>
                      {a.hadir ? (a.alasan ? `hadir — ${a.alasan}` : 'hadir') : `absen — ${a.alasan}`}
                    </td>
                    <td className={styles.num}>{a.latencyMs ? `${(a.latencyMs / 1000).toFixed(1)} dtk` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {proposals.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Usulan dari rapat ini</h2>
          <ul className={styles.todo}>
            {proposals.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>#{p.id} {p.title}</strong> — {p.status}
                  {p.votes ? ` · voting ${p.votes.setuju} setuju / ${p.votes.tolak} tolak / ${p.votes.abstain} abstain / ${p.votes.absen} absen` : ''}
                  <br />
                  <span className={styles.muted}>{p.proposal}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>Putuskan usulan di papan ceklis pada halaman Rapat Project.</p>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Notulen rapat</h2>
        {report.note && <p className={`${styles.notice} ${styles.noticeBad}`}>{report.note}</p>}
        {report.minutes.length === 0 && <p className={styles.empty}>Tidak ada agen yang bicara pada rapat ini.</p>}
        {report.minutes.map((minute) => (
          <article key={minute.role} className={styles.minute}>
            <header className={styles.minuteHead}>
              <span className={styles.minuteRole}>{minute.title.toUpperCase()}</span>
              <span className={styles.mono}>
                {minute.providerId}/{minute.model}
              </span>
              <span>{(minute.latencyMs / 1000).toFixed(1)} dtk</span>
            </header>
            {minute.failovers.length > 0 && (
              <div className={styles.chain}>
                DIGANTIKAN:{' '}
                {[...minute.failovers.map((f) => `${f.providerId}${f.keyIndex >= 0 ? `#${f.keyIndex}` : ''} ${f.kind}`), minute.providerId].join(' → ')}
              </div>
            )}
            <pre className={styles.minuteBody}>{minute.role === 'ketua-rapat' ? prettyJson(minute.content) : minute.content}</pre>
          </article>
        ))}
      </section>

      {!isMissing(m.keuangan) && m.keuangan.rincian.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Rincian dana periode ini</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Kategori</th>
                  <th className={styles.num}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {m.keuangan.rincian.map((r) => (
                  <tr key={`${r.jenis}-${r.kategori}`}>
                    <td>{r.jenis}</td>
                    <td>{r.kategori}</td>
                    <td className={`${styles.num} ${r.jenis === 'masuk' ? styles.up : styles.down}`}>{rupiah(r.jumlah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details>
        <summary className={styles.rawSummary}>Data mentah yang dibaca agen</summary>
        <pre className={styles.raw}>{JSON.stringify(report.metrics, null, 2)}</pre>
      </details>
    </div>
  )
}

function prettyJson(raw: string): string {
  try {
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    return JSON.stringify(JSON.parse(raw.slice(first, last + 1)), null, 2)
  } catch {
    return raw
  }
}

function change(now: number, prev: number): { text: string; up: boolean } | null {
  if (!prev) return null
  const pct = Math.round((now / prev - 1) * 100)
  return { text: `${pct >= 0 ? '+' : ''}${pct}% dari periode sebelumnya`, up: pct >= 0 }
}

function KeyNumbers({ m }: { m: ProjectMetrics }) {
  const cards: { label: string; value: string; note?: string; tone?: 'up' | 'down' }[] = []
  const na = 'tidak tersedia'

  if (isMissing(m.pengunjung)) cards.push({ label: 'Tayangan', value: na })
  else {
    const c = change(m.pengunjung.tayangan, m.pengunjung.tayanganSebelumnya)
    cards.push({ label: 'Tayangan', value: m.pengunjung.tayangan.toLocaleString('id-ID'), note: c?.text, tone: c ? (c.up ? 'up' : 'down') : undefined })
    cards.push({ label: 'Pengunjung unik', value: m.pengunjung.pengunjungUnik.toLocaleString('id-ID') })
  }
  if (!isMissing(m.pengguna)) {
    cards.push({ label: 'Pengguna baru', value: String(m.pengguna.baru), note: `${m.pengguna.total} total · ${m.pengguna.premiumAktif} premium` })
  }
  if (!isMissing(m.komite)) {
    cards.push({
      label: 'Sidang komite',
      value: String(m.komite.sidang),
      note: `${m.komite.gagal} gagal · ${m.komite.giliranDigantikan} giliran digantikan`,
      tone: m.komite.gagal > 0 ? 'down' : undefined,
    })
  }
  if (!isMissing(m.warta)) cards.push({ label: 'Warta terbit', value: String(m.warta.terbit), note: `${m.warta.dibaca} kali dibaca` })
  if (!isMissing(m.ai)) cards.push({ label: 'Token AI', value: m.ai.token.toLocaleString('id-ID'), note: `${m.ai.panggilanTercatat} panggilan tercatat` })
  if (!isMissing(m.job)) {
    cards.push({ label: 'Job', value: `${m.job.sukses}/${m.job.total}`, note: `${m.job.gagal} gagal`, tone: m.job.gagal > 0 ? 'down' : undefined })
  }
  if (!isMissing(m.keuangan)) {
    cards.push({ label: 'Pemasukan', value: rupiah(m.keuangan.masuk), tone: 'up' })
    cards.push({ label: 'Pengeluaran', value: rupiah(m.keuangan.keluar), tone: 'down' })
    cards.push({ label: 'Saldo kas', value: rupiah(m.keuangan.saldoKeseluruhan), note: 'seluruh waktu' })
  }

  return (
    <div className={styles.stats}>
      {cards.map((c) => (
        <div key={c.label} className={styles.stat}>
          <div className={styles.statLabel}>{c.label}</div>
          <div className={`${styles.statValue} ${c.tone ? styles[c.tone] : ''}`}>{c.value}</div>
          {c.note && <div className={styles.statNote}>{c.note}</div>}
        </div>
      ))}
    </div>
  )
}
