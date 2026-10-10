'use client'

/**
 * Meja sidang rapat project, digambar dengan garis (SVG).
 *
 * Dilihat dari atas: owner di ujung kiri, ketua rapat di ujung kanan, pelapor
 * dan peneliti di sisi atas, pengkritik dan pemantau di sisi bawah. Kursi yang
 * terisi pada rapat terakhir menyala dan memperlihatkan model yang duduk di
 * sana; klik kursi untuk membaca notulennya. Saat rapat sedang digelar, kursi
 * menyala bergiliran.
 *
 * Pemantau bukan model: ia pemeriksa ambang tetap yang berjalan tiap jam.
 * Kursinya ada supaya jelas siapa yang menulis "temuan otomatis".
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MeetingMinute, ProjectReportRow, ReportPeriod } from '@/lib/project/store'
import { IconPlay, IconRadar } from '@/components/icons'
import styles from './meeting-room.module.css'

interface Seat {
  id: string
  title: string
  /** Pusat kursi di ruang SVG 900×460. */
  x: number
  y: number
  /** Arah sandaran: kursi diputar supaya sandarannya membelakangi meja. */
  rotate: number
  labelX: number
  labelY: number
  anchor: 'start' | 'middle' | 'end'
  /** Letak kertas notulen di tepi meja, di depan kursi. */
  paperX: number
  paperY: number
}

const SEATS: Seat[] = [
  { id: 'owner', title: 'Owner', x: 158, y: 230, rotate: -90, labelX: 158, labelY: 292, anchor: 'middle', paperX: 238, paperY: 218 },
  { id: 'pelapor', title: 'Pelapor', x: 360, y: 98, rotate: 0, labelX: 360, labelY: 22, anchor: 'middle', paperX: 343, paperY: 158 },
  { id: 'peneliti', title: 'Peneliti', x: 540, y: 98, rotate: 0, labelX: 540, labelY: 22, anchor: 'middle', paperX: 523, paperY: 158 },
  { id: 'ketua-rapat', title: 'Ketua Rapat', x: 742, y: 230, rotate: 90, labelX: 742, labelY: 292, anchor: 'middle', paperX: 628, paperY: 218 },
  { id: 'pengkritik', title: 'Pengkritik', x: 360, y: 362, rotate: 180, labelX: 360, labelY: 416, anchor: 'middle', paperX: 343, paperY: 278 },
  { id: 'pemantau', title: 'Pemantau', x: 540, y: 362, rotate: 180, labelX: 540, labelY: 416, anchor: 'middle', paperX: 523, paperY: 278 },
]

/** Urutan bicara, untuk animasi giliran saat rapat sedang digelar. */
const SPEAK_ORDER = ['pelapor', 'peneliti', 'pengkritik', 'ketua-rapat']

const PERIOD_BUTTONS: { id: ReportPeriod; label: string }[] = [
  { id: 'harian', label: 'Harian' },
  { id: 'mingguan', label: 'Mingguan' },
  { id: 'bulanan', label: 'Bulanan' },
  { id: 'tahunan', label: 'Tahunan' },
]

