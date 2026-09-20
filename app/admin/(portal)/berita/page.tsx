import Link from 'next/link'
import { IconPlus, IconNews } from '@/components/icons'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { NewsTableClient } from './news-table-client'

export const dynamic = 'force-dynamic'

export default async function AdminNewsListPage() {
  const news = await getMarketNewsList({ limit: 100 })

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <p className="eyebrow">Content Management System</p>
          <h1 className="headline" style={{ margin: '4px 0 0' }}>
            Manajemen Warta &amp; Intelijen AI
          </h1>
        </div>

        <Link href="/admin/berita/baru" className="btn btn-primary" style={{ fontSize: '13px', fontFamily: 'var(--mono)' }}>
          <IconPlus size={14} />
          <span>Tulis Warta Baru</span>
        </Link>
      </div>

      <div className="admin-card">
        <NewsTableClient initialNews={news} />
      </div>
    </div>
  )
}
