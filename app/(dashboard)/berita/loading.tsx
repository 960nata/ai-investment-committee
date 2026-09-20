import { Skeleton, SkeletonNews } from '@/components/ui'

export default function BeritaLoading() {
  return (
    <div className="news-portal">
      {/* Masthead Skeleton */}
      <header className="masthead">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Skeleton width={180} height={12} radius={2} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Skeleton width={130} height={26} radius="var(--radius)" />
            <Skeleton width={90} height={26} radius="var(--radius)" />
          </div>
        </div>
        <Skeleton width="45%" height={28} radius={2} style={{ marginTop: 'var(--space-2)' }} />
        <Skeleton width="60%" height={15} radius={2} style={{ marginTop: 'var(--space-2)' }} />
      </header>

      {/* News Hero Skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          background: 'var(--surface-1)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width="100%" height={240} radius={2} />
          <Skeleton width={90} height={12} radius={2} />
          <Skeleton width="90%" height={20} radius={2} />
          <Skeleton width="75%" height={20} radius={2} />
          <Skeleton width="100%" height={13} radius={2} />
          <Skeleton width="85%" height={13} radius={2} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                paddingBottom: 10,
                borderBottom: i < 3 ? '1px solid var(--line)' : 'none',
              }}
            >
              <Skeleton width={85} height={65} radius={2} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                <Skeleton width={70} height={9} radius={1} />
                <Skeleton width="95%" height={13} radius={2} />
                <Skeleton width="70%" height={13} radius={2} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Articles Skeleton */}
      <div className="news-layout-with-sidebar" style={{ marginTop: 'var(--space-3)' }}>
        <div className="news-main-column">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonNews key={i} />
            ))}
          </div>
        </div>
        <div className="news-sidebar">
          <div className="sidebar-widget">
            <Skeleton width={140} height={16} radius={4} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Skeleton width="90%" height={12} radius={3} />
                  <Skeleton width="50%" height={10} radius={2} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
