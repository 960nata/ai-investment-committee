import { getMarketNewsById } from '@/lib/db/news-queries'
import { notFound } from 'next/navigation'
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
    <div>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow">CMS Redaksi Komite</p>
        <h1 className="headline" style={{ margin: '4px 0 0' }}>
          Edit Warta: #{article.id}
        </h1>
        <p className="standfirst">
          Perbarui teks analisis, ganti foto sampul di Supabase Storage, atau perbarui/kosongkan URL YouTube.
        </p>
      </div>

      <NewsForm initialData={article} isEdit={true} />
    </div>
  )
}
