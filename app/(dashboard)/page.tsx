/**
 * Ringkasan — keadaan mesin dan data yang sudah masuk.
 *
 * Server Component: seluruh data dibaca di server, jadi halaman sudah terisi
 * pada muatan pertama dan kredensial basis data tidak pernah ikut ke peramban.
 * Hanya pemilih instrumen dan grafiknya yang berjalan di klien.
 *
 * Belum ada satu pun skor di halaman ini, dan itu disengaja. Skor baru muncul
 * setelah backtest membuktikan angkanya berarti; menampilkan angka yang belum
 * teruji lebih berbahaya daripada tidak menampilkan apa pun.
 */

import { InstrumentExplorer } from '@/components/instrument-explorer'
import { IngestButton } from '@/components/ingest-button'
import type { Candle } from '@/components/candlestick-chart'
import {
  IconCandles,
  IconClock,
  IconDatabase,
  IconFlask,
  IconPlug,
  IconQueue,
  IconRows,
} from '@/components/icons'
import { DatabaseNotice, Lamp, Track, type State } from '@/components/ui'
import {
  describeAge,
  getCandles,
  getDashboardStats,
  listAdapterHealth,
  listInstruments,
  STALE_AFTER_MINUTES,
  type DashboardStats,
} from '@/lib/db/queries'
import { isQStashConfigured } from '@/lib/queue/qstash'
import { cache } from '@/lib/cache/redis'

export const dynamic = 'force-dynamic'

const CHART_RANGE_DAYS = 180

export default async function OverviewPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null
  let error: string | null = null

  try {
    data = await load()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <header className="masthead">
        <p className="eyebrow">Fase 1 · engine fitur</p>
        <h1 className="headline">Ringkasan</h1>
        <p className="standfirst">
          Keadaan pipa data dan riwayat yang sudah tersimpan. Sumber gratis punya jeda, jadi
          alat ini tidak cocok untuk perdagangan harian.
        </p>
      </header>

      {error && <DatabaseNotice detail={error} />}

      {data && (
        <>
          <div className="statusbar">
            <span className="status-item">
              <Lamp state={data.adapterState} />
              {data.adapterSummary}
            </span>

            <span className="status-item">
              <IconClock size={14} />
              {data.stats.latestCandleDate ?? 'belum ada data'}
              <span style={{ color: 'var(--ink-faint)' }}>·</span>
              {describeAge(data.stats.ageMinutes)}
            </span>

            <span className="status-item">
              <Lamp state={freshnessState(data.stats.freshness)} />
              {freshnessLabel(data.stats.freshness)}
            </span>

            <span className="status-item">
              <IconQueue size={14} />
              antrian {data.queueConfigured ? 'aktif' : 'belum diset'}
            </span>

            {data.showManualIngest && (
              <span className="status-spacer">
                <IngestButton job="ingest-crypto-daily" />
              </span>
            )}
          </div>

          <div className="readouts">
            <Readout
              icon={<IconRows size={14} />}
              label="Instrumen"
              value={data.stats.instrumentCount.toLocaleString('id-ID')}
              note={
                data.stats.perMarket.length > 0
                  ? data.stats.perMarket.map((m) => `${m.market} ${m.instruments}`).join(' · ')
                  : 'belum ada yang terdaftar'
              }
            />

            <Readout
              icon={<IconCandles size={14} />}
              label="Candle harian"
              value={data.stats.candleCount.toLocaleString('id-ID')}
              note="riwayat yang ditabung sendiri"
            />

            <Readout
              icon={<IconPlug size={14} />}
              label="Adapter sehat"
              value={`${data.healthy}/${data.adapterCount}`}
              note="dibaca dari data_source_health"
              track={{
                value: data.adapterCount === 0 ? null : data.healthy / data.adapterCount,
                state: data.adapterState,
              }}
            />

            <Readout
              icon={<IconFlask size={14} />}
              label="Karantina"
              value={data.stats.quarantinedCount.toLocaleString('id-ID')}
              quiet={data.stats.quarantinedCount === 0}
              note={
                data.stats.quarantinedCount === 0
                  ? 'tidak ada baris yang ditolak'
                  : 'ditahan untuk diperiksa, bukan dibuang'
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

      {!data && !error && (
        <div className="panel">
          <div className="panel-body">
            <div className="blank">
              <IconDatabase size={22} />
              <div className="blank-title">Memuat</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Readout({
  icon,
  label,
  value,
  note,
  quiet,
  track,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note: string
  quiet?: boolean
  track?: { value: number | null; state: State }
}) {
  return (
    <div className="readout">
      <div className="readout-head">
        {icon}
        <span className="readout-label">{label}</span>
      </div>
      <div className={quiet ? 'readout-value quiet' : 'readout-value'}>{value}</div>
      {track && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Track value={track.value} state={track.state} ticks={16} label={label} />
        </div>
      )}
      <p className="readout-note">{note}</p>
    </div>
  )
}

async function load() {
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

  const healthy = health.filter((h) => h.status === 'healthy').length

  return {
    stats,
    adapterCount: health.length,
    healthy,
    adapterState: adapterState(health.map((h) => h.status)),
    adapterSummary: adapterSummary(health.map((h) => h.status)),
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
    // Pemicu manual hanya masuk akal di luar produksi; endpointnya pun tertutup.
    showManualIngest: process.env.NODE_ENV !== 'production',
  }
}

type AdapterStatus = Awaited<ReturnType<typeof listAdapterHealth>>[number]['status']

function adapterState(statuses: AdapterStatus[]): State {
  if (statuses.length === 0) return 'unknown'
  if (statuses.includes('dead')) return 'halted'
  if (statuses.includes('degraded')) return 'degraded'
  return 'ok'
}

function adapterSummary(statuses: AdapterStatus[]): string {
  if (statuses.length === 0) return 'adapter belum pernah dipanggil'
  const bad = statuses.filter((s) => s !== 'healthy').length
  return bad === 0
    ? `${statuses.length} adapter sehat`
    : `${bad} dari ${statuses.length} adapter bermasalah`
}

function freshnessState(freshness: DashboardStats['freshness']): State {
  if (freshness === 'fresh') return 'ok'
  if (freshness === 'stale') return 'halted'
  return 'unknown'
}

/**
 * Data basi diberi nama terang-terangan.
 *
 * Pembaca yang tidak tahu datanya mati akan mengambil keputusan berdasarkan
 * angka mati, dan itu kegagalan produk, bukan sekadar kegagalan teknis.
 */
function freshnessLabel(freshness: DashboardStats['freshness']): string {
  if (freshness === 'fresh') return 'data segar'
  if (freshness === 'stale') return `basi, lewat ${STALE_AFTER_MINUTES / 60} jam`
  return 'belum ada data'
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
