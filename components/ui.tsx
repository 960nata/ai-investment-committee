/**
 * Bagian antarmuka yang dipakai berulang.
 *
 * Yang terpenting di sini adalah `Track`, elemen tanda tangan produk ini.
 * Bentuknya sederet coretan, sebagian menyala dan sisanya redup, dan ia selalu
 * menjawab dua pertanyaan sekaligus: berapa nilainya, dan seberapa lengkap
 * dasarnya. Kedua pertanyaan itu memang selalu berpasangan di sistem ini —
 * probabilitas tanpa confidence menyesatkan, dan angka tanpa jumlah sampel
 * tidak layak dipercaya. Nanti bentuk yang sama dipakai untuk menampilkan
 * peluang beserta tingkat keyakinannya.
 */

import { IconAlert } from './icons'

export type State = 'ok' | 'degraded' | 'halted' | 'unknown'

interface TrackProps {
  /** Nilai 0..1. Null berarti belum terukur, dan itu digambar berbeda dari nol. */
  value: number | null
  state?: State
  ticks?: number
  label?: string
}

export function Track({ value, state = 'ok', ticks = 20, label }: TrackProps) {
  // Nilai yang belum ada digambar sebagai jalur kosong, bukan jalur nol persen.
  // Keduanya terlihat mirip kalau tidak dibedakan, padahal artinya berlawanan.
  const filled = value === null ? 0 : Math.round(Math.min(1, Math.max(0, value)) * ticks)
  const resolved: State = value === null ? 'unknown' : state

  return (
    <div
      className="track"
      data-state={resolved}
      role="img"
      aria-label={label ?? (value === null ? 'belum terukur' : `${Math.round(value * 100)} persen`)}
    >
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={`track-tick${i < filled ? ' on' : ''}`} />
      ))}
    </div>
  )
}

export function Lamp({ state }: { state: State }) {
  const className = state === 'ok' ? 'ok' : state === 'degraded' ? 'warn' : state === 'halted' ? 'down' : ''
  return <span className={`lamp ${className}`.trim()} />
}

export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'down' | 'signal'
  children: React.ReactNode
}) {
  return <span className={tone === 'neutral' ? 'tag' : `tag ${tone}`}>{children}</span>
}

export function Blank({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="blank">
      {icon}
      <div className="blank-title">{title}</div>
      {children && <p className="blank-body">{children}</p>}
    </div>
  )
}

/**
 * Pemberitahuan basis data tidak terjangkau.
 *
 * Isinya memberi langkah yang bisa dikerjakan, bukan sekadar mengabarkan bahwa
 * ada yang salah. Rincian teknisnya hanya muncul di luar produksi: pesan galat
 * Postgres memuat nama tabel dan potongan kueri, dan itu peta bagian dalam
 * sistem yang tidak perlu diberikan kepada pengunjung.
 */
export function DatabaseNotice({ detail }: { detail: string }) {
  const showDetail = process.env.NODE_ENV !== 'production'

  return (
    <div className="notice">
      <IconAlert size={18} />
      <div>
        <div className="notice-title">Basis data tidak terjangkau</div>
        <p className="notice-body">
          Jalankan <code>npm run db:setup</code>. Perintah itu memeriksa sambungan,
          membuat tabel yang belum ada, menyelaraskan jurnal migrasi, lalu mengisi
          jadwal dan instrumen awal.
        </p>
        <p className="notice-body" style={{ color: 'var(--ink-mute)' }}>
          Kalau sambungannya sendiri yang gagal, isi <code>DATABASE_URL</code> dan{' '}
          <code>DIRECT_URL</code> di <code>.env</code> lebih dulu.
        </p>
        {showDetail && (
          <p className="notice-body" style={{ color: 'var(--ink-mute)' }}>
            <code>{detail}</code>
          </p>
        )}
      </div>
    </div>
  )
}
