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
import type { Candle } from '@/components/candlestick-chart'
import {
  IconCandles,
  IconClock,
  IconDatabase,
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
  listInstrumentQuotes,
  listLatestScores,
  STALE_AFTER_MINUTES,
  type DashboardStats,
} from '@/lib/db/queries'
import { TAB_LAYOUT } from '@/lib/db/schema'
import { MODEL_VERSION } from '@/lib/scoring/weights'
import type { HorizonView } from '@/components/score-panel'
import { isQStashConfigured } from '@/lib/queue/qstash'
import { cache } from '@/lib/cache/redis'
import { requireUser } from '@/lib/auth/user-auth'
import { CHART_HISTORY_YEARS } from '@/lib/format/chart-range'

export const dynamic = 'force-dynamic'

const CHART_RANGE_DAYS = CHART_HISTORY_YEARS * 366

interface OverviewPageProps {
  searchParams: Promise<{ symbol?: string; tab?: string }>
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  // Penjagaan yang mengikat. `proxy.ts` sudah memantulkan pengunjung anonim
  // lebih dulu, tetapi pemeriksaan di sini yang menjamin halaman ini tidak
  // pernah merender data untuk orang tanpa sesi.
  const session = await requireUser('/ringkasan')
  // Tautan dari menu dan pita harga membawa aset atau kelas aset yang diminta.
  // Tanpa dibaca di sini, setiap tautan menu mendarat di halaman yang sama dan
  // menunya berhenti berarti apa-apa.
  const { symbol, tab } = await searchParams

  let data: Awaited<ReturnType<typeof load>> | null = null
  let error: string | null = null

