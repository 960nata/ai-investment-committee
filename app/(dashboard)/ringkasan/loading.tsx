import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui'

export default function DashboardLoading() {
  return (
    <>
      {/* Masthead Skeleton */}
      <header className="masthead">
        <Skeleton width={180} height={12} radius={2} />
        <Skeleton width="40%" height={28} radius={2} style={{ marginTop: 'var(--space-2)' }} />
        <Skeleton width="60%" height={15} radius={2} style={{ marginTop: 'var(--space-2)' }} />
      </header>

      {/* Tabs Skeleton */}
      <div className="tabs" style={{ borderBottom: '1px solid var(--line)' }}>
        {[90, 80, 100, 85, 110].map((w, i) => (
          <Skeleton
            key={i}
            width={w}
            height={32}
            radius="2px 2px 0 0"
            style={{ margin: '0 2px' }}
          />
        ))}
      </div>

      {/* Main Chart Panel Skeleton */}
      <section className="panel" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <div className="panel-head" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Skeleton width={80} height={15} radius={2} />
            <Skeleton width={140} height={12} radius={2} />
            <Skeleton width={90} height={15} radius={2} />
          </div>
          <Skeleton width={130} height={24} radius="var(--radius)" />
        </div>
        <div className="chart chart-wide" style={{ padding: 0 }}>
          <SkeletonChart />
        </div>
      </section>

      {/* Instrument List Panel Skeleton */}
      <section className="panel" style={{ marginTop: 'var(--space-3)' }}>
        <div className="panel-head">
          <Skeleton width={100} height={15} radius={2} />
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <Skeleton width={160} height={24} radius="var(--radius)" />
            <Skeleton width={180} height={24} radius="var(--radius)" />
          </div>
        </div>
        <div className="cards">
          {Array.from({ length: 12 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    </>
  )
}