function short(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function MeetingTable({
  report,
  reportLabel,
  openIssues,
  pendingProposals,
}: {
  report: ProjectReportRow | null
  reportLabel: string | null
  openIssues: number
  pendingProposals: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null)

  const minutes = useMemo(() => new Map((report?.minutes ?? []).map((m) => [m.role, m])), [report])
  const opened: MeetingMinute | undefined = selected ? minutes.get(selected) : undefined
  const meeting = busy !== null && busy !== 'pantau'

  async function run(payload: Record<string, string>, key: string) {
    setBusy(key)
    setSelected(null)
    setMessage({
      text:
        payload.action === 'rapat'
          ? `Rapat ${payload.period} dibuka — pelapor, peneliti, pengkritik, lalu ketua rapat. Biasanya satu sampai dua menit.`
          : 'Pemantau memeriksa ambang…',
    })
    try {
      const res = await fetch('/api/v1/admin/rapat-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (payload.action === 'rapat') {
        const p = body.proposals as { created?: number[]; reraised?: number[]; updated?: number[] } | undefined
        setMessage({
          text:
            body.status === 'tanpa-rapat'
              ? 'Laporan tersimpan tanpa rapat — semua model sedang tidak bisa dijangkau.'
              : `Rapat selesai. ${p?.created?.length ?? 0} usulan baru di papan, ${p?.reraised?.length ?? 0} diangkat lagi, ${p?.updated?.length ?? 0} progres diperbarui.`,
        })
      } else {
        setMessage({ text: `${body.open} masalah terbuka, ${body.fresh} baru${body.notified ? `, ${body.notified} admin diberi notifikasi` : ''}.` })
      }
      router.refresh()
    } catch (err) {
      setMessage({ text: `Gagal: ${err instanceof Error ? err.message : String(err)}`, bad: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.room} aria-label="Meja sidang rapat project">
      <div className={styles.controls}>
        <span className={styles.controlsLabel}>Gelar rapat sekarang:</span>
        {PERIOD_BUTTONS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy !== null}
            onClick={() => run({ action: 'rapat', period: p.id }, p.id)}
          >
            <IconPlay size={11} /> {busy === p.id ? 'Bersidang…' : p.label}
          </button>
        ))}
        <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => run({ action: 'pantau' }, 'pantau')}>
          <IconRadar size={11} /> {busy === 'pantau' ? 'Memeriksa…' : 'Periksa masalah'}
        </button>
      </div>
      {message && <p className={`${styles.notice} ${message.bad ? styles.noticeBad : ''}`}>{message.text}</p>}

      <svg viewBox="0 0 900 460" className={styles.scene} role="group" aria-label="Denah meja sidang">
        {/* Dinding ruang */}
        <rect x="8" y="8" width="884" height="444" rx="18" className={styles.wall} />

        {/* Meja: tepi luar dan garis tepi daun meja */}
        <rect x="230" y="150" width="440" height="160" rx="16" className={styles.table} />
        <rect x="240" y="160" width="420" height="140" rx="10" className={styles.tableInner} />
        <text x="450" y="222" textAnchor="middle" className={styles.tableTitle}>
          {meeting ? 'RAPAT SEDANG BERLANGSUNG' : reportLabel ? short(reportLabel, 46) : 'Belum ada rapat'}
        </text>
        <text x="450" y="244" textAnchor="middle" className={styles.tableSub}>
          {meeting
            ? 'kursi menyala bergiliran'
            : report
              ? `${report.minutes.length} agen bicara · ${report.actionItems.length} tindakan · ${report.issues.length} temuan`
              : 'gelar rapat pertama dari tombol di atas'}
        </text>

        {SEATS.map((seat) => {
          const minute = minutes.get(seat.id)
          const speakIndex = SPEAK_ORDER.indexOf(seat.id)
          const isAgent = speakIndex !== -1
          const filled = seat.id === 'owner' || seat.id === 'pemantau' || !!minute
          const replaced = !!minute && minute.failovers.length > 0
          const active = selected === seat.id
          const className = [
            styles.seat,
            filled ? styles.seatFilled : styles.seatEmpty,
            active ? styles.seatActive : '',
            meeting && isAgent ? styles.seatSpeaking : '',
            minute ? styles.seatClickable : '',
          ].join(' ')
          const sub =
            seat.id === 'owner'
              ? `${pendingProposals} usulan menunggu`
              : seat.id === 'pemantau'
                ? `tanpa model · ${openIssues} masalah`
                : minute
                  ? short(`${minute.providerId}/${minute.model.split('/').pop()}`, 24)
                  : 'kosong'

          return (
            <g
              key={seat.id}
              className={className}
              style={meeting && isAgent ? { animationDelay: `${speakIndex * 2.5}s` } : undefined}
              onClick={() => minute && setSelected(active ? null : seat.id)}
              role={minute ? 'button' : undefined}
              tabIndex={minute ? 0 : undefined}
              aria-label={minute ? `Notulen ${seat.title}` : undefined}
              onKeyDown={(e) => {
                if (minute && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setSelected(active ? null : seat.id)
                }
              }}
            >
              {/* Kursi: sandaran di sisi luar, dudukan menghadap meja */}
              <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotate})`}>
                <rect x="-34" y="-40" width="68" height="14" rx="6" className={styles.chairBack} />
                <rect x="-30" y="-22" width="60" height="50" rx="10" className={styles.chairSeat} />
                <line x1="-30" y1="-26" x2="-30" y2="-18" className={styles.chairArm} />
                <line x1="30" y1="-26" x2="30" y2="-18" className={styles.chairArm} />
              </g>

              {/* Kertas notulen di depan kursi */}
              {isAgent && (
                <g transform={`translate(${seat.paperX} ${seat.paperY})`} className={minute ? styles.paper : styles.paperEmpty}>
                  <rect width="34" height="24" rx="2" />
                  <line x1="6" y1="7" x2="28" y2="7" />
                  <line x1="6" y1="12" x2="28" y2="12" />
                  <line x1="6" y1="17" x2="20" y2="17" />
                </g>
              )}

              <text x={seat.labelX} y={seat.labelY} textAnchor={seat.anchor} className={styles.seatTitle}>
                {seat.title}
              </text>
              <text x={seat.labelX} y={seat.labelY + 15} textAnchor={seat.anchor} className={styles.seatSub}>
                {sub}
              </text>
              {replaced && (
                <text x={seat.labelX} y={seat.labelY + 29} textAnchor={seat.anchor} className={styles.seatReplaced}>
                  digantikan {minute!.failovers.length}×
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {report?.votes && <AttendanceStrip votes={report.votes} />}

      {opened ? (
        <article className={styles.minute}>
          <header className={styles.minuteHead}>
            <span className={styles.minuteRole}>{opened.title.toUpperCase()}</span>
            <span className={styles.mono}>
              {opened.providerId}/{opened.model}
            </span>
            <span>{(opened.latencyMs / 1000).toFixed(1)} dtk</span>
            <button type="button" className={styles.close} onClick={() => setSelected(null)} aria-label="Tutup notulen">
              ×
            </button>
          </header>
          {opened.failovers.length > 0 && (
            <div className={styles.chain}>
              DIGANTIKAN:{' '}
              {[...opened.failovers.map((f) => `${f.providerId}${f.keyIndex >= 0 ? `#${f.keyIndex}` : ''} ${f.kind}`), opened.providerId].join(' → ')}
            </div>
          )}
          <pre className={styles.minuteBody}>{prettyMinute(opened)}</pre>
        </article>
      ) : (
        report && !meeting && <p className={styles.hint}>Klik kursi yang menyala untuk membaca notulen rapat terakhir.</p>
      )}
    </section>
  )
}

/**
 * Daftar hadir anggota voting: satu kursi kecil per penyedia AI. Yang absen
 * digambar putus-putus dengan alasannya — kuota habis, limit, atau galat.
 */
function AttendanceStrip({ votes }: { votes: NonNullable<ProjectReportRow['votes']> }) {
  const present = votes.attendance.filter((a) => a.hadir).length
  return (
    <div className={styles.attendance}>
      <div className={styles.attendanceHead}>
        Daftar hadir voting · <strong>{present}</strong> hadir, <strong>{votes.attendance.length - present}</strong> absen
      </div>
      <div className={styles.attendanceRow}>
        {votes.attendance.map((a) => (
          <div
            key={a.providerId}
            className={`${styles.member} ${a.hadir ? (a.alasan ? styles.memberInvalid : styles.memberPresent) : styles.memberAbsent}`}
            title={a.hadir ? `${a.name} · ${a.model ?? ''}${a.alasan ? ` · ${a.alasan}` : ''}` : `${a.name} absen: ${a.alasan}`}
          >
            <svg viewBox="0 0 40 40" className={styles.memberChair} aria-hidden="true">
              <rect x="8" y="4" width="24" height="8" rx="3" />
              <rect x="10" y="14" width="20" height="18" rx="5" />
              <line x1="12" y1="32" x2="12" y2="38" />
              <line x1="28" y1="32" x2="28" y2="38" />
            </svg>
            <span className={styles.memberName}>{a.providerId}</span>
            <span className={styles.memberState}>{a.hadir ? (a.alasan ? 'suara tidak sah' : 'hadir') : `absen: ${a.alasan}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Notulen JSON (peneliti, ketua) dirapikan supaya terbaca. */
function prettyMinute(m: MeetingMinute): string {
  if (m.role !== 'peneliti' && m.role !== 'ketua-rapat') return m.content
  try {
    const first = m.content.indexOf('{')
    const last = m.content.lastIndexOf('}')
    return JSON.stringify(JSON.parse(m.content.slice(first, last + 1)), null, 2)
  } catch {
    return m.content
  }
}
