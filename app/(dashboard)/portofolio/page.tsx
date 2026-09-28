/**
 * Portofolio (Beta) — posisi yang dicatat pengguna sendiri, dinilai terhadap
 * penutupan terakhir yang tersimpan.
 *
 * Total dihitung per mata uang. Menjumlahkan rupiah dan dolar tanpa kurs yang
 * jelas asal-usulnya menghasilkan angka yang terlihat tepat tetapi tidak
 * berarti apa-apa.
 */

import { BetaHead } from '@/components/member/page-head'
import { DatabaseNotice } from '@/components/ui'
import { PortfolioClient } from './portfolio-client'
import { requireUser } from '@/lib/auth/user-auth'
import { listPositions, PORTFOLIO_LIMIT } from '@/lib/db/member-queries'
import { loadMarketView } from '@/lib/member/market-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Portofolio' }

export default async function PortfolioPage() {
  const session = await requireUser('/portofolio')

  let data: { positions: Awaited<ReturnType<typeof listPositions>>; market: Awaited<ReturnType<typeof loadMarketView>> } | null = null
  let error: string | null = null
  try {
    const [positions, market] = await Promise.all([listPositions(session.uid), loadMarketView()])
    data = { positions, market }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Portofolio"
        lead="Catat posisi Anda, lalu lihat untung-rugi di atas kertas, alokasi per kelas aset, dan ke mana bukti komite condong untuk tiap posisi."
        note="Portofolio ini catatan pribadi, tidak terhubung ke rekening mana pun. Nilai dihitung dari penutupan harian terakhir yang tersimpan, bukan harga live."
      />
      {error && <DatabaseNotice detail={error} />}
      {data && <PortfolioClient positions={data.positions} market={data.market} limit={PORTFOLIO_LIMIT} />}
    </>
  )
}
