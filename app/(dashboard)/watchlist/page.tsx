/**
 * Watchlist (Beta) — instrumen yang dipantau pengguna, lengkap dengan skor
 * tiga horizon dan putusan komite terakhirnya dalam satu tabel.
 */

import Link from 'next/link'
import { IconStar } from '@/components/icons'
import { Blank, DatabaseNotice } from '@/components/ui'
import { BetaHead } from '@/components/member/page-head'
import { ChangeText, ScoreText, VerdictTag } from '@/components/member/cells'
import { WatchToggle } from '@/components/member/watch-toggle'
import { WatchlistAdd } from './watchlist-add'
import { requireUser } from '@/lib/auth/user-auth'
import { listWatchlistIds } from '@/lib/db/member-queries'
import { getEntitlement } from '@/lib/db/premium-queries'
import { loadMarketView, type MarketRow } from '@/lib/member/market-view'
import { formatPriceIn } from '@/lib/format/market'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Watchlist' }

export default async function WatchlistPage() {
  const session = await requireUser('/watchlist')

  const { limits } = await getEntitlement(session.uid)

  let rows: MarketRow[] = []
  let all: MarketRow[] = []
  let error: string | null = null
  try {
    const [ids, market] = await Promise.all([listWatchlistIds(session.uid), loadMarketView()])
    all = market
    const byId = new Map(market.map((m) => [m.id, m]))
    rows = ids.map((id) => byId.get(id)).filter((r): r is MarketRow => Boolean(r))
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Watchlist"
        lead="Instrumen yang Anda pantau, dengan harga penutupan, skor tiga horizon, dan arah bukti dari rapat komite terakhir."
      />

      {error && <DatabaseNotice detail={error} />}

      {!error && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <IconStar size={14} />
              Dipantau
            </span>
            <span className="panel-meta">
              {rows.length}/{limits.watchlist}
            </span>
          </div>
          <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
            <WatchlistAdd
              options={all.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, assetClass: m.assetClass }))}
              exclude={rows.map((r) => r.id)}
            />
          </div>

          {rows.length === 0 ? (
            <Blank icon={<IconStar size={22} />} title="Watchlist masih kosong">
              Tambahkan instrumen lewat kolom di atas, atau tekan tombol <strong>Pantau</strong> di grafik
              halaman Ringkasan.
            </Blank>
          ) : (
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Simbol</th>
                    <th>Nama</th>
                    <th className="num">Penutupan</th>
                    <th className="num">Harian</th>
                    <th className="num">Skor pendek</th>
                    <th className="num">Menengah</th>
                    <th className="num">Panjang</th>
                    <th>Putusan komite</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="key">
                        <Link href={`/ringkasan?symbol=${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                      </td>
                      <td>{r.name}</td>
                      <td className="num">{formatPriceIn(r.lastClose, r.currency)}</td>
                      <td className="num">
                        <ChangeText value={r.changePct} />
                      </td>
                      <td className="num"><ScoreText value={r.scores.pendek?.score} /></td>
                      <td className="num"><ScoreText value={r.scores.menengah?.score} /></td>
                      <td className="num"><ScoreText value={r.scores.panjang?.score} /></td>
                      <td>
                        <VerdictTag verdict={r.verdict?.verdict} />
                      </td>
                      <td>
                        <WatchToggle instrumentId={r.id} initialOn refresh compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
