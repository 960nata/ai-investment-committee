import Link from 'next/link'
import { IconPlus, IconNews } from '@/components/icons'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { NewsTableClient } from './news-table-client'
import { AiGeneratorClient } from './ai-generator-client'

export const dynamic = 'force-dynamic'

export default async function AdminNewsListPage() {
  const news = await getMarketNewsList({ limit: 100 })

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconNews size={13} style={{ color: 'var(--signal)' }} />
            <span>CONTENT MANAGEMENT SYSTEM</span>
          </div>
          <h1 className="admin-page-headline">Manajemen Warta &amp; Intelijen AI</h1>
          <p className="admin-page-standfirst">
            Daftar publikasi artikel analisis pasar dengan kontrol penuh: edit isi teks, unggah gambar sampul Supabase, dan kontrol sematan video YouTube.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <AiGeneratorClient />

            <Link
              href="/admin/berita/baru"
              className="btn btn-primary mono"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <IconPlus size={14} />
              <span>Tulis Warta Baru</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="admin-table-card" style={{ padding: '20px' }} suppressHydrationWarning>
        <NewsTableClient initialNews={news} />
      </div>
    </div>
  )
}
