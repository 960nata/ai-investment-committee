/**
 * Screener (Beta) — saring seluruh instrumen menurut kelas aset, skor, arah
 * bukti komite, dan pergerakan harian.
 */

import { BetaHead } from '@/components/member/page-head'
import { DatabaseNotice } from '@/components/ui'
import { ScreenerClient } from './screener-client'
import { requireUser } from '@/lib/auth/user-auth'
import { listWatchlistIds } from '@/lib/db/member-queries'
import { loadMarketView, type MarketRow } from '@/lib/member/market-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Screener' }

export default async function ScreenerPage() {
  const session = await requireUser('/screener')

  let rows: MarketRow[] = []
  let watch: number[] = []
  let error: string | null = null
  try {
    ;[rows, watch] = await Promise.all([loadMarketView(), listWatchlistIds(session.uid).catch(() => [])])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Screener"
        lead="Saring seluruh instrumen yang dilacak menurut skor, arah bukti komite, kelas aset, dan pergerakan harian — lalu pantau yang menarik."
        note="Skor −10..+10 adalah ringkasan bukti dari model versi terkini; instrumen dengan keyakinan “tidak memadai” sebaiknya dibaca dengan hati-hati."
      />
      {error && <DatabaseNotice detail={error} />}
      {!error && <ScreenerClient rows={rows} watchlistIds={watch} />}
    </>
  )
}
