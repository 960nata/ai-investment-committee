/**
 * Daftar instrumen.
 *
 * Server Component: query jalan di server, kredensial database tidak pernah ikut
 * ke bundel browser. Jumlah candle per instrumen ditampilkan apa adanya — itu
 * penanda paling jujur apakah riwayat sudah cukup panjang untuk di-backtest.
 */

import Link from 'next/link'
import { getCandleCountsByInstrument, listInstruments } from '@/lib/db/queries'
import type { InstrumentView } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Instrumen — Investasi',
}

/** Di bawah dua tahun data harian, normalisasi persentil belum bisa dipercaya. */
const MIN_CANDLES_FOR_PERCENTILE = 500

interface Row extends InstrumentView {
  candleCount: number
  latestDate: string | null
}

export default async function InstrumentsPage() {
  let rows: Row[] = []
  let error: string | null = null

  try {
    const instruments = await listInstruments(undefined, { includeDelisted: true })
    const counts = await getCandleCountsByInstrument(instruments.map((i) => i.id))
    rows = instruments.map((i) => ({
      ...i,
      candleCount: counts.get(i.id)?.count ?? 0,
      latestDate: counts.get(i.id)?.latestDate ?? null,
    }))
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Instrumen</h1>
        <p className="page-subtitle">
          Aset yang dilacak beserta panjang riwayat harga yang sudah tersimpan.
        </p>
      </div>

      {error && <ErrorCard message={error} />}

      {!error && rows.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-title">Belum Ada Instrumen</div>
            <div className="empty-state-text">
              Jalankan <code>npm run db:seed</code> untuk mengisi daftar instrumen awal,
              lalu tunggu dispatcher berjalan atau picu ingest dari Dashboard.
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{rows.length} instrumen</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {rows.filter((r) => r.candleCount >= MIN_CANDLES_FOR_PERCENTILE).length} punya
              riwayat cukup panjang
            </span>
          </div>

          <table className="instruments-table">
            <thead>
              <tr>
                <th>Simbol</th>
                <th>Nama</th>
                <th>Pasar</th>
                <th style={{ textAlign: 'right' }}>Candle</th>
                <th>Data terakhir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="symbol">
                    <Link
                      href={`/api/v1/instruments/${row.id}/candles`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {row.symbol}
                    </Link>
                  </td>
                  <td className="name">{row.name}</td>
                  <td>
                    <span className={`market-badge ${row.market.toLowerCase()}`}>
                      {row.market}
                    </span>
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: "'JetBrains Mono', monospace",
                      color:
                        row.candleCount === 0
                          ? 'var(--text-muted)'
                          : row.candleCount < MIN_CANDLES_FOR_PERCENTILE
                            ? 'var(--neutral)'
                            : 'var(--text-primary)',
                    }}
                  >
                    {row.candleCount.toLocaleString('id-ID')}
                  </td>
                  <td style={{ color: 'var(--text-tertiary)' }}>{row.latestDate ?? '—'}</td>
                  <td>
                    <HistoryLabel count={row.candleCount} delistedAt={row.delistedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HistoryLabel({ count, delistedAt }: { count: number; delistedAt: string | null }) {
  if (delistedAt) {
    return <Tag tone="muted">delisting {delistedAt}</Tag>
  }
  if (count === 0) {
    return <Tag tone="muted">belum ada data</Tag>
  }
  if (count < MIN_CANDLES_FOR_PERCENTILE) {
    return <Tag tone="warn">riwayat pendek</Tag>
  }
  return <Tag tone="ok">siap dianalisis</Tag>
}

function Tag({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const palette = {
    ok: { color: 'var(--positive)', bg: 'var(--positive-bg)', border: 'var(--positive-border)' },
    warn: { color: 'var(--neutral)', bg: 'var(--neutral-bg)', border: 'var(--neutral-border)' },
    muted: {
      color: 'var(--text-muted)',
      bg: 'var(--bg-glass)',
      border: 'var(--border-primary)',
    },
  }[tone]

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        color: palette.color,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      {children}
    </span>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{ borderColor: 'var(--negative-border)', background: 'var(--negative-bg)' }}
    >
      <div className="card-title" style={{ color: 'var(--negative)' }}>
        Database tidak terjangkau
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{message}</div>
    </div>
  )
}
