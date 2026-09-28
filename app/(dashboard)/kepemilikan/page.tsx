/**
 * Kepemilikan KSEI (Beta) — komposisi pemegang saham IDX per akhir bulan,
 * lokal lawan asing, dirinci per jenis investor.
 *
 * Data dari berkas bulanan KSEI yang sudah ditarik job `ingest-ksei-monthly`.
 * Tanggal yang ditampilkan adalah tanggal posisi; berkasnya sendiri baru terbit
 * beberapa hari sesudahnya.
 */

import Link from 'next/link'
import { IconUsers } from '@/components/icons'
import { Blank, DatabaseNotice } from '@/components/ui'
import { BetaHead } from '@/components/member/page-head'
import { Sparkline } from '@/components/member/sparkline'
import { SymbolJump } from './symbol-jump'
import { requireUser } from '@/lib/auth/user-auth'
import { listOwnershipMovers, type OwnershipMover } from '@/lib/db/member-queries'
import { getOwnershipAsOf, type OwnershipPoint } from '@/lib/db/ownership-queries'
import { KSEI_INVESTOR_TYPES } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kepemilikan KSEI' }

const TYPE_LABEL: Record<(typeof KSEI_INVESTOR_TYPES)[number], string> = {
  IS: 'Asuransi',
  CP: 'Korporasi',
  PF: 'Dana pensiun',
  IB: 'Bank',
  ID: 'Individu',
  MF: 'Reksa dana',
  SC: 'Perusahaan efek',
  FD: 'Yayasan',
  OT: 'Lainnya',
}

function pct(v: number, digits = 2): string {
  return `${v.toFixed(digits).replace('.', ',')}%`
}

function signed(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} poin`
}

export default async function OwnershipPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  await requireUser('/kepemilikan')
  const { symbol } = await searchParams

  let movers: OwnershipMover[] = []
  let selected: OwnershipMover | null = null
  let history: OwnershipPoint[] = []
  let error: string | null = null
  try {
    movers = await listOwnershipMovers()
    const wanted = symbol?.trim().toUpperCase()
    selected =
      (wanted ? movers.find((m) => m.symbol.toUpperCase() === wanted || m.symbol.toUpperCase() === `${wanted}.JK`) : null) ??
      [...movers].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0] ??
      null
    if (selected) {
      history = await getOwnershipAsOf(selected.instrumentId, new Date().toISOString().slice(0, 10))
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const latest = history[0]
  const total = latest ? latest.localTotal + latest.foreignTotal : 0
  const trend = [...history].slice(0, 24).reverse()
  const inflow = [...movers].sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 10)
  const outflow = [...movers].sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 10)

  return (
    <>
      <BetaHead
        eyebrow="Riset"
        title="Kepemilikan KSEI"
        lead="Siapa yang memegang saham IDX: investor lokal atau asing, individu atau institusi — dan ke mana porsinya bergeser dari bulan ke bulan."
        note="Sumber: berkas komposisi kepemilikan bulanan KSEI (efek tanpa warkat). Porsi dihitung terhadap total lembar yang tercatat di KSEI."
      />
      {error && <DatabaseNotice detail={error} />}

      {!error && movers.length === 0 && (
        <section className="panel">
          <Blank icon={<IconUsers size={22} />} title="Belum ada data kepemilikan">
            Jalankan <code>npm run job ingest-ksei-monthly</code> untuk menarik berkas KSEI.
          </Blank>
        </section>
      )}

      {!error && selected && latest && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <IconUsers size={14} />
              {selected.symbol} · {selected.name}
            </span>
            <span className="panel-meta">posisi {latest.asOf}</span>
          </div>
          <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
            <SymbolJump options={movers.map((m) => ({ symbol: m.symbol, name: m.name }))} current={selected.symbol} />
          </div>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">Porsi asing</div>
              <div className="kpi-value">{pct(selected.foreignPct)}</div>
              <div className="kpi-note" style={{ color: selected.deltaPct > 0 ? 'var(--measured)' : selected.deltaPct < 0 ? 'var(--halted)' : undefined }}>
                {signed(selected.deltaPct)} sejak {selected.prevAsOf}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Porsi lokal</div>
              <div className="kpi-value">{pct(100 - selected.foreignPct)}</div>
              <div className="kpi-note">{latest.localTotal.toLocaleString('id-ID')} lembar</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Tren porsi asing</div>
              <Sparkline
                values={trend.map((p) => (p.foreignTotal / Math.max(1, p.localTotal + p.foreignTotal)) * 100)}
                label={`Tren porsi asing ${selected.symbol}`}
              />
              <div className="kpi-note">
                {trend.length} bulan terakhir{trend[0] ? ` sejak ${trend[0].asOf}` : ''}
              </div>
            </div>
          </div>
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Jenis investor</th>
                  <th className="num">Lokal</th>
                  <th className="num">Asing</th>
                  <th style={{ width: '40%' }}>Porsi dari total</th>
                </tr>
              </thead>
              <tbody>
                {KSEI_INVESTOR_TYPES.map((t, i) => {
                  const l = latest.local[i] ?? 0
                  const f = latest.foreign[i] ?? 0
                  if (l === 0 && f === 0) return null
                  return (
                    <tr key={t}>
                      <td>{TYPE_LABEL[t]}</td>
                      <td className="num">{total ? pct((l / total) * 100) : '—'}</td>
                      <td className="num">{total ? pct((f / total) * 100) : '—'}</td>
                      <td>
                        <div className="bar">
                          <span style={{ width: `${total ? (l / total) * 100 : 0}%`, background: 'var(--measured)' }} />
                          <span style={{ width: `${total ? (f / total) * 100 : 0}%`, background: 'var(--signal)' }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="panel-body">
            <div className="legend" style={{ marginTop: 0 }}>
              <span><i style={{ background: 'var(--measured)' }} />lokal</span>
              <span><i style={{ background: 'var(--signal)' }} />asing</span>
            </div>
          </div>
        </section>
      )}

      {!error && movers.length > 0 && (
        <div className="pair">
          {[
            { title: 'Porsi asing naik terbanyak', list: inflow },
            { title: 'Porsi asing turun terbanyak', list: outflow },
          ].map((block) => (
            <section key={block.title} className="panel">
              <div className="panel-head">
                <span className="panel-title">
                  <IconUsers size={14} />
                  {block.title}
                </span>
                <span className="panel-meta">bulan terakhir</span>
              </div>
              <div className="scroll-x">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Saham</th>
                      <th className="num">Porsi asing</th>
                      <th className="num">Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.list.map((m) => (
                      <tr key={m.instrumentId}>
                        <td className="key">
                          <Link href={`/kepemilikan?symbol=${encodeURIComponent(m.symbol)}`}>{m.symbol}</Link>
                        </td>
                        <td className="num">{pct(m.foreignPct)}</td>
                        <td className="num" style={{ color: m.deltaPct > 0 ? 'var(--measured)' : m.deltaPct < 0 ? 'var(--halted)' : undefined }}>
                          {signed(m.deltaPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
