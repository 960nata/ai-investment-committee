import { NextRequest, NextResponse } from 'next/server'
import { getMarketNewsBySlug } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/news/[slug]
 *
 * Mengambil satu artikel berita lengkap berdasarkan slug.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params
    if (!slug) {
      return NextResponse.json({ error: 'Slug wajib diisi' }, { status: 400 })
    }

    const article = await getMarketNewsBySlug(slug)
    if (!article) {
      return NextResponse.json({ error: 'Artikel tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({ article })
  } catch (err) {
    console.error('[API /api/v1/news/[slug] GET Error]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
