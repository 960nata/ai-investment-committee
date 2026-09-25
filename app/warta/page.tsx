/**
 * Warta publik.
 *
 * Halaman ini adalah wajah warta untuk pengunjung yang belum punya akun:
 * kerangkanya kepala navigasi beranda dan kaki halaman beranda, tanpa rel
 * navigasi kiri sama sekali. Rel itu milik terminal, dan menampilkannya kepada
 * orang yang belum bisa membuka satu pun tautan di dalamnya hanya memancing
 * kekecewaan.
 *
 * Kembarannya yang di dalam terminal ada di `app/(dashboard)/berita`. Sengaja
 * dua berkas: isi artikelnya sama, tetapi pembacanya berbeda.
 */

import type { Metadata } from 'next'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { listInstrumentQuotes, getDataFreshness } from '@/lib/db/queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { PublicNewsPortal } from '@/components/public-news-portal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Warta & Intelijen Pasar AI | Komite',
  description:
    'Laporan intelijen ekonomi makro, ledakan teknologi AI, sektor energi data center, dan korelasi pergerakan saham global serta emiten IDX oleh komite AI. Terbuka untuk umum.',
  openGraph: {
    title: 'Warta & Intelijen Pasar AI | Komite',
    description:
      'Laporan intelijen mendalam mengupas konvergensi ekonomi makro, energi, dan chip AI terhadap portofolio saham dan kripto.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Warta & Intelijen Pasar AI | Komite',
    description:
      'Analisis tajam komite AI menghubungkan belanja capex AI, energi listrik, dan saham terkait.',
  },
}

/** Kategori yang benar-benar dipakai di basis data. Selainnya diabaikan. */
const KNOWN_CATEGORIES = [
  'teknologi-ai',
  'energi-komoditas',
  'ekonomi-makro',
  'saham-idx',
  'crypto-fintech',
]

interface Props {
  searchParams: Promise<{ kategori?: string; q?: string }>
}

export default async function WartaPublikPage({ searchParams }: Props) {
  const { kategori, q } = await searchParams
  await seedInitialNewsArticles()

  const [articles, instruments, freshness, session, isAdmin] = await Promise.all([
    getMarketNewsList({ limit: 40 }).catch(() => []),
    listInstrumentQuotes().catch(() => []),
    getDataFreshness().catch(() => null),
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
  ])

  // Kategori dari alamat disaring di sini, bukan dipercaya mentah: alamat dengan
  // kategori karangan sebaiknya membuka portal penuh, bukan halaman kosong.
  const category = kategori && KNOWN_CATEGORIES.includes(kategori) ? kategori : 'semua'

  return (
    <div className="landing-shell">
      <LandingNav
        instruments={instruments}
        latestNews={articles.slice(0, 6)}
        freshnessLabel={
          freshness?.freshness === 'fresh' ? 'DATA SEGAR · TERHUBUNG' : 'DATA TERCATAT'
        }
        isFresh={freshness?.freshness === 'fresh'}
        isAdmin={isAdmin}
        user={session ? { name: session.name, role: session.role } : null}
      />

      <PublicNewsPortal
        articles={articles}
        initialCategory={category}
        initialQuery={q?.trim() ?? ''}
      />

      <LandingFooter />
    </div>
  )
}
