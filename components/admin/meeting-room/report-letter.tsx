/**
 * Laporan rapat project dalam bentuk surat resmi: kop, nomor, perihal, isi,
 * keputusan, hasil voting, lalu tanda tangan ketua rapat dengan stempel.
 *
 * Murni presentasi — dipakai popup surat di lemari arsip dan halaman berkas
 * lengkap. Isi suratnya disusun dari notulen: ringkasan dan temuan dari
 * pelapor, kesimpulan dan tindakan dari keputusan ketua.
 */

import type { ProjectReportRow } from '@/lib/project/store'
import { parseDecision } from '@/lib/project/decision'
import styles from './report-letter.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const LONG: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }
const STAMP_TIME: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }

/** "LABEL: isi" per baris, label boleh berulang (CAPAIAN, MASALAH). */
function sections(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  let current: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([A-Z][A-Z &/]{2,30}):\s*(.*)$/)
    if (m) {
      current = m[1].trim()
      if (m[2]) map.set(current, [...(map.get(current) ?? []), m[2]])
    } else if (current) {
      map.set(current, [...(map.get(current) ?? []), line.replace(/^[-•*]\s*/, '')])
    }
  }
  return map
}

export function letterNumber(r: Pick<ProjectReportRow, 'id' | 'createdAt'>): string {
  const d = new Date(new Date(r.createdAt).getTime() + 7 * 3_600_000)
  return `${String(r.id).padStart(3, '0')}/RP-AI/${ROMAN[d.getUTCMonth()]}/${d.getUTCFullYear()}`
}

