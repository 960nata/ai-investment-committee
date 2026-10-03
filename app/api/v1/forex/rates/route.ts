import { NextResponse } from 'next/server'
import { getForexState } from '@/lib/forex/rates'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const state = await getForexState()
    return NextResponse.json(state, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err) {
    console.error('[API Forex] Gagal mengambil kurs:', err)
    return NextResponse.json({ error: 'Gagal memuat kurs' }, { status: 500 })
  }
}
