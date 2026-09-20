import { getMarketNewsById } from '@/lib/db/news-queries'
import { notFound } from 'next/navigation'
import { IconNews } from '@/components/icons'
import { NewsForm } from '../../news-form'

export const dynamic = 'force-dynamic'

export default async function AdminEditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) {
    notFound()
  }

  const article = await getMarketNewsById(numId)
  if (!article) {
    notFound()
  }

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconNews size={13} style={{ color: 'var(--signal)' }} />
            <span>CMS REDAKSI KOMITE</span>
          </div>
          <h1 className="admin-page-headline">Edit Warta: #{article.id}</h1>
          <p className="admin-page-standfirst">
            Perbarui teks analisis, ganti foto sampul di Supabase Storage, atau perbarui/kosongkan URL YouTube.
          </p>
        </div>
      </div>

      <div suppressHydrationWarning>
        <NewsForm initialData={article} isEdit={true} />
      </div>
    </div>
  )
}
