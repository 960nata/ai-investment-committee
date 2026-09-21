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

interface Props {
  searchParams: Promise<{ kategori?: string; q?: string }>
}

/** Kategori yang benar-benar dipakai di basis data. Selainnya diabaikan. */
const KNOWN_CATEGORIES = [
  'teknologi-ai',
  'energi-komoditas',
  'ekonomi-makro',
  'saham-idx',
  'crypto-fintech',
]

export default async function BeritaPage({ searchParams }: Props) {
  const { kategori, q } = await searchParams
  await seedInitialNewsArticles()

  // Kategori dari menu disaring di sini, bukan dipercaya mentah: alamat dengan
  // kategori karangan sebaiknya membuka portal penuh, bukan halaman kosong.
  const category = kategori && KNOWN_CATEGORIES.includes(kategori) ? kategori : 'semua'
  const articles = await getMarketNewsList({ limit: 40 })

  return (
    <NewsPortalClient
      initialArticles={articles}
      initialCategory={category}
      initialQuery={q?.trim() ?? ''}
    />
  )
}
