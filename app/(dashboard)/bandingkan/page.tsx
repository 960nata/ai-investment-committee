/**
 * Bandingkan (Beta) — dua sampai empat instrumen berdampingan.
 *
 * Fakta dihitung dengan `gatherFacts`, fungsi yang sama yang dipakai komite,
 * jadi imbal hasil dan volatilitas di sini persis angka yang dibaca agen.
 */

import Link from 'next/link'
import { IconScales } from '@/components/icons'
import { Blank, DatabaseNotice } from '@/components/ui'
import { BetaHead } from '@/components/member/page-head'
import { ScoreText, VerdictTag } from '@/components/member/cells'
import { ComparePicker } from './compare-picker'
import { requireUser } from '@/lib/auth/user-auth'
import { gatherFacts, type MarketFacts } from '@/lib/agents/tools'
import { loadMarketView, type MarketRow } from '@/lib/member/market-view'
import { formatPct, formatPriceIn } from '@/lib/format/market'
import type { MarketCode } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bandingkan' }

const MAX = 4

interface Column {
  row: MarketRow
  facts: MarketFacts | null
  factsError: string | null
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireUser('/bandingkan')
  const { ids: raw } = await searchParams
  const ids = [...new Set((raw ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX)

  let market: MarketRow[] = []
  let columns: Column[] = []
  let error: string | null = null
  try {
    market = await loadMarketView()
    const byId = new Map(market.map((m) => [m.id, m]))
    const picked = ids.map((id) => byId.get(id)).filter((r): r is MarketRow => Boolean(r))
    columns = await Promise.all(
      picked.map(async (row) => {
        try {
          return { row, facts: await gatherFacts(row.market as MarketCode, row.symbol), factsError: null }
        } catch (err) {
          return { row, facts: null, factsError: err instanceof Error ? err.message : String(err) }
        }
      }),
    )
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const pct = (v: number | null | undefined) => formatPct(v == null ? null : v)

  const lines: { label: string; render: (c: Column) => React.ReactNode }[] = [
    { label: 'Penutupan', render: (c) => formatPriceIn(c.row.lastClose, c.row.currency) },
    { label: 'Data per', render: (c) => c.facts?.asOf ?? c.row.lastDate ?? '—' },
    { label: '1 hari', render: (c) => pct(c.facts?.returns.d1) },
    { label: '7 hari', render: (c) => pct(c.facts?.returns.d7) },
    { label: '30 hari', render: (c) => pct(c.facts?.returns.d30) },
    { label: '90 hari', render: (c) => pct(c.facts?.returns.d90) },
    { label: '1 tahun', render: (c) => pct(c.facts?.returns.d365) },
    { label: '3 tahun', render: (c) => pct(c.facts?.returns.y3) },
    { label: '5 tahun', render: (c) => pct(c.facts?.returns.y5) },
    {
      label: 'Volatilitas tahunan',
      render: (c) =>
        c.facts?.annualisedVolatility == null ? '—' : `${c.facts.annualisedVolatility.toFixed(2).replace('.', ',')}%`,
    },
    { label: 'Penurunan terdalam 1 th', render: (c) => pct(c.facts?.maxDrawdown) },
    {
      label: 'Posisi di rentang 52 mg',
      render: (c) => (c.facts?.range52w ? `${c.facts.range52w.positionPct.toFixed(0)}%` : '—'),
    },
    { label: 'Harga vs SMA50', render: (c) => pct(c.facts?.priceVsSma50Pct) },
    { label: 'Tren', render: (c) => c.facts?.trend ?? '—' },
    { label: 'Skor pendek', render: (c) => <ScoreText value={c.row.scores.pendek?.score} /> },
    { label: 'Skor menengah', render: (c) => <ScoreText value={c.row.scores.menengah?.score} /> },
    { label: 'Skor panjang', render: (c) => <ScoreText value={c.row.scores.panjang?.score} /> },
    { label: 'Putusan komite', render: (c) => <VerdictTag verdict={c.row.verdict?.verdict} /> },
    {
      label: 'Keyakinan komite',
      render: (c) => (c.row.verdict?.confidence != null ? `${c.row.verdict.confidence}/100` : '—'),
    },
  ]

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Bandingkan"
        lead="Taruh dua sampai empat instrumen berdampingan: imbal hasil lintas jangka waktu, risiko, skor, dan arah bukti komite."
        note="Imbal hasil dan volatilitas memakai rumus yang sama dengan yang dibaca komite, dihitung dari penutupan harian tersimpan (dalam persen)."
      />
      {error && <DatabaseNotice detail={error} />}
      {!error && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <IconScales size={14} />
              Perbandingan
            </span>
            <span className="panel-meta">
              {columns.length}/{MAX}
            </span>
          </div>
          <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
            <ComparePicker
              options={market.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, assetClass: m.assetClass }))}
              selected={columns.map((c) => c.row.id)}
              max={MAX}
            />
          </div>
          {columns.length === 0 ? (
            <Blank icon={<IconScales size={22} />} title="Pilih instrumen">
              Tambahkan minimal dua instrumen untuk mulai membandingkan.
            </Blank>
          ) : (
            <div className="scroll-x">
              <table className="grid compare-grid">
                <thead>
                  <tr>
                    <th className="compare-label" />
                    {columns.map((c) => (
                      <th key={c.row.id} className="num">
                        <Link href={`/ringkasan?symbol=${encodeURIComponent(c.row.symbol)}`} style={{ color: 'var(--ink)' }}>
                          {c.row.symbol}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="dim compare-label">Nama</td>
                    {columns.map((c) => (
                      <td key={c.row.id} className="num" style={{ color: 'var(--ink-soft)' }}>
                        {c.row.name}
                        {c.factsError && <div className="dim" style={{ fontSize: 11 }}>{c.factsError}</div>}
                      </td>
                    ))}
                  </tr>
                  {lines.map((line) => (
                    <tr key={line.label}>
                      <td className="dim compare-label">{line.label}</td>
                      {columns.map((c) => (
                        <td key={c.row.id} className="num">
                          {line.render(c)}
                        </td>
                      ))}
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
