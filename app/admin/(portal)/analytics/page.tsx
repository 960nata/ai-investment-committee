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
  IconLock,
  IconRadar,
  IconTrendDown,
  IconTrendUp,
  IconUser,
} from '@/components/icons'
import {
  getGa4Overview,
  getMeasurementId,
  isGa4Configured,
  parseRange,
  RANGE_LABELS,
  type Ga4Overview,
  type Ga4Range,
  type Ga4Slice,
} from '@/lib/analytics/ga4'
import {
  getVisitSummary,
  parseVisitWindow,
  type VisitSummary,
  type VisitWindow,
} from '@/lib/db/visit-queries'
import { VisitorMap } from '@/components/visitor-map'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Analitik Pengguna | Admin Komite',
  description:
    'Telemetri kunjungan dari Google Analytics 4: pengguna aktif, halaman teratas, perangkat, saluran akuisisi, dan sebaran kota.',
}

const RANGES: Ga4Range[] = ['24h', '7d', '30d']

interface AnalyticsPageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function AdminAnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { range: rawRange } = await searchParams
  const range = parseRange(rawRange)

  const measurementId = getMeasurementId()
  const configured = isGa4Configured()

  let data: Ga4Overview | null = null
  let error: string | null = null

  if (configured) {
    try {
      data = await getGa4Overview(range)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  // Sebaran pengunjung dibaca dari catatan kunjungan milik aplikasi sendiri,
  // bukan dari GA4. Sengaja terpisah: GA4 membuang alamat IP di sisi Google dan
  // tidak pernah mengembalikan koordinat, jadi peta tidak akan pernah bisa
  // diisi dari sana. Bagian ini tetap hidup walau GA4 belum dikonfigurasi.
  const visitWindow = toVisitWindow(range)
  let visits: VisitSummary | null = null
  let visitsError: string | null = null

  try {
    visits = await getVisitSummary(visitWindow)
  } catch (err) {
    visitsError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      {/* 1. KEPALA HALAMAN + PEMILIH RENTANG */}
      <div className="admin-page-hero" suppressHydrationWarning>
        <span className="admin-hero-glow" aria-hidden="true" />

        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span>TELEMETRI GOOGLE ANALYTICS 4</span>
          </div>

          <h1 className="admin-page-headline">
            Analitik <span className="admin-headline-accent">Pengguna</span>
          </h1>

          <p className="admin-page-standfirst">
            Dibaca langsung dari properti GA4 lewat Data API setiap halaman ini dimuat. Tidak ada
            angka contoh di sini &mdash; kalau satu bagian kosong, memang belum ada datanya.
          </p>

          <nav className="ga-range-nav mono" aria-label="Rentang waktu">
            {RANGES.map((option) => (
              <Link
                key={option}
                href={`/admin/analytics?range=${option}`}
                className={`ga-range-link${option === range ? ' active' : ''}`}
                aria-current={option === range ? 'page' : undefined}
              >
                {RANGE_LABELS[option]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="admin-hero-chips mono" suppressHydrationWarning>
          <div className="admin-hero-chips-head">
            <IconLock size={11} />
            <span>STATUS INTEGRASI</span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${measurementId ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Tag gtag.js</span>
            <span className={`admin-hero-chip-value ${measurementId ? 'ok' : 'warn'}`}>
              {measurementId ?? 'Belum dipasang'}
            </span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${configured ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Data API</span>
            <span className={`admin-hero-chip-value ${configured ? 'ok' : 'warn'}`}>
              {configured ? 'Terhubung' : 'Belum konfig'}
            </span>
          </div>

          <div className="admin-hero-chips-foot">{RANGE_LABELS[range]}</div>
        </div>
      </div>

      {!configured && <SetupNotice measurementId={measurementId} />}

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

      {data?.empty && (
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

      {/*
       * Peta sengaja berada di luar seluruh percabangan GA4 di atas. Sumbernya
       * catatan kunjungan milik aplikasi sendiri, jadi ia tetap punya isi pada
       * pemasangan yang belum menyentuh Google Analytics sama sekali.
       */}
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">PETA GEOLOKASI PENGUNJUNG</span>
        <span className="admin-section-line" />
      </div>

      <VisitorGeoSection summary={visits} error={visitsError} />
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
 * Rentang GA4 dipetakan ke rentang catatan kunjungan.
 *
 * Keduanya memakai nama yang sama untuk tiga pilihan pertama, jadi pemetaannya
 * sepele — tetapi ditulis terang-terangan supaya penambahan rentang di salah
 * satu sisi tidak diam-diam jatuh ke nilai bawaan di sisi yang lain.
 */
function toVisitWindow(range: Ga4Range): VisitWindow {
  return parseVisitWindow(range)
}

/**
 * Peta sebaran pengunjung berikut ringkasannya.
 *
 * Tiga keadaan, dan masing-masing mengatakan hal yang berbeda: kueri gagal,
 * belum ada kunjungan berkoordinat sama sekali, atau ada dan digambar. Ketiganya
 * sengaja dibedakan — "peta kosong" yang berarti "basis data mati" dan yang
 * berarti "memang belum ada pengunjung" menuntut tindakan yang tidak sama.
 */
function VisitorGeoSection({
  summary,
  error,
}: {
  summary: VisitSummary | null
  error: string | null
}) {
  if (error) {
    return (
      <div className="admin-table-card" suppressHydrationWarning>
        <div className="ga-empty">
          <IconAlert size={18} style={{ color: 'var(--halted)' }} />
          <p className="ga-empty-title">Catatan kunjungan tidak terbaca</p>
          <p className="ga-empty-text mono">{error}</p>
        </div>
      </div>
    )
  }

  const points = summary?.points ?? []
  const plotted = points.reduce((total, point) => total + point.visits, 0)

  return (
    <div className="admin-table-card" suppressHydrationWarning>
      <div className="admin-table-card-head">
        <div>
          <h2 className="admin-table-title">Dari mana pengunjung membuka Komite</h2>
          <p className="admin-table-subtitle mono">
            Dicatat sendiri oleh aplikasi, bukan dari GA4. Lokasi berasal dari geolokasi IP di tepi
            jaringan; alamat IP-nya sendiri tidak pernah disimpan &mdash; yang tersimpan hanya
            sidik ber-garam untuk membedakan pengunjung.
          </p>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="ga-empty">
          <IconGlobe size={18} />
          <p className="ga-empty-title">Belum ada kunjungan berkoordinat</p>
          <p className="ga-empty-text">
            {summary && summary.totalVisits > 0 ? (
              <>
                {formatCount(summary.totalVisits)} kunjungan tercatat pada rentang ini, tetapi belum
                satu pun membawa koordinat. Ini normal di pengembangan: koordinat datang dari header
                tepi jaringan Vercel, dan di localhost header itu tidak ada.
              </>
            ) : (
              <>
                Belum ada kunjungan tercatat pada rentang ini. Data mulai terkumpul sendiri begitu
                ada yang membuka situs.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <VisitorMap points={points} />

          <div className="visitor-map-stats mono" suppressHydrationWarning>
            <span>
              <strong>{formatCount(summary?.totalVisits ?? 0)}</strong> kunjungan
            </span>
            <span>
              <strong>{formatCount(summary?.totalVisitors ?? 0)}</strong> pengunjung berbeda
            </span>
            <span>
              <strong>{formatCount(points.length)}</strong> kota
            </span>
            {summary && summary.withoutLocation > 0 && (
              <span className="quiet">
                {formatCount(summary.withoutLocation)} kunjungan tanpa lokasi (tidak dipetakan)
              </span>
            )}
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Kota</th>
                  <th style={{ width: '18%' }}>Negara</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Kunjungan</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Pengunjung</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Bagian</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 12).map((point) => (
                  <tr key={`${point.city}-${point.latitude}-${point.longitude}`}>
                    <td>{point.city}</td>
                    <td className="mono quiet">{point.country ?? '—'}</td>
                    <td className="mono ga-num">{formatCount(point.visits)}</td>
                    <td className="mono ga-num quiet">{formatCount(point.visitors)}</td>
                    <td className="mono ga-num quiet">
                      {plotted > 0 ? `${((point.visits / plotted) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
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
}: {
  title: string
  icon: React.ReactNode
  rows: Ga4Slice[]
  renderIcon?: (label: string) => React.ReactNode
}) {
  return (
    <div className="ga-bar-panel">
      <div className="ga-bar-panel-head mono">
        {icon}
        <span>{title}</span>
      </div>

      {rows.length === 0 && <p className="ga-bar-empty mono">belum ada data</p>}

      {rows.map((row) => (
        <div key={row.label} className="ga-bar-row">
          <div className="ga-bar-label mono">
            {renderIcon?.(row.label)}
            <span className="ga-bar-name">{row.label}</span>
            <span className="ga-bar-value">{formatPercent(row.share)}</span>
          </div>
          <div className="ga-bar-track">
            <div className="ga-bar-fill" style={{ width: `${Math.round(row.share * 100)}%` }} />
          </div>
          <span className="ga-bar-count mono">{formatCount(row.value)} sesi</span>
        </div>
      ))}
    </div>
  )
}

function SetupNotice({ measurementId }: { measurementId: string | null }) {
  return (
    <div className="ga-notice">
      <IconAlert size={18} />
      <div>
        <h2 className="ga-notice-title">Data API GA4 belum dikonfigurasi</h2>
        <p className="ga-notice-body">
          {measurementId
            ? `Tag ${measurementId} sudah terpasang, jadi kunjungan sudah mengalir ke Google. Yang belum ada adalah kredensial untuk membacanya balik ke halaman ini.`
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
    </div>
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