export function ReportLetter({ report, detailHref }: { report: ProjectReportRow; detailHref?: string }) {
  const pelapor = report.minutes.find((m) => m.role === 'pelapor')
  const ketua = report.minutes.find((m) => m.role === 'ketua-rapat')
  const decision = ketua ? parseDecision(ketua.content) : null
  const parts = pelapor ? sections(pelapor.content) : new Map<string, string[]>()
  const urgent = report.issues.some((i) => i.severity === 'mendesak') || report.actionItems.some((a) => a.startsWith('[MENDESAK]'))
  const from = new Date(report.periodStart).toLocaleDateString('id-ID', LONG)
  const to = new Date(new Date(report.periodEnd).getTime() - 1).toLocaleDateString('id-ID', LONG)
  const span = from === to ? from : `${from} s.d. ${to}`
  const created = new Date(report.createdAt)
  const present = report.votes?.attendance.filter((a) => a.hadir).length ?? 0

  return (
    <article className={styles.paper}>
      {/* Kop surat */}
      <header className={styles.kop}>
        <svg viewBox="0 0 48 48" className={styles.kopMark} aria-hidden="true">
          <circle cx="24" cy="24" r="21" />
          <path d="M12 30 L20 22 L26 27 L36 16" />
          <path d="M31 16 H36 V21" />
        </svg>
        <div className={styles.kopText}>
          <div className={styles.kopTitle}>AI INVESTDESK</div>
          <div className={styles.kopSub}>Rapat Project · Dewan Agen Kecerdasan Buatan</div>
          <div className={styles.kopAddr}>Ruang Rapat Daring · disusun otomatis dari basis data project</div>
        </div>
      </header>
      <div className={styles.kopRule} />

      <table className={styles.meta}>
        <tbody>
          <tr>
            <td>Nomor</td>
            <td>: {letterNumber(report)}</td>
            <td className={styles.metaDate}>{created.toLocaleDateString('id-ID', LONG)}</td>
          </tr>
          <tr>
            <td>Sifat</td>
            <td colSpan={2}>
              : <span className={urgent ? styles.urgent : undefined}>{urgent ? 'Mendesak' : 'Biasa'}</span>
              {report.trigger === 'manual' ? ' · rapat dadakan' : ' · rapat terjadwal'}
            </td>
          </tr>
          <tr>
            <td>Lampiran</td>
            <td colSpan={2}>
              : {report.issues.length} temuan, {report.actionItems.length} tindakan
              {report.votes ? `, hasil voting ${report.votes.tallies.length} usulan` : ''}
            </td>
          </tr>
          <tr>
            <td>Perihal</td>
            <td colSpan={2}>
              : <strong>Laporan {report.period} rapat project</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <p className={styles.to}>
        Kepada Yth.
        <br />
        <strong>Owner AI Investdesk</strong>
        <br />
        di tempat
      </p>

      <p>Dengan hormat,</p>
      <p>
        Bersama surat ini kami sampaikan hasil rapat project untuk periode <strong>{span}</strong>, yang digelar pada pukul{' '}
        {created.toLocaleTimeString('id-ID', STAMP_TIME).replace('.', ':')} WIB oleh {report.minutes.length} agen
        {report.votes ? ` dan ${present} anggota voting` : ''}.
      </p>

      {report.status === 'tanpa-rapat' && (
        <p className={styles.notice}>{report.note ?? 'Rapat tidak digelar; surat ini hanya memuat angka dan temuan otomatis.'}</p>
      )}

      {parts.get('RINGKASAN') && (
        <>
          <h3 className={styles.h}>I. Ringkasan</h3>
          <p>{parts.get('RINGKASAN')!.join(' ')}</p>
        </>
      )}

      {(parts.get('CAPAIAN')?.length || parts.get('MASALAH')?.length) && (
        <>
          <h3 className={styles.h}>II. Keadaan project</h3>
          {parts.get('CAPAIAN')?.length ? (
            <>
              <p className={styles.sub}>Yang berjalan baik:</p>
              <ol className={styles.list}>
                {parts.get('CAPAIAN')!.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </>
          ) : null}
          {parts.get('MASALAH')?.length ? (
            <>
              <p className={styles.sub}>Yang perlu perhatian:</p>
              <ol className={styles.list}>
                {parts.get('MASALAH')!.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </>
          ) : null}
          {(['PENGUNJUNG', 'AI', 'KEUANGAN', 'PERHATIAN'] as const).map((k) =>
            parts.get(k) ? (
              <p key={k}>
                <em>{k.charAt(0) + k.slice(1).toLowerCase()}:</em> {parts.get(k)!.join(' ')}
              </p>
            ) : null,
          )}
        </>
      )}

      {report.issues.length > 0 && (
        <>
          <h3 className={styles.h}>III. Temuan pemantau otomatis</h3>
          <ol className={styles.list}>
            {report.issues.map((i) => (
              <li key={i.key}>
                <span className={i.severity === 'mendesak' ? styles.urgent : styles.warn}>[{i.severity}]</span> {i.title} — {i.detail}
              </li>
            ))}
          </ol>
        </>
      )}

      {(decision || report.actionItems.length > 0) && (
        <>
          <h3 className={styles.h}>IV. Keputusan rapat</h3>
          {decision?.kesimpulan && <p>{decision.kesimpulan}</p>}
          {report.actionItems.length > 0 && (
            <>
              <p className={styles.sub}>Tindak lanjut yang diputuskan:</p>
              <ol className={styles.list}>
                {report.actionItems.map((a, i) => (
                  <li key={i} className={a.startsWith('[MENDESAK]') ? styles.urgentItem : undefined}>
                    {a.replace('[MENDESAK] ', '')}
                    {a.startsWith('[MENDESAK]') && <span className={styles.urgentTag}> mendesak</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}

      {report.votes && (
        <>
          <h3 className={styles.h}>V. Hasil voting usulan</h3>
          <p>
            Hadir {present} dari {report.votes.attendance.length} anggota.
            {report.votes.attendance.some((a) => !a.hadir) &&
              ` Absen: ${report.votes.attendance
                .filter((a) => !a.hadir)
                .map((a) => `${a.providerId} (${a.alasan})`)
                .join(', ')}.`}
          </p>
          <ol className={styles.list}>
            {report.votes.tallies.map((t) => (
              <li key={t.no}>
                Usulan {t.no}: {t.setuju} setuju, {t.tolak} tolak, {t.abstain} abstain
                {decision?.dibuang.includes(t.no) ? ' — dibuang ketua rapat' : ' — diajukan ke owner'}
              </li>
            ))}
          </ol>
        </>
      )}

      <p>Demikian laporan ini kami sampaikan. Atas perhatian dan keputusan Owner, kami ucapkan terima kasih.</p>

      {/* Tanda tangan dan stempel */}
      <footer className={styles.sign}>
        <div className={styles.signBlock}>
          <div>Hormat kami,</div>
          <div>Ketua Rapat</div>
          <div className={styles.signArea}>
            <svg viewBox="0 0 120 120" className={styles.stamp} aria-hidden="true">
              <circle cx="60" cy="60" r="54" />
              <circle cx="60" cy="60" r="44" />
              <path id={`stamp-arc-${report.id}`} d="M 22 60 A 38 38 0 0 1 98 60" fill="none" stroke="none" />
              <text>
                <textPath href={`#stamp-arc-${report.id}`} startOffset="50%" textAnchor="middle">
                  RAPAT PROJECT
                </textPath>
              </text>
              <text x="60" y="66" textAnchor="middle" className={styles.stampMid}>
                AI
              </text>
              <text x="60" y="88" textAnchor="middle" className={styles.stampSmall}>
                DISAHKAN
              </text>
            </svg>
            <svg viewBox="0 0 160 50" className={styles.signature} aria-hidden="true">
              <path d="M6 34 C 22 6, 30 46, 44 22 S 64 10, 70 30 S 92 40, 104 18 S 128 26, 152 20" />
            </svg>
          </div>
          <div className={styles.signName}>{ketua ? `${ketua.providerId}/${ketua.model.split('/').pop()}` : '—'}</div>
        </div>
      </footer>

      {report.minutes.length > 0 && (
        <details className={styles.annex}>
          <summary>Lampiran: notulen lengkap ({report.minutes.length} agen)</summary>
          {report.minutes.map((m) => (
            <section key={m.role} className={styles.annexItem}>
              <div className={styles.annexHead}>
                {m.title} — {m.providerId}/{m.model}
              </div>
              <pre>{m.content}</pre>
            </section>
          ))}
        </details>
      )}

      {detailHref && (
        <a href={detailHref} className={styles.more}>
          Buka berkas lengkap →
        </a>
      )}
    </article>
  )
}
