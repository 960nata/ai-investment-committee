import { NextRequest, NextResponse } from 'next/server'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { generateLiveNewsArticle, seedInitialNewsArticles, syncExistingNewsImagesToSupabase } from '@/lib/agents/news-agent'
import { isRequestAdminAuthenticated, verifyAdminSession } from '@/lib/auth/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/news
 *
 * Endpoint pembaca berita & intelijen pasar AI.
 * Mendukung format JSON standar maupun format terstruktur khusus untuk AI lain (format=llm).
 */
export async function GET(request: NextRequest) {
  try {
    // Pastikan ada artikel awal jika belum pernah ada
    await seedInitialNewsArticles()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const symbol = searchParams.get('symbol') || undefined
    const sentiment = searchParams.get('sentiment') || undefined
    const limit = Number(searchParams.get('limit')) || 20
    const format = searchParams.get('format') // 'json' | 'llm'

    const articles = await getMarketNewsList({ category, symbol, sentiment, limit })

    // Jika diminta format untuk AI lain / LLM context
    if (format === 'llm') {
      const llmContext = articles.map((a, i) => {
        return `[INTEL #${i + 1}] ${a.title} (${a.publishedAt.toISOString().slice(0, 10)})
Kategori: ${a.category} | Sentimen: ${a.sentiment.toUpperCase()} | Skor Dampak: ${a.impactScore}/10
Simbol Terkait: ${a.mentionedSymbols.join(', ')}
Ringkasan: ${a.summary}
Poin Kunci:
${a.keyTakeaways.map((k) => `  - ${k}`).join('\n')}
Tautan: /berita/${a.slug}`
      }).join('\n\n---\n\n')

      return NextResponse.json({
        total: articles.length,
        format: 'llm_context',
        context_for_llm: llmContext,
        articles: articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          summary: a.summary,
          category: a.category,
          sentiment: a.sentiment,
          impactScore: a.impactScore,
          mentionedSymbols: a.mentionedSymbols,
          publishedAt: a.publishedAt,
        })),
      })
    }

    return NextResponse.json({
      total: articles.length,
      articles,
    })
  } catch (err) {
    console.error('[API /api/v1/news GET Error]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * POST /api/v1/news
 *
 * Memicu agen AI untuk menulis dan menerbitkan artikel berita baru secara langsung.
 * Atau menyinkronkan gambar artikel ke Supabase Storage (action: 'sync_images').
 *
 * Khusus redaksi. Satu permintaan di sini membakar kuota LLM, mengunduh foto,
 * dan menerbitkan artikel atas nama portal — kalau siapa pun bisa memanggilnya,
 * kuota habis dalam semenit dan halaman warta terisi tulisan yang tak seorang
 * pun di redaksi pernah minta.
 */
export async function POST(request: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(request)
  if (!isAuthed) {
    return NextResponse.json(
      { error: 'Akses ditolak. Penerbitan warta AI hanya untuk redaksi.' },
      { status: 403 },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))

    if (body.action === 'sync_images') {
      const syncResult = await syncExistingNewsImagesToSupabase()
      return NextResponse.json({
        success: true,
        action: 'sync_images',
        ...syncResult,
      })
    }

    const { topic, category, targetSymbols } = body

    const article = await generateLiveNewsArticle({
      topic,
      category,
      targetSymbols,
    })

    return NextResponse.json({
      success: true,
      article,
    })
  } catch (err) {
    console.error('[API /api/v1/news POST Error]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
