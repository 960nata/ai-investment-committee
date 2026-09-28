/**
 * Tanya Komite (Beta) — tanya jawab bebas atas satu instrumen, dijawab dari
 * fakta basis data dan putusan komite terakhir.
 */

import { BetaHead } from '@/components/member/page-head'
import { DatabaseNotice } from '@/components/ui'
import { AskClient } from './ask-client'
import { requireUser } from '@/lib/auth/user-auth'
import { loadMarketView, type MarketRow } from '@/lib/member/market-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tanya Komite' }

export default async function AskPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  await requireUser('/tanya-komite')
  const { symbol } = await searchParams

  let market: MarketRow[] = []
  let error: string | null = null
  try {
    market = await loadMarketView()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const wanted = symbol?.trim().toUpperCase()
  const initial = (wanted && market.find((m) => m.symbol.toUpperCase() === wanted)) || null

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Tanya Komite"
        lead="Tanyakan apa saja soal satu instrumen — tren, risiko, alasan putusan komite. Jawaban disusun dari data yang tersimpan, dan asisten akan berterus terang bila datanya tidak ada."
        note="Jatah pertanyaan dibatasi (berbagi kuota dengan rapat komite) supaya kunci model tidak habis. Jawaban AI bisa keliru; periksa angka di halaman Ringkasan."
      />
      {error && <DatabaseNotice detail={error} />}
      {!error && (
        <AskClient
          options={market
            .filter((m) => m.candleCount > 0)
            .map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, assetClass: m.assetClass, market: m.market }))}
          initialId={initial?.id ?? null}
        />
      )}
    </>
  )
}
