/**
 * Skeleton halaman dashboard, dipakai `loading.tsx` tiap rute.
 *
 * Bentuknya meniru halaman aslinya — kepala halaman, panel formulir, deret
 * angka, tabel, kartu, atau chat — supaya saat isi sebenarnya datang tata
 * letaknya tidak melompat. Lebar ditulis dalam persen agar tetap rapi di layar
 * ponsel.
 */

import { Skeleton } from '../ui'

export function MastheadSkeleton({ beta = true }: { beta?: boolean }) {
  return (
    <header className="masthead" aria-hidden="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Skeleton width={110} height={11} />
        {beta && <Skeleton width={38} height={16} />}
      </div>
      <Skeleton width="min(320px, 70%)" height={30} style={{ marginTop: 'var(--space-2)' }} />
      <Skeleton width="min(560px, 95%)" height={14} style={{ marginTop: 'var(--space-3)' }} />
      <Skeleton width="min(420px, 80%)" height={14} style={{ marginTop: 6 }} />
    </header>
  )
}

function PanelHeadSkeleton({ meta = true }: { meta?: boolean }) {
  return (
    <div className="panel-head">
      <Skeleton width={120} height={13} />
      {meta && <Skeleton width={70} height={11} style={{ marginLeft: 'auto' }} />}
    </div>
  )
}

export function FormPanelSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <section className="panel" aria-hidden="true">
      <PanelHeadSkeleton meta={false} />
      <div className="panel-body">
        <div className="form-row">
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="field" style={{ flex: i === 0 ? '2 1 240px' : '1 1 140px' }}>
              <Skeleton width={70} height={9} />
              <Skeleton width="100%" height={32} radius="var(--radius)" />
            </div>
          ))}
          <Skeleton width={84} height={32} radius="var(--radius)" />
        </div>
      </div>
    </section>
  )
}

export function KpiSkeleton({ count = 3 }: { count?: number }) {
  return (
    <section className="panel" aria-hidden="true">
      <PanelHeadSkeleton />
      <div className="kpis">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="kpi">
            <Skeleton width="45%" height={9} />
            <Skeleton width="65%" height={22} style={{ marginTop: 8 }} />
            <Skeleton width="80%" height={10} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Baris tabel: kolom pertama simbol + keterangan, sisanya angka rata kanan. */
export function TablePanelSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <section className="panel" aria-hidden="true">
      <PanelHeadSkeleton />
      <div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              borderBottom: '1px solid var(--surface-2)',
            }}
          >
            <div style={{ flex: '1 1 30%', minWidth: 0 }}>
              <Skeleton width="70%" height={13} />
              <Skeleton width="45%" height={9} style={{ marginTop: 6 }} />
            </div>
            {Array.from({ length: columns - 1 }, (_, c) => (
              <Skeleton
                key={c}
                width={`${12 + ((r + c) % 3) * 3}%`}
                height={13}
                className={c >= 2 ? 'hide-sm' : undefined}
                style={{ flex: '0 0 auto' }}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function CardsPanelSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <section className="panel" aria-hidden="true">
      <PanelHeadSkeleton meta={false} />
      <div className="cards">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card">
            <Skeleton width="85%" height={11} />
            <Skeleton width="50%" height={22} style={{ marginTop: 10 }} />
            <Skeleton width="70%" height={9} style={{ marginTop: 8 }} />
            <Skeleton width="100%" height={40} style={{ marginTop: 12 }} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function ChatPanelSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <PanelHeadSkeleton meta={false} />
      <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
        <Skeleton width={70} height={9} />
        <Skeleton width="min(420px, 100%)" height={32} radius="var(--radius)" style={{ marginTop: 6 }} />
      </div>
      <div className="panel-body">
        <Skeleton width={120} height={10} />
        <div className="chip-row" style={{ marginTop: 10 }}>
          {[220, 190, 240, 200].map((w, i) => (
            <Skeleton key={i} width={`min(${w}px, 100%)`} height={28} radius={999} />
          ))}
        </div>
      </div>
    </section>
  )
}

/** Susunan umum: kepala halaman, lalu panel-panel yang diberikan. */
export function PageSkeleton({ children, beta = true }: { children: React.ReactNode; beta?: boolean }) {
  return (
    <div role="status" aria-label="Memuat halaman">
      <MastheadSkeleton beta={beta} />
      {children}
    </div>
  )
}
