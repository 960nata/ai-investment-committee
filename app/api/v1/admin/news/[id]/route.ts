import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getMarketNewsById, updateMarketNews, deleteMarketNews } from '@/lib/db/news-queries'
import type { NewMarketNews } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Ambil satu artikel berita untuk diedit di Admin.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) {
    return NextResponse.json({ ok: false, error: 'ID berita tidak valid.' }, { status: 400 })
  }

  try {
    const article = await getMarketNewsById(numId)
    if (!article) {
      return NextResponse.json({ ok: false, error: 'Artikel berita tidak ditemukan.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, data: article })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Perbarui artikel berita dari Admin CMS.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) {
    return NextResponse.json({ ok: false, error: 'ID berita tidak valid.' }, { status: 400 })
  }

  try {
    const body = await req.json()

    // Normalisasi video YouTube: jika videoId kosong atau string spasi, set ke null
    let youtubeVideo = body.youtubeVideo
    if (youtubeVideo && (!youtubeVideo.videoId || youtubeVideo.videoId.trim() === '')) {
      youtubeVideo = null
    }

    const updatePayload: Partial<NewMarketNews> = {}
    if (body.title !== undefined) updatePayload.title = body.title.trim()
    if (body.slug !== undefined) updatePayload.slug = body.slug.trim()
    if (body.summary !== undefined) updatePayload.summary = body.summary.trim()
    if (body.category !== undefined) updatePayload.category = body.category
    if (body.tags !== undefined) updatePayload.tags = Array.isArray(body.tags) ? body.tags : []
    if (body.mentionedSymbols !== undefined)
      updatePayload.mentionedSymbols = Array.isArray(body.mentionedSymbols) ? body.mentionedSymbols : []
    if (body.sentiment !== undefined) updatePayload.sentiment = body.sentiment
    if (body.impactScore !== undefined) updatePayload.impactScore = Number(body.impactScore)
    if (body.featuredImage !== undefined) updatePayload.featuredImage = body.featuredImage
    if (body.youtubeVideo !== undefined) updatePayload.youtubeVideo = youtubeVideo
    if (body.keyTakeaways !== undefined)
      updatePayload.keyTakeaways = Array.isArray(body.keyTakeaways) ? body.keyTakeaways : []
    if (body.contentMarkdown !== undefined) updatePayload.contentMarkdown = body.contentMarkdown
    if (body.author !== undefined) updatePayload.author = body.author.trim()
    if (body.readingTimeMinutes !== undefined) updatePayload.readingTimeMinutes = Number(body.readingTimeMinutes)
    if (body.publishedAt !== undefined) updatePayload.publishedAt = new Date(body.publishedAt)

    const updated = await updateMarketNews(numId, updatePayload)
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Gagal memperbarui berita.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Hapus artikel berita dari Admin CMS.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) {
    return NextResponse.json({ ok: false, error: 'ID berita tidak valid.' }, { status: 400 })
  }

  try {
    const success = await deleteMarketNews(numId)
    if (!success) {
      return NextResponse.json({ ok: false, error: 'Artikel tidak ditemukan atau gagal dihapus.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, message: 'Artikel berita berhasil dihapus.' })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
