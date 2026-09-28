/**
 * Rekam Jejak Komite (Beta) — putusan lama disandingkan dengan pergerakan
 * harga sesudahnya.
 *
 * Harga saat memutuskan dibaca dari `facts_snapshot`, fakta persis yang
 * dilihat komite, bukan dihitung ulang. Putusan yang dipakai ulang karena
 * candle-nya belum berubah digabung dengan aslinya: tanpa itu satu putusan
 * bisa terhitung lima kali dan statistiknya menggelembung.
 *
 * "Searah" di sini ukuran kasar, bukan backtest. Ia tidak memperhitungkan
 * horizon, biaya, atau pembanding pasar — halaman Backtest yang melakukannya.
 */

import Link from 'next/link'
import { IconHistory } from '@/components/icons'
import { Blank, DatabaseNotice, Tag } from '@/components/ui'
import { BetaHead } from '@/components/member/page-head'
import { VerdictTag } from '@/components/member/cells'
import { requireUser } from '@/lib/auth/user-auth'
import { listVerdictHistory, type VerdictHistoryRow } from '@/lib/db/member-queries'
import { listInstrumentQuotes } from '@/lib/db/queries'
import { formatPct, formatPriceIn } from '@/lib/format/market'
import { verdictLabel } from '@/lib/format/verdict'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rekam Jejak Komite' }

/** Rentang "berimbang" dianggap searah bila harga bergerak kurang dari ini. */
const FLAT_BAND_PCT = 5

type Outcome = 'searah' | 'berlawanan' | 'terlalu-dini' | 'tidak-dinilai'

interface Row extends VerdictHistoryRow {
  priceNow: number | null
  dateNow: string | null
  currency: string
  movePct: number | null
  outcome: Outcome
}

function judge(verdict: string, move: number | null, fresh: boolean): Outcome {
  if (verdict === 'abstain' || move === null) return 'tidak-dinilai'
  if (!fresh) return 'terlalu-dini'
  if (verdict === 'beli') return move > 0 ? 'searah' : 'berlawanan'
  if (verdict === 'jual') return move < 0 ? 'searah' : 'berlawanan'
  return Math.abs(move) < FLAT_BAND_PCT ? 'searah' : 'berlawanan'
}

