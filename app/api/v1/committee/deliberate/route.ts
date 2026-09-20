import { NextResponse } from 'next/server'
import { runCommittee } from '@/lib/agents/committee'
import { getLatestAgentSessionForSymbol } from '@/lib/db/queries'
import type { MarketCode } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const market = searchParams.get('market') as MarketCode | null

  if (!symbol || !market) {
    return NextResponse.json({ error: 'Parameter symbol dan market wajib diisi' }, { status: 400 })
  }

  try {
    const data = await getLatestAgentSessionForSymbol(market, symbol)
    return NextResponse.json({
      session: data?.session ?? null,
      turns: data?.turns ?? [],
    })
  } catch (err) {
    console.error('[Committee API] GET gagal:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengambil data komite' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { market, symbol, force } = body as {
      market?: MarketCode
      symbol?: string
      force?: boolean
    }

    if (!market || !symbol) {
      return NextResponse.json({ error: 'Market dan symbol wajib diisi' }, { status: 400 })
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const sessionKey = force
      ? `on-demand-${symbol}-${Date.now()}`
      : `daily-${symbol}-${todayStr}`

    const result = await runCommittee({
      market,
      symbol,
      sessionKey,
    })

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[Committee API] POST gagal:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rapat komite gagal dijalankan' },
      { status: 500 },
    )
  }
}