  try {
    data = await load({ symbol, tab })
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <header className="deck-hero">
        <span className="deck-hero-glow" aria-hidden="true" />

        <div className="deck-hero-body">
          <div className="deck-hero-main">
            <p className="deck-hero-badge mono">
              <span className="badge-live-pulse" />
              <span>
                TERMINAL KOMITE &middot; SESI{' '}
                {session.role === 'admin' ? 'ADMINISTRATOR' : 'ANALIS'}
              </span>
            </p>

            <h1 className="deck-hero-title">
              <span className="deck-hero-greeting">
                {greeting()}, {firstName(session.name)}.
              </span>
              <span className="deck-hero-headline">
                Ringkasan Pasar &amp; <span className="deck-hero-accent">Putusan Komite</span>
              </span>
            </h1>

            <p className="deck-hero-lead">
              Harga terkini, grafik candlestick lintas kelas aset, dan transkrip deliberasi empat
              agen AI &mdash; semuanya dibaca dari basis data yang sama, jadi tiap angka di layar
              ini bisa ditelusuri balik ke barisnya sendiri.
            </p>

            <div className="deck-hero-meta mono">
              <span className="deck-hero-date">{todayLabel()}</span>

              {data && (
                <>
                  <span className="deck-hero-chip">
                    <Lamp state={freshnessState(data.stats.freshness)} />
                    {freshnessLabel(data.stats.freshness)}
                  </span>
                  <span className="deck-hero-chip">
                    <IconQueue size={12} />
                    antrean {data.queueConfigured ? 'terjadwal' : 'manual'}
                  </span>
                  <span className="deck-hero-chip">
                    <IconDatabase size={12} />
                    cache {data.cacheAvailable ? 'aktif' : 'nonaktif'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Empat bacaan mesin. Bukan hiasan: ini yang menjawab "boleh percaya
              angka di bawah atau tidak" sebelum satu grafik pun dibuka. */}
          {data && (
            <div className="deck-hero-readouts">
              <Readout
                icon={<IconRows size={14} />}
                label="Instrumen aktif"
                value={formatCount(data.stats.instrumentCount)}
                note={`${data.tabs.length} kelas aset punya isi`}
              />
              <Readout
                icon={<IconCandles size={14} />}
                label="Candle harian"
                value={formatCount(data.stats.candleCount)}
                note={
                  data.stats.latestCandleDate
                    ? `terakhir ${data.stats.latestCandleDate}`
                    : 'belum ada lilin tersimpan'
                }
              />
              <Readout
                icon={<IconPlug size={14} />}
                label="Adapter data"
                value={`${data.healthy}/${data.adapterCount}`}
                note={data.adapterSummary}
                track={{
                  value: data.adapterCount > 0 ? data.healthy / data.adapterCount : null,
                  state: data.adapterState,
                }}
              />
              <Readout
                icon={<IconClock size={14} />}
                label="Pembaruan"
                value={describeAge(data.stats.ageMinutes)}
                quiet={data.stats.freshness !== 'fresh'}
                note={
                  data.stats.quarantinedCount > 0
                    ? `${formatCount(data.stats.quarantinedCount)} baris dikarantina`
                    : 'tidak ada baris dikarantina'
                }
              />
            </div>
          )}
        </div>
      </header>

      {error && <DatabaseNotice detail={error} />}

      {data && (
        <InstrumentExplorer
          instruments={data.instruments}
          scores={data.scores}
          tabs={data.tabs}
          initialInstrumentId={data.initialInstrumentId}
          initialCandles={data.initialCandles}
          initialTab={data.initialTab}
        />
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

async function load({ symbol, tab }: { symbol?: string; tab?: string } = {}) {
  const [stats, health, instruments, scores] = await Promise.all([
    getDashboardStats(),
    listAdapterHealth(),
    listInstrumentQuotes(),
    listLatestScores(MODEL_VERSION),
  ])

  // Skor dikelompokkan per instrumen dan diurutkan pendek, menengah, panjang —
  // urutan jangka waktu, bukan urutan abjad yang kebetulan berbeda.
  const order = { pendek: 0, menengah: 1, panjang: 2 }
  const scoresByInstrument: Record<number, { asOf: string; horizons: HorizonView[] }> = {}

  for (const row of scores) {
    const bucket = (scoresByInstrument[row.instrumentId] ??= { asOf: row.date, horizons: [] })
    bucket.horizons.push({
      horizon: row.horizon,
      score: row.score,
      confidence: row.confidence,
      missingWeight: row.missingWeight,
      drivers: row.drivers as HorizonView['drivers'],
    })
  }
  for (const bucket of Object.values(scoresByInstrument)) {
    bucket.horizons.sort((a, b) => order[a.horizon] - order[b.horizon])
  }

  // Instrumen pembuka: Bitcoin kalau ada, selainnya yang riwayatnya paling
  // panjang. Bukan yang pertama menurut abjad — grafik kosong sebagai kesan
  // pertama membuat seluruh halaman terlihat rusak padahal datanya ada di
  // instrumen sebelah.
  const requested = symbol?.trim().toUpperCase()
  const requestedMatch = requested
    ? instruments.find((i) => i.symbol.toUpperCase() === requested) ??
      instruments.find((i) => i.symbol.toUpperCase().startsWith(requested))
    : undefined

  // Tab yang diminta menu dipetakan ke grup tab yang benar-benar ada isinya.
  const requestedGroup = tab
    ? TAB_LAYOUT.find((group) => group.id === tab || group.children.some((c) => c.id === tab))
    : undefined
  const groupClasses = requestedGroup?.children.map((c) => c.id) ?? []
  const inRequestedGroup = groupClasses.length
    ? [...instruments]
        .filter((i) => groupClasses.includes(i.assetClass))
        .sort((a, b) => b.candleCount - a.candleCount)[0]
    : undefined

  const opening =
    requestedMatch ??
    inRequestedGroup ??
    instruments.find((i) => i.symbol === 'BTCUSDT' && i.candleCount > 0) ??
    [...instruments].sort((a, b) => b.candleCount - a.candleCount)[0]
  const initialInstrumentId = opening?.id ?? null
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

  // Tab hanya menampilkan kelas aset yang benar-benar punya instrumen.
  // Grup yang seluruh anaknya kosong disingkirkan; anak yang kosong di dalam
  // grup yang masih punya anak lain ikut disingkirkan juga.
  const present = new Set(instruments.map((i) => i.assetClass))
  const tabs = TAB_LAYOUT
    .map((group) => ({
      ...group,
      children: group.children.filter((c) => present.has(c.id)),
    }))
    .filter((group) => group.children.length > 0)

  // Tab pembuka mengikuti aset yang benar-benar terpilih, bukan permintaan
  // mentah: kalau ?tab= menunjuk kelas yang kosong, tab dan grafiknya akan
  // bicara tentang dua hal berbeda.
  const initialTab =
    tabs.find((t) => t.children.some((c) => c.id === opening?.assetClass))?.id ??
    requestedGroup?.id ??
    null

  return {
    stats,
    initialTab,
    adapterCount: health.length,
    healthy,
    adapterState: adapterState(health.map((h) => h.status)),
    adapterSummary: adapterSummary(health.map((h) => h.status)),
    instruments,
    scores: scoresByInstrument,
    tabs,
    initialInstrumentId,
    initialCandles,
    queueConfigured: isQStashConfigured(),
    cacheAvailable: cache.isAvailable(),
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

// ---------------------------------------------------------------------------
// Sapaan kepala halaman
// ---------------------------------------------------------------------------

/** Zona waktu acuan seluruh sapaan dan tanggal di kepala halaman. */
const DISPLAY_TZ = 'Asia/Jakarta'

/**
 * Sapaan menurut jam Jakarta, bukan jam peladen.
 *
 * Peladennya berjalan di UTC, dan "selamat pagi" yang dihitung dari UTC akan
 * salah tujuh jam bagi hampir semua pembacanya. `hourCycle: 'h23'` dipilih
 * eksplisit supaya tengah malam terbaca 0, bukan 24.
 */
function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DISPLAY_TZ,
    }).format(now),
  )

  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 19) return 'Selamat sore'
  return 'Selamat malam'
}

/**
 * Nama panggilan dari nama lengkap.
 *
 * Kepala halaman menyapa satu orang, dan nama tiga suku kata di tengah judul
 * membuat barisnya patah di tempat yang salah. Nama kosong jatuh ke sebutan
 * netral, bukan ke ruang kosong yang membuat kalimatnya terlihat rusak.
 */
function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0]
  return first || 'Analis'
}

/** Tanggal hari ini menurut jam Jakarta, ditulis panjang. */
function todayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DISPLAY_TZ,
  }).format(now)
}

/** Angka besar dengan pemisah ribuan lokal. */
function formatCount(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}
