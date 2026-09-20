import { NextResponse } from 'next/server'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await seedInitialNewsArticles()
    const articles = await getMarketNewsList({ limit: 30 })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const itemsXml = articles
      .map((a) => {
        const link = `${baseUrl}/berita/${a.slug}`
        const pubDate = new Date(a.publishedAt).toUTCString()
        const categories = `<category>${a.category}</category>`
        const cleanSummary = (a.summary || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

        return `    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      ${categories}
      <description><![CDATA[${cleanSummary}]]></description>
      <author>${a.author}</author>
    </item>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Investment Committee - Intelijen &amp; Berita Pasar</title>
    <link>${baseUrl}/berita</link>
    <description>Laporan intelijen ekonomi makro, teknologi AI, energi, dan korelasi pergerakan saham oleh AI Investment Committee.</description>
    <language>id-ID</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/api/v1/news/rss" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    })
  } catch (err) {
    return new NextResponse('<error>Gagal membuat feed RSS</error>', { status: 500 })
  }
}
