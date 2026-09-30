/**
 * Analitik pengguna — dibaca langsung dari Google Analytics 4.
 *
 * Halaman ini sebelumnya berisi konstanta karangan: daftar IP pengunjung
 * lengkap dengan ISP dan kota, jumlah kunjungan per halaman, sampai log
 * serangan siber yang "dicegah WAF". Tidak satu pun punya sumber. Angka
 * karangan di layar admin lebih berbahaya daripada layar kosong, karena
 * pembacanya mengambil keputusan berdasarkan angka yang tidak pernah ada.
 *
 * Yang tersisa sekarang hanya yang benar-benar bisa dijawab GA4. Dua bagian
 * lama sengaja tidak dibuatkan penggantinya:
 *
 *   - Tabel pengunjung per IP. GA4 membuang alamat IP di sisi Google, jadi ini
 *     tidak mungkin diisi dari sumber ini dalam bentuk apa pun. Penggantinya
 *     yang jujur adalah sebaran kota, dan itu ada di bawah.
 *   - Radar serangan siber & log WAF. Saat komentar ini pertama ditulis, proyek
 *     ini tidak punya penyaring apa pun dan tidak mencatat insiden ke mana pun,
 *     jadi tidak ada yang bisa dibaca. Sekarang ada — tetapi tempatnya bukan di
 *     sini. Lihat `/admin/keamanan`, yang isinya blokir sungguhan dari
 *     `lib/http/shield.ts`, bukan angka karangan seperti bagian yang dihapus.
 *
 * Server Component: kredensial service account dibaca di server dan tidak
 * pernah ikut ke peramban. Pemilih rentang waktu berupa tautan biasa, bukan
 * state klien, supaya rentang yang sedang dibuka ikut tersimpan di alamat.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconActivity,
  IconAlert,
  IconClock,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconExternalLink,
  IconEye,
  IconGlobe,
  IconLayers,
  IconRadar,
  IconTrendDown,
  IconTrendUp,
  IconUser,
} from '@/components/icons'
import {
  getGa4Overview,
  getGa4Realtime,
  getMeasurementId,
  isGa4Configured,
  parseRange,
  RANGE_LABELS,
  type Ga4Overview,
  type Ga4Range,
  type Ga4Realtime,
  type Ga4Slice,
} from '@/lib/analytics/ga4'
import {
  getVisitAnalytics,
  getVisitSummary,
  parseVisitWindow,
  type VisitAnalytics,
  type VisitSummary,
  type VisitWindow,
} from '@/lib/db/visit-queries'
import { TrafficReport } from './traffic-report'
import { VisitorMap } from '@/components/visitor-map'
import { RealtimeRefresh } from './realtime-refresh'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Analitik Pengguna | Admin AI Investdesk',
  description:
    'Telemetri kunjungan dari Google Analytics 4: pengguna aktif, halaman teratas, perangkat, saluran akuisisi, dan sebaran kota.',
}

const RANGES: Ga4Range[] = ['24h', '7d', '30d']

interface AnalyticsPageProps {
  searchParams: Promise<{ range?: string; heat?: string }>
}

export default async function AdminAnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { range: rawRange, heat } = await searchParams
  const range = parseRange(rawRange)

  const measurementId = getMeasurementId()
  const configured = isGa4Configured()

  let data: Ga4Overview | null = null
  let error: string | null = null
  let live: Ga4Realtime | null = null

  if (configured) {
    // Realtime ditarik terpisah dan kegagalannya ditelan: laporan harian yang
    // sehat tidak boleh ikut hilang hanya karena kuota realtime sedang habis.
    const [overview, realtime] = await Promise.allSettled([
      getGa4Overview(range),
      getGa4Realtime(),
    ])
    if (overview.status === 'fulfilled') data = overview.value
    else error = overview.reason instanceof Error ? overview.reason.message : String(overview.reason)
    if (realtime.status === 'fulfilled') live = realtime.value
  }

  // Sebaran pengunjung dibaca dari catatan kunjungan milik aplikasi sendiri,
  // bukan dari GA4. Sengaja terpisah: GA4 membuang alamat IP di sisi Google dan
  // tidak pernah mengembalikan koordinat, jadi peta tidak akan pernah bisa
  // diisi dari sana. Bagian ini tetap hidup walau GA4 belum dikonfigurasi.
  const visitWindow = toVisitWindow(range)
  let visits: VisitSummary | null = null
  let visitsError: string | null = null
  let traffic: VisitAnalytics | null = null
  let trafficError: string | null = null

  // Laporan trafik internal berjalan bersama peta. Dibatasi waktunya: pooler
  // basis data sesekali macet, dan halaman admin yang menggantung selamanya
  // lebih buruk daripada satu kotak berisi "muat ulang".
  const [summaryResult, trafficResult] = await Promise.allSettled([
    getVisitSummary(visitWindow),
    withTimeout(getVisitAnalytics(visitWindow, heat), 20_000),
  ])
  if (summaryResult.status === 'fulfilled') visits = summaryResult.value
  else visitsError = errorText(summaryResult.reason)
  if (trafficResult.status === 'fulfilled') traffic = trafficResult.value
  else trafficError = errorText(trafficResult.reason)

  return (
    <div className="admin-page-content an-page" suppressHydrationWarning>
      {/* 1. KEPALA HALAMAN: judul, rentang, status integrasi dalam satu baris */}
      <header className="an-head">
        <div className="an-head-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span>TELEMETRI PENGUNJUNG</span>
          </div>
          <h1 className="admin-page-headline">
            Analitik <span className="admin-headline-accent">Pengguna</span>
          </h1>
          <p className="an-head-sub">
            Dicatat sendiri oleh aplikasi. Tidak ada angka contoh: bagian yang kosong memang belum
            ada datanya.
          </p>
        </div>

        <div className="an-head-side">
          <nav className="an-range mono" aria-label="Rentang waktu">
            {RANGES.map((option) => (
              <Link
                key={option}
                href={`/admin/analytics?range=${option}`}
                className={`an-range-link${option === range ? ' active' : ''}`}
                aria-current={option === range ? 'page' : undefined}
              >
                {RANGE_LABELS[option]}
              </Link>
            ))}
          </nav>
          <ul className="an-status mono" aria-label="Status integrasi">
            <StatusDot ok={Boolean(traffic)} label="Pencatat" value={traffic ? 'aktif' : 'galat'} />
            <StatusDot ok={Boolean(measurementId)} label="gtag" value={measurementId ?? 'belum'} />
            <StatusDot ok={configured} label="GA4 API" value={configured ? 'terhubung' : 'belum'} />
          </ul>
        </div>
      </header>

      {/*
       * 2. PETA. Sumbernya catatan kunjungan milik aplikasi sendiri, bukan GA4,
       * jadi ia berdiri di luar seluruh percabangan GA4 — dan petanya tetap
       * digambar walau datanya kosong atau kuerinya gagal; keadaannya ditulis
       * di atas peta, bukan menggantikannya.
       */}
      <VisitorGeoSection
        summary={visits}
        error={visitsError}
        live={traffic?.live ?? null}
        rangeLabel={RANGE_LABELS[range]}
      />

      {/* 3. LAPORAN TRAFIK */}
      {traffic ? (
        <TrafficReport data={traffic} range={range} />
      ) : (
        trafficError && (
          <div className="ga-notice ga-notice-error">
            <IconAlert size={18} />
            <div>
              <h2 className="ga-notice-title">Laporan trafik gagal dimuat</h2>
              <p className="ga-notice-body">
                Biasanya sementara. <Link href={`/admin/analytics?range=${range}`}>Muat ulang</Link>{' '}
                halaman ini.
              </p>
              <p className="ga-notice-body mono ga-notice-detail">{trafficError}</p>
            </div>
          </div>
        )
      )}

      {live && <RealtimeSection live={live} />}

      {configured && error && (
        <div className="ga-notice ga-notice-error">
          <IconAlert size={18} />
          <div>
            <h2 className="ga-notice-title">Data API menolak permintaan</h2>
            <p className="ga-notice-body mono">{error}</p>
            <p className="ga-notice-body">
              Penyebab paling sering: service account belum ditambahkan sebagai Viewer di properti
              GA4, atau <span className="mono">GA4_PROPERTY_ID</span> masih diisi id pengukuran
              (&ldquo;G-&hellip;&rdquo;) alih-alih nomor properti.
            </p>
          </div>
        </div>
      )}

      {data?.empty && !live?.activeLast30 && (
        <div className="ga-notice">
          <IconActivity size={18} />
          <div>
            <h2 className="ga-notice-title">Terhubung, tetapi belum ada kunjungan tercatat</h2>
            <p className="ga-notice-body">
              Properti terbaca dengan benar dan tidak ada galat. GA4 biasanya butuh beberapa jam
              sejak tag pertama kali dipasang sebelum laporan harian terisi; laporan realtime muncul
              lebih dulu.
            </p>
          </div>
        </div>
      )}

      {data && !data.empty && <Report data={data} />}

      {/* GA4 jadi pelengkap: hanya tampil kalau kredensial Data API diisi. */}
      {!configured && <SetupNotice measurementId={measurementId} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bagian-bagian laporan
// ---------------------------------------------------------------------------

function Report({ data }: { data: Ga4Overview }) {
  const { current, previous } = data

  return (
    <>
      {/* 2. KARTU RINGKASAN */}
      <div className="admin-stats-grid" suppressHydrationWarning>
        <StatCard
          label="PENGGUNA AKTIF SAAT INI"
          icon={<IconActivity size={16} />}
          tone="live"
          value={formatCount(data.activeNow)}
          foot="laporan realtime GA4 · 30 menit terakhir"
        />
        <StatCard
          label="TOTAL PENGGUNA"
          icon={<IconUser size={16} />}
          value={formatCount(current.totalUsers)}
          delta={delta(current.totalUsers, previous.totalUsers)}
          foot={`${formatCount(current.newUsers)} di antaranya pengguna baru`}
        />
        <StatCard
          label="TAYANGAN HALAMAN"
          icon={<IconEye size={16} />}
          value={formatCount(current.pageViews)}
          delta={delta(current.pageViews, previous.pageViews)}
          foot={`${formatCount(current.sessions)} sesi`}
        />
        <StatCard
          label="RATA-RATA DURASI SESI"
          icon={<IconClock size={16} />}
          value={formatDuration(current.avgSessionDuration)}
          delta={delta(current.avgSessionDuration, previous.avgSessionDuration)}
          foot={`rasio pentalan ${formatPercent(current.bounceRate)}`}
        />
      </div>

      {/* 3. HALAMAN TERATAS */}
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">HALAMAN PALING BANYAK DIBUKA</span>
        <span className="admin-section-line" />
      </div>

      <div className="admin-table-card" suppressHydrationWarning>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '44%' }}>Halaman</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Tayangan</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Pengguna</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Rata-rata</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Pentalan</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((page) => (
                <tr key={page.path}>
                  <td>
                    <div className="admin-news-title-cell">
                      <span className="ga-page-title">{page.title}</span>
                      <span className="ga-page-path mono">{page.path}</span>
                    </div>
                  </td>
                  <td className="mono ga-num">{formatCount(page.views)}</td>
                  <td className="mono ga-num">{formatCount(page.users)}</td>
                  <td className="mono ga-num quiet">{formatDuration(page.avgTime)}</td>
                  <td className="mono ga-num quiet">{formatPercent(page.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. PERANGKAT, SISTEM OPERASI, PERAMBAN, SALURAN */}
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">PERANGKAT &amp; SALURAN AKUISISI</span>
        <span className="admin-section-line" />
      </div>

      <div className="ga-bars-grid" suppressHydrationWarning>
        <BarPanel
          title="Jenis perangkat"
          icon={<IconDeviceDesktop size={14} />}
          rows={data.devices}
          renderIcon={deviceIcon}
        />
        <BarPanel title="Sistem operasi" icon={<IconLayers size={14} />} rows={data.operatingSystems} />
        <BarPanel title="Peramban" icon={<IconGlobe size={14} />} rows={data.browsers} />
        <BarPanel title="Saluran akuisisi" icon={<IconRadar size={14} />} rows={data.channels} />
      </div>

      {/* 5. SEBARAN KOTA */}
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">SEBARAN GEOGRAFIS</span>
        <span className="admin-section-line" />
      </div>

      <div className="admin-table-card" suppressHydrationWarning>
        <div className="admin-table-card-head">
          <div>
            <h2 className="admin-table-title">Kota dengan pengguna terbanyak</h2>
            <p className="admin-table-subtitle mono">
              Teragregasi per kota. GA4 tidak mengembalikan alamat IP maupun ISP pengunjung, jadi
              kota adalah tingkat paling dalam yang bisa ditampilkan di sini.
            </p>
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '46%' }}>Kota</th>
                <th style={{ width: '24%' }}>Negara</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Pengguna</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Sesi</th>
              </tr>
            </thead>
            <tbody>
              {data.geo.map((row) => (
                <tr key={`${row.country}-${row.city}`}>
                  <td>{row.city}</td>
                  <td className="mono quiet">{row.country}</td>
                  <td className="mono ga-num">{formatCount(row.users)}</td>
                  <td className="mono ga-num quiet">{formatCount(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/**
 * Padanan kartu "Realtime" di GA4: pengguna aktif 30 & 5 menit, grafik per
 * menit, lalu rincian sumber, audiens, halaman, peristiwa, dan perangkat.
 */
function RealtimeSection({ live }: { live: Ga4Realtime }) {
  // Grafik dibaca kiri ke kanan: -29 menit sampai menit ini.
  const bars = [...live.perMinute].reverse()
  const peak = Math.max(1, ...bars)

  return (
    <>
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">REALTIME · 30 MENIT TERAKHIR</span>
        <span className="admin-section-line" />
        <RealtimeRefresh seconds={60} />
      </div>

      <div className="ga-live-card" suppressHydrationWarning>
        <div className="ga-live-figures">
          <div>
            <span className="ga-live-label mono">Pengguna aktif · 30 menit</span>
            <span className="ga-live-number mono">{formatCount(live.activeLast30)}</span>
          </div>
          <div>
            <span className="ga-live-label mono">Pengguna aktif · 5 menit</span>
            <span className="ga-live-number small mono">{formatCount(live.activeLast5)}</span>
          </div>
        </div>

        <div className="ga-live-chart-wrap">
          <span className="ga-live-label mono">Pengguna aktif per menit</span>
          <div className="ga-live-chart" role="img" aria-label="Pengguna aktif per menit, 30 menit terakhir">
            {bars.map((value, index) => (
              <div
                key={index}
                className="ga-live-bar"
                style={{ height: `${Math.max(value > 0 ? 6 : 2, (value / peak) * 100)}%` }}
                title={`${29 - index === 0 ? 'menit ini' : `-${29 - index} menit`}: ${value} pengguna`}
              />
            ))}
          </div>
          <div className="ga-live-axis mono">
            <span>-30 mnt</span>
            <span>-15 mnt</span>
            <span>sekarang</span>
          </div>
        </div>
      </div>

      <div className="ga-bars-grid" suppressHydrationWarning>
        <BarPanel
          title="Judul halaman & layar"
          icon={<IconEye size={14} />}
          rows={live.screens}
          unit="tayangan"
        />
        <BarPanel
          title="Perangkat"
          icon={<IconDeviceDesktop size={14} />}
          rows={live.devices}
          renderIcon={deviceIcon}
          unit="pengguna"
        />
        <BarPanel
          title="Sumber pengguna pertama"
          icon={<IconRadar size={14} />}
          rows={live.sources}
          unit="pengguna"
        />
        <BarPanel title="Negara" icon={<IconGlobe size={14} />} rows={live.countries} unit="pengguna" />
        <BarPanel title="Audiens" icon={<IconUser size={14} />} rows={live.audiences} unit="pengguna" />
        <BarPanel
          title="Jumlah peristiwa"
          icon={<IconActivity size={14} />}
          rows={live.events}
          unit="peristiwa"
        />
        <BarPanel
          title="Peristiwa utama"
          icon={<IconLayers size={14} />}
          rows={live.keyEvents}
          unit="peristiwa"
        />
      </div>
    </>
  )
}

/**
 * Rentang GA4 dipetakan ke rentang catatan kunjungan.
 *
 * Keduanya memakai nama yang sama untuk tiga pilihan pertama, jadi pemetaannya
 * sepele — tetapi ditulis terang-terangan supaya penambahan rentang di salah
 * satu sisi tidak diam-diam jatuh ke nilai bawaan di sisi yang lain.
 */
function toVisitWindow(range: Ga4Range): VisitWindow {
  return parseVisitWindow(range)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Basis data tidak menjawab dalam ${ms / 1000} detik.`)), ms),
    ),
  ])
}

/**
 * Pesan galat yang layak tampil di layar.
 *
 * Drizzle membungkus galat Postgres jadi "Failed query: <seluruh SQL> params:",
 * dan untuk kueri skema itu berarti empat puluh baris DDL di tengah halaman
 * tanpa satu kata pun tentang penyebabnya. Penyebab aslinya ada di `cause`.
 */
function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  if (err.message.startsWith('Failed query:')) {
    const cause = err.cause instanceof Error ? err.cause.message : null
    return cause ? `Kueri basis data gagal: ${cause}` : 'Kueri basis data gagal.'
  }
  return err.message
}

/**
 * Peta sebaran pengunjung berikut ringkasannya.
 *
 * Tiga keadaan, dan masing-masing mengatakan hal yang berbeda: kueri gagal,
 * belum ada kunjungan berkoordinat sama sekali, atau ada dan digambar. Ketiganya
 * sengaja dibedakan — "peta kosong" yang berarti "basis data mati" dan yang
 * berarti "memang belum ada pengunjung" menuntut tindakan yang tidak sama.
 * Petanya sendiri selalu digambar; keadaannya ditulis di atasnya.
 */
function VisitorGeoSection({
  summary,
  error,
  live,
  rangeLabel,
}: {
  summary: VisitSummary | null
  error: string | null
  live: VisitAnalytics['live'] | null
  rangeLabel: string
}) {
  const points = summary?.points ?? []
  const plotted = points.reduce((total, point) => total + point.visits, 0)
  const cities = points.slice(0, 8)
  const maxCity = Math.max(1, ...cities.map((point) => point.visits))
  const countries = (summary?.countries ?? []).slice(0, 6)
  const countryTotal = (summary?.countries ?? []).reduce((total, row) => total + row.visits, 0)

  const notice = error
    ? 'Catatan kunjungan tidak terbaca — muat ulang halaman'
    : points.length > 0
      ? null
      : summary && summary.totalVisits > 0
        ? `${formatCount(summary.totalVisits)} kunjungan, belum ada yang berkoordinat`
        : 'Belum ada kunjungan pada rentang ini'

  return (
    <section className="an-geo" aria-label="Peta sebaran pengunjung" suppressHydrationWarning>
      <div className="an-geo-map">
        <VisitorMap points={points} notice={notice} />

        {live && (
          <div className={`an-geo-live mono${live.last5 > 0 ? ' is-active' : ''}`}>
            <span className="an-geo-live-dot" aria-hidden="true" />
            <b>{formatCount(live.last5)}</b>
            <span>aktif sekarang</span>
            <span className="an-geo-live-sep" aria-hidden="true">·</span>
            <b>{formatCount(live.last30)}</b>
            <span>30 mnt</span>
          </div>
        )}

        <dl className="an-geo-stats mono">
          <div>
            <dt>Kunjungan</dt>
            <dd>{summary ? formatCount(summary.totalVisits) : '—'}</dd>
          </div>
          <div>
            <dt>Pengunjung</dt>
            <dd>{summary ? formatCount(summary.totalVisitors) : '—'}</dd>
          </div>
          <div>
            <dt>Kota</dt>
            <dd>{formatCount(points.length)}</dd>
          </div>
          <div>
            <dt>Negara</dt>
            <dd>{formatCount(summary?.countries.length ?? 0)}</dd>
          </div>
        </dl>
      </div>

      <aside className="an-geo-side">
        <div className="an-geo-side-head mono">
          <IconGlobe size={13} />
          <span>Asal pengunjung</span>
          <span className="an-geo-range">{rangeLabel}</span>
        </div>

        {error ? (
          <p className="an-geo-error mono">{error}</p>
        ) : (
          <>
            <h2 className="an-geo-title mono">Kota teratas</h2>
            {cities.length === 0 ? (
              <p className="tr-muted mono">belum ada kota tercatat</p>
            ) : (
              <ol className="an-geo-list">
                {cities.map((point, i) => (
                  <li key={`${point.city}-${point.latitude}-${point.longitude}`}>
                    <span className="an-geo-rank mono">{i + 1}</span>
                    <div className="an-geo-row">
                      <div className="an-geo-row-top">
                        <span className="an-geo-name">
                          {point.city}
                          {point.country && <span className="an-geo-cc mono">{point.country}</span>}
                        </span>
                        <span className="an-geo-value mono">{formatCount(point.visits)}</span>
                      </div>
                      <span className="an-geo-bar">
                        <span style={{ width: `${(point.visits / maxCity) * 100}%` }} />
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {countries.length > 0 && (
              <>
                <h2 className="an-geo-title mono">Negara</h2>
                <ul className="an-geo-countries mono">
                  {countries.map((row) => (
                    <li key={row.country}>
                      <span className="an-geo-cc-lg">{row.country}</span>
                      <span className="an-geo-share">
                        {countryTotal > 0 ? `${((row.visits / countryTotal) * 100).toFixed(1)}%` : '—'}
                      </span>
                      <span className="an-geo-value">{formatCount(row.visits)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="an-geo-foot mono">
              {points.length > cities.length && <>+ {points.length - cities.length} kota lain · </>}
              {summary && summary.withoutLocation > 0
                ? `${formatCount(summary.withoutLocation)} kunjungan tanpa lokasi`
                : plotted > 0
                  ? 'semua kunjungan berlokasi'
                  : 'lokasi dari geolokasi IP di tepi jaringan'}
              . Alamat IP tidak pernah disimpan.
            </p>
          </>
        )}
      </aside>
    </section>
  )
}

function StatusDot({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <li className={ok ? 'ok' : 'warn'} title={`${label}: ${value}`}>
      <i aria-hidden="true" />
      <span>{label}</span>
      <b>{value}</b>
    </li>
  )
}

function StatCard({
  label,
  icon,
  value,
  delta: change,
  foot,
  tone,
}: {
  label: string
  icon: React.ReactNode
  value: string
  delta?: number | null
  foot: string
  tone?: 'live'
}) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-top">
        <span className="admin-stat-label mono">{label}</span>
        <div
          className="admin-stat-icon-wrap"
          style={{ color: tone === 'live' ? 'var(--green)' : 'var(--signal)' }}
        >
          {icon}
        </div>
      </div>

      <div
        className="admin-stat-number mono"
        style={tone === 'live' ? { color: 'var(--green)' } : undefined}
      >
        {value}
      </div>

      <div className="admin-stat-meta mono">
        {change !== undefined && change !== null && <Delta value={change} />}
        <span>{foot}</span>
      </div>
    </div>
  )
}

/**
 * Selisih terhadap periode sebelumnya.
 *
 * Kenaikan tidak otomatis hijau dan penurunan tidak otomatis merah di seluruh
 * produk ini, tetapi untuk trafik arahnya memang tidak ambigu, jadi di sini
 * warnanya dipakai. Periode sebelumnya yang nol tidak menghasilkan "naik tak
 * terhingga" melainkan tidak menampilkan apa pun.
 */
function Delta({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span className={`ga-delta ${up ? 'up' : 'down'}`}>
      {up ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
      {up ? '+' : ''}
      {(value * 100).toFixed(1)}%
    </span>
  )
}

function BarPanel({
  title,
  icon,
  rows,
  renderIcon,
  unit = 'sesi',
}: {
  title: string
  icon: React.ReactNode
  /** `null` berarti Google menolak laporannya, bukan belum ada data. */
  rows: Ga4Slice[] | null
  renderIcon?: (label: string) => React.ReactNode
  unit?: string
}) {
  return (
    <div className="ga-bar-panel">
      <div className="ga-bar-panel-head mono">
        {icon}
        <span>{title}</span>
      </div>

      {rows === null && <p className="ga-bar-empty mono">tidak tersedia di laporan realtime</p>}
      {rows?.length === 0 && <p className="ga-bar-empty mono">belum ada data</p>}

      {rows?.map((row) => (
        <div key={row.label} className="ga-bar-row">
          <div className="ga-bar-label mono">
            {renderIcon?.(row.label)}
            <span className="ga-bar-name">{row.label}</span>
            <span className="ga-bar-value">{formatPercent(row.share)}</span>
          </div>
          <div className="ga-bar-track">
            <div className="ga-bar-fill" style={{ width: `${Math.round(row.share * 100)}%` }} />
          </div>
          <span className="ga-bar-count mono">{formatCount(row.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Petunjuk pemasangan, dilipat.
 *
 * Tag yang sudah terpasang membuat GA4 di situs Google terlihat "sudah
 * tersambung", dan panel lebar berisi langkah-langkah terasa seperti galat.
 * Jadi ia diringkas jadi satu baris; langkahnya baru terbuka kalau diklik.
 */
function SetupNotice({ measurementId }: { measurementId: string | null }) {
  return (
    <details className="ga-notice ga-notice-fold">
      <summary className="ga-notice-summary mono">
        <IconAlert size={14} />
        <span>
          {measurementId
            ? `Tag ${measurementId} aktif · angka di halaman ini butuh kredensial Data API`
            : 'Tag GA4 & kredensial Data API belum diisi'}
        </span>
        <span className="ga-notice-more">cara menghubungkan</span>
      </summary>
      <div>
        <p className="ga-notice-body">
          {measurementId
            ? `Tag ${measurementId} sudah mengirim kunjungan ke Google, jadi dasbor GA4 di situs Google sudah terisi. Halaman ini membaca angka yang sama lewat Data API, dan untuk itu perlu service account terpisah.`
            : 'Belum ada tag maupun kredensial. Keduanya diisi lewat variabel lingkungan berikut.'}
        </p>

        <ol className="ga-setup-steps">
          <li>
            Di Google Cloud, buat service account, aktifkan{' '}
            <span className="mono">Google Analytics Data API</span>, lalu unduh kuncinya sebagai
            JSON.
          </li>
          <li>
            Di GA4 &rarr; Admin &rarr; Property access management, tambahkan{' '}
            <span className="mono">client_email</span> service account itu dengan peran{' '}
            <span className="mono">Viewer</span>.
          </li>
          <li>
            Isi empat variabel ini di <span className="mono">.env</span>, lalu nyalakan ulang
            peladennya:
          </li>
        </ol>

        <pre className="ga-setup-env mono">
{`NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"
GA4_PROPERTY_ID="123456789"
GOOGLE_SERVICE_ACCOUNT_EMAIL="...@....iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"`}
        </pre>

        <p className="ga-notice-body">
          <span className="mono">GA4_PROPERTY_ID</span> adalah nomor properti (GA4 &rarr; Admin
          &rarr; Property details), bukan id pengukuran yang diawali &ldquo;G-&rdquo;.
        </p>

        <a
          href="https://developers.google.com/analytics/devguides/reporting/data/v1"
          target="_blank"
          rel="noreferrer"
          className="btn btn-quiet mono"
          style={{ marginTop: '12px', borderColor: 'var(--line)' }}
        >
          <IconExternalLink size={13} />
          <span>Dokumentasi GA4 Data API</span>
        </a>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Pembantu tampilan
// ---------------------------------------------------------------------------

function deviceIcon(label: string): React.ReactNode {
  const key = label.toLowerCase()
  if (key.includes('mobile')) return <IconDeviceMobile size={12} />
  if (key.includes('tablet')) return <IconDeviceTablet size={12} />
  return <IconDeviceDesktop size={12} />
}

/** Perubahan relatif. Basis nol tidak menghasilkan angka, karena tidak ada. */
function delta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return (current - previous) / previous
}

function formatCount(n: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(n))
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** Detik jadi "4m 12s"; di bawah satu menit cukup detiknya saja. */
function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`
}
