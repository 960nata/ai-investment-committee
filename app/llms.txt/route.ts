import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-static'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'llms.txt')
    const content = readFileSync(filePath, 'utf-8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  } catch {
    return new NextResponse('# AI Investdesk\nhttps://aiinvestdesk.com', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
