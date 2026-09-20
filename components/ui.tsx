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
 * Rangka Muat (Skeleton Loaders)
 * Monokromatik slate, tenang, elegan, konsisten dengan palet cockpit gelap.
 */

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({
  width = '100%',
  height = '16px',
  radius = '2px',
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

/** Skeleton untuk Kartu Pemilih Instrumen (Kotak-kotak sesuai grid instrumen) */
export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Skeleton width={52} height={14} radius={2} />
        <Skeleton width={38} height={12} radius={2} />
      </div>
      <Skeleton width="80%" height={11} radius={2} style={{ margin: '2px 0' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
        <Skeleton width={68} height={13} radius={2} />
        <Skeleton width={44} height={10} radius={1} />
      </div>
    </div>
  )
}

/** Skeleton untuk Area Grafik Candlestick */
export function SkeletonChart() {
  const heights = [40, 65, 55, 80, 45, 90, 70, 85, 60, 95, 75, 50, 80, 65, 90, 70]
  return (
    <div className="skeleton-chart-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Skeleton width={70} height={15} radius={2} />
          <Skeleton width={120} height={12} radius={2} />
          <Skeleton width={65} height={15} radius={2} />
        </div>
        <Skeleton width={80} height={12} radius={2} />
      </div>
      <div className="skeleton-chart-candles">
        {heights.map((h, idx) => (
          <div
            key={idx}
            className="skeleton-candle-bar"
            style={{
              height: `${h}%`,
              opacity: 0.35 + (idx % 3) * 0.2,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
        <Skeleton width={48} height={10} radius={1} />
        <Skeleton width={48} height={10} radius={1} />
        <Skeleton width={48} height={10} radius={1} />
        <Skeleton width={48} height={10} radius={1} />
        <Skeleton width={48} height={10} radius={1} />
      </div>
    </div>
  )
}

/** Skeleton untuk Ruang Sidang AI Komite Investasi */
export function SkeletonBoardroom() {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface-1)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {/* Header Sidang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Skeleton width={110} height={10} radius={2} />
          <Skeleton width={220} height={18} radius={2} />
          <Skeleton width={280} height={11} radius={2} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Skeleton width={100} height={28} radius="var(--radius)" />
          <Skeleton width={85} height={28} radius="var(--radius)" />
        </div>
      </div>

      {/* Banner Putusan Konsensus */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width={150} height={20} radius={2} />
          <Skeleton width={100} height={14} radius={2} />
        </div>
        <Skeleton width="100%" height={11} radius={1} />
        <Skeleton width="90%" height={11} radius={1} />
        <Skeleton width="75%" height={11} radius={1} />
      </div>

      {/* Grid 4 Agen Debat */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Skeleton width={20} height={20} radius={2} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <Skeleton width="65%" height={11} radius={2} />
                <Skeleton width="45%" height={9} radius={1} />
              </div>
            </div>
            <Skeleton width="100%" height={10} radius={1} style={{ marginTop: 4 }} />
            <Skeleton width="92%" height={10} radius={1} />
            <Skeleton width="80%" height={10} radius={1} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton untuk Berita & Artikel */
export function SkeletonNews() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface-1)',
        border: '1px solid var(--line)',
      }}
    >
      <Skeleton width="100%" height={130} radius={2} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Skeleton width={50} height={10} radius={2} />
        <Skeleton width={35} height={10} radius={2} />
      </div>
      <Skeleton width="95%" height={14} radius={2} />
      <Skeleton width="80%" height={14} radius={2} />
      <Skeleton width="100%" height={10} radius={1} style={{ marginTop: 2 }} />
      <Skeleton width="60%" height={10} radius={1} />
    </div>
  )
}

/** Skeleton untuk Tabel Baris Data (misal /instruments) */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--surface-2)',
            background: 'var(--surface-1)',
          }}
        >
          <Skeleton width={60} height={13} radius={2} />
          <Skeleton width={160} height={13} radius={2} />
          <Skeleton width={45} height={16} radius={2} />
          <Skeleton width={55} height={13} radius={2} style={{ marginLeft: 'auto' }} />
          <Skeleton width={100} height={8} radius={1} />
          <Skeleton width={75} height={13} radius={2} />
          <Skeleton width={80} height={16} radius={2} />
        </div>
      ))}
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

