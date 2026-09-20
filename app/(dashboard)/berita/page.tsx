import type { Metadata } from 'next'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'
import { NewsPortalClient } from '@/components/news-portal-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Warta & Intelijen Pasar AI | AI Investment Committee',
  description:
    'Laporan intelijen ekonomi makro, ledakan teknologi AI, sektor energi data center, dan korelasi pergerakan saham global serta emiten IDX oleh komite AI.',
  openGraph: {
    title: 'Warta & Intelijen Pasar AI | AI Investment Committee',
    description:
      'Laporan intelijen mendalam mengupas konvergensi ekonomi makro, energi, dan chip AI terhadap portofolio saham dan kripto.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Warta & Intelijen Pasar AI | AI Investment Committee',
    description:
      'Analisis tajam komite AI menghubungkan belanja capex AI, energi listrik, dan saham terkait.',
  },
}

export default async function BeritaPage() {
  await seedInitialNewsArticles()
  const articles = await getMarketNewsList({ limit: 40 })

  return <NewsPortalClient initialArticles={articles} />
}
