/**
 * Dashboard — Fase 0.
 *
 * Server Component: seluruh data dibaca di server, jadi halaman sudah terisi
 * pada muatan pertama dan kredensial database tidak pernah ikut ke browser.
 * Hanya pemilih instrumen dan grafiknya yang berjalan di klien.
 *
 * Yang ditampilkan di sini masih data mentah, belum skor. Skor baru muncul di
 * Fase 1, setelah backtest membuktikan angkanya berarti — menampilkan angka yang
 * belum teruji lebih berbahaya daripada tidak menampilkan apa pun.
 */

import { InstrumentExplorer } from '@/components/instrument-explorer'
import { IngestButton } from '@/components/ingest-button'
import type { Candle } from '@/components/candlestick-chart'
import {
  describeAge,
  getCandles,
  getDashboardStats,
  listAdapterHealth,
  listInstruments,
  type DashboardStats,
} from '@/lib/db/queries'
import { isQStashConfigured } from '@/lib/queue/qstash'
import { cache } from '@/lib/cache/redis'

export const dynamic = 'force-dynamic'

const CHART_RANGE_DAYS = 180

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof loadDashboard>> | null = null
  let error: string | null = null

  try {
    data = await loadDashboard()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Mesin analisis probabilistik multi-horizon. Sumber data gratis punya jeda, jadi
          sistem ini tidak cocok untuk perdagangan harian.
        </p>
      </div>

      {error && (
        <div
          className="card"
          style={{ borderColor: 'var(--negative-border)', background: 'var(--negative-bg)' }}
        >
          <div className="card-title" style={{ color: 'var(--negative)' }}>
            Database tidak terjangkau
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            {error}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
            Pastikan DATABASE_URL terisi di .env.local, lalu jalankan{' '}
            <code>npm run db:migrate</code> dan <code>npm run db:seed</code>.
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="pipeline-strip">
            <div className="pipeline-strip-item">
              <span className={`status-dot ${adapterDot(data.adapterStatuses)}`} />
              <span>{describeAdapters(data.adapterStatuses)}</span>
            </div>
            <div className="pipeline-strip-separator" />
            <div className="pipeline-strip-item">
              <span className={`status-dot ${freshnessDot(data.stats.freshness)}`} />
              <span>
                Data per {data.stats.latestCandleDate ?? '—'} · diperbarui{' '}
                {describeAge(data.stats.ageMinutes)}
                {data.stats.freshness === 'stale' && ' — sudah basi'}
              </span>
            </div>
            <div className="pipeline-strip-separator" />
            <div className="pipeline-strip-item">
              <span className={`status-dot ${data.queueConfigured ? 'healthy' : 'down'}`} />
              <span>Antrian {data.queueConfigured ? 'aktif' : 'belum diset'}</span>
            </div>
            {data.showManualIngest && (
              <div style={{ marginLeft: 'auto' }}>
                <IngestButton job="ingest-crypto-daily" />
              </div>
            )}
          </div>

          <div className="stats-grid">
            <StatCard
              tone="blue"
              icon="📊"
              title="Instrumen"
              value={data.stats.instrumentCount.toLocaleString('id-ID')}
              meta={data.stats.perMarket.map((m) => `${m.market} ${m.instruments}`).join(' · ')}
            />
            <StatCard
              tone="cyan"
              icon="🕯️"
              title="Total Candle"
              value={data.stats.candleCount.toLocaleString('id-ID')}
              meta="Riwayat harian tersimpan sendiri"
            />
            <StatCard
              tone="green"
              icon="🔌"
              title="Adapter Sehat"
              value={`${data.adapterStatuses.filter((a) => a === 'healthy').length}/${data.adapterStatuses.length}`}
              meta={
                data.adapterStatuses.length === 0
                  ? 'Belum ada adapter yang dipanggil'
                  : 'Dibaca dari data_source_health'
              }
            />
            <StatCard
              tone="amber"
              icon="🧪"
              title="Karantina"
              value={data.stats.quarantinedCount.toLocaleString('id-ID')}
              meta={
                data.stats.quarantinedCount === 0
                  ? 'Tidak ada baris ditolak'
                  : 'Baris ditahan untuk diperiksa'
              }
            />
          </div>

          <InstrumentExplorer
            instruments={data.instruments}
            initialInstrumentId={data.initialInstrumentId}
            initialCandles={data.initialCandles}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

async function loadDashboard() {
  const [stats, health, instruments] = await Promise.all([
    getDashboardStats(),
    listAdapterHealth(),
    listInstruments('CRYPTO'),
  ])

  const initialInstrumentId = instruments[0]?.id ?? null
  const initialCandles: Candle[] = initialInstrumentId
    ? (await getCandles(initialInstrumentId, isoDaysAgo(CHART_RANGE_DAYS), isoDaysAgo(0))).map(
        (c) => ({
          date: c.date,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume),
        }),
      )
    : []

  return {
    stats,
    adapterStatuses: health.map((h) => h.status),
    instruments: instruments.map((i) => ({
      id: i.id,
      symbol: i.symbol,
      name: i.name,
      market: i.market,
    })),
    initialInstrumentId,
    initialCandles,
    queueConfigured: isQStashConfigured(),
    cacheAvailable: cache.isAvailable(),
    // Pemicu manual hanya masuk akal di luar produksi; endpoint-nya pun ditutup.
    showManualIngest: process.env.NODE_ENV !== 'production',
  }
}

function StatCard({
  tone,
  icon,
  title,
  value,
  meta,
}: {
  tone: 'blue' | 'cyan' | 'green' | 'amber'
  icon: string
  title: string
  value: string
  meta: string
}) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      <div className="card-meta">{meta}</div>
    </div>
  )
}

type AdapterStatus = Awaited<ReturnType<typeof listAdapterHealth>>[number]['status']

function adapterDot(statuses: AdapterStatus[]): string {
  if (statuses.length === 0) return 'degraded'
  if (statuses.includes('dead')) return 'down'
  if (statuses.includes('degraded')) return 'degraded'
  return 'healthy'
}

function describeAdapters(statuses: AdapterStatus[]): string {
  if (statuses.length === 0) return 'Adapter belum pernah dipanggil'
  const unhealthy = statuses.filter((s) => s !== 'healthy').length
  if (unhealthy === 0) return `${statuses.length} adapter sehat`
  return `${unhealthy} dari ${statuses.length} adapter bermasalah`
}

function freshnessDot(freshness: DashboardStats['freshness']): string {
  if (freshness === 'fresh') return 'healthy'
  if (freshness === 'stale') return 'down'
  return 'degraded'
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
