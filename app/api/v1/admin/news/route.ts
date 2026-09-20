import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getMarketNewsList, saveMarketNews } from '@/lib/db/news-queries'
import type { NewMarketNews } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Helper membuat slug URL yang bersih dari judul
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Daftar berita lengkap untuk portal Admin CMS.
 */
export async function GET(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams
  const category = searchParams.get('category') || undefined
  const sentiment = searchParams.get('sentiment') || undefined
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  try {
    const list = await getMarketNewsList({ category, sentiment, limit, offset })
    return NextResponse.json({ ok: true, data: list })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Buat artikel warta intelijen baru dari portal Admin CMS.
 */
export async function POST(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (!body.title || !body.summary || !body.contentMarkdown) {
      return NextResponse.json(
        { ok: false, error: 'Judul, ringkasan, dan konten markdown wajib diisi.' },
        { status: 400 },
      )
    }

    let slug = body.slug ? slugify(body.slug) : slugify(body.title)
    if (!slug) {
      slug = `news-${Date.now()}`
    }

    // Normalisasi video YouTube: jika videoId kosong atau string spasi, set ke null
    let youtubeVideo = body.youtubeVideo
    if (youtubeVideo && (!youtubeVideo.videoId || youtubeVideo.videoId.trim() === '')) {
      youtubeVideo = null
    }

    const payload: NewMarketNews = {
      slug,
      title: body.title.trim(),
      summary: body.summary.trim(),
      category: body.category || 'ekonomi-makro',
      tags: Array.isArray(body.tags) ? body.tags : [],
      mentionedSymbols: Array.isArray(body.mentionedSymbols) ? body.mentionedSymbols : [],
      sentiment: body.sentiment || 'neutral',
      impactScore: typeof body.impactScore === 'number' ? body.impactScore : 6,
      featuredImage: body.featuredImage || null,
      youtubeVideo: youtubeVideo || null,
      keyTakeaways: Array.isArray(body.keyTakeaways) ? body.keyTakeaways : [],
      contentMarkdown: body.contentMarkdown,
      author: body.author?.trim() || 'Tim Analis Komite',
      readingTimeMinutes: body.readingTimeMinutes || Math.max(2, Math.ceil(body.contentMarkdown.length / 800)),
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
    }

    const created = await saveMarketNews(payload)
    return NextResponse.json({ ok: true, data: created })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