export default async function TrackRecordPage({ searchParams }: { searchParams: Promise<{ verdict?: string }> }) {
  await requireUser('/rekam-jejak')
  const { verdict: filter } = await searchParams

  const rows: Row[] = []
  let error: string | null = null
  try {
    const [history, quotes] = await Promise.all([listVerdictHistory(300), listInstrumentQuotes()])
    const quoteById = new Map(quotes.map((q) => [q.id, q]))
    const seen = new Set<string>()
    // Riwayat terbaru dulu; dibalik supaya yang tersimpan adalah putusan asli
    // (paling awal), bukan salinannya.
    for (const h of [...history].reverse()) {
      const key = `${h.instrumentId ?? h.symbol}:${h.asOf ?? h.finishedAt.slice(0, 10)}:${h.verdict}`
      if (seen.has(key)) continue
      seen.add(key)
      const q = h.instrumentId !== null ? quoteById.get(h.instrumentId) : undefined
      const priceNow = q?.lastClose ?? null
      const move =
        priceNow !== null && h.priceAtDecision !== null && h.priceAtDecision > 0
          ? (priceNow / h.priceAtDecision - 1) * 100
          : null
      // Belum ada candle baru sejak putusan: terlalu dini untuk dinilai.
      const fresh = Boolean(q?.lastDate && h.asOf && q.lastDate > h.asOf)
      rows.push({
        ...h,
        priceNow,
        dateNow: q?.lastDate ?? null,
        currency: q?.currency ?? '',
        movePct: move,
        outcome: judge(h.verdict, move, fresh),
      })
    }
    rows.reverse()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const verdicts = ['beli', 'tahan', 'jual', 'abstain'] as const
  const stats = verdicts.map((v) => {
    const all = rows.filter((r) => r.verdict === v)
    const judged = all.filter((r) => r.outcome === 'searah' || r.outcome === 'berlawanan')
    const aligned = judged.filter((r) => r.outcome === 'searah').length
    const moves = judged.map((r) => r.movePct as number)
    return {
      verdict: v,
      count: all.length,
      judged: judged.length,
      alignedPct: judged.length ? (aligned / judged.length) * 100 : null,
      avgMove: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
    }
  })

  const shown = filter && verdicts.includes(filter as (typeof verdicts)[number]) ? rows.filter((r) => r.verdict === filter) : rows

  return (
    <>
      <BetaHead
        eyebrow="Riset"
        title="Rekam Jejak Komite"
        lead="Setiap putusan komite yang sudah selesai, disandingkan dengan pergerakan harga sejak putusan itu dibuat — supaya Anda bisa menilai sendiri seberapa sering arah buktinya searah dengan pasar."
        note={`“Searah” berarti: bukti positif lalu harga naik, bukti negatif lalu harga turun, atau bukti berimbang lalu harga bergerak kurang dari ±${FLAT_BAND_PCT}%. Ini ukuran kasar tanpa memperhitungkan horizon atau biaya; untuk uji yang ketat lihat halaman Backtest. Kinerja masa lalu tidak menjamin hasil mendatang.`}
      />
      {error && <DatabaseNotice detail={error} />}

      {!error && (
        <>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconHistory size={14} />
                Ringkasan
              </span>
              <span className="panel-meta">{rows.length} putusan unik</span>
            </div>
            <div className="kpis">
              {stats.map((s) => (
                <Link
                  key={s.verdict}
                  href={filter === s.verdict ? '/rekam-jejak' : `/rekam-jejak?verdict=${s.verdict}`}
                  className="kpi"
                  style={{ outline: filter === s.verdict ? '1px solid var(--signal)' : undefined }}
                >
                  <div className="kpi-label">{verdictLabel(s.verdict)}</div>
                  <div className="kpi-value">{s.count}</div>
                  <div className="kpi-note">
                    {s.verdict === 'abstain'
                      ? 'tidak dinilai'
                      : s.alignedPct === null
                        ? 'belum ada yang bisa dinilai'
                        : `${s.alignedPct.toFixed(0)}% searah dari ${s.judged} · rata-rata ${formatPct(s.avgMove)}`}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconHistory size={14} />
                Riwayat putusan
              </span>
              {filter && (
                <span className="panel-meta">
                  <Link href="/rekam-jejak">tampilkan semua</Link>
                </span>
              )}
            </div>
            {shown.length === 0 ? (
              <Blank icon={<IconHistory size={22} />} title="Belum ada putusan">
                Putusan muncul di sini setelah rapat komite selesai.
              </Blank>
            ) : (
              <div className="scroll-x">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Simbol</th>
                      <th>Putusan</th>
                      <th className="num">Keyakinan</th>
                      <th className="num">Harga saat itu</th>
                      <th className="num">Harga terakhir</th>
                      <th className="num">Sejak putusan</th>
                      <th>Hasil</th>
                      <th>Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 150).map((r) => (
                      <tr key={r.sessionId}>
                        <td className="dim" style={{ whiteSpace: 'nowrap' }}>{r.asOf ?? r.finishedAt.slice(0, 10)}</td>
                        <td className="key">
                          <Link href={`/ringkasan?symbol=${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                        </td>
                        <td>
                          <VerdictTag verdict={r.verdict} />
                        </td>
                        <td className="num">{r.confidence != null ? `${r.confidence}/100` : '—'}</td>
                        <td className="num">{formatPriceIn(r.priceAtDecision, r.currency)}</td>
                        <td className="num">{formatPriceIn(r.priceNow, r.currency)}</td>
                        <td className="num" style={{ color: r.movePct == null ? undefined : r.movePct >= 0 ? 'var(--measured)' : 'var(--halted)' }}>
                          {formatPct(r.movePct)}
                        </td>
                        <td>
                          {r.outcome === 'searah' ? (
                            <Tag tone="ok">searah</Tag>
                          ) : r.outcome === 'berlawanan' ? (
                            <Tag tone="down">berlawanan</Tag>
                          ) : r.outcome === 'terlalu-dini' ? (
                            <Tag>terlalu dini</Tag>
                          ) : (
                            <Tag>—</Tag>
                          )}
                        </td>
                        <td className="wrap" title={r.rationale ?? undefined}>
                          {(r.rationale ?? '').slice(0, 140)}
                          {(r.rationale ?? '').length > 140 ? '…' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
