/**
 * Laporan trafik dari pencatat milik aplikasi sendiri.
 *
 * Tidak bergantung pada GA4 sama sekali: sumbernya `visit_log` dan
 * `click_log`, dibaca di Server Component. Tidak ada rute API yang
 * mengembalikan angka-angka ini, jadi datanya hanya bisa dilihat dari halaman
 * admin yang sudah terkunci.
 *
 * Grafiknya SVG biasa yang digambar di server — tidak ada pustaka grafik yang
 * ikut ke peramban. Keterangan saat kursor diarahkan memakai <title> bawaan.
 */

import Link from 'next/link'
import {
  IconActivity,
  IconClock,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEye,
  IconGlobe,
  IconLayers,
  IconRadar,
  IconTrendDown,
  IconTrendUp,
  IconUser,
} from '@/components/icons'
import type { CountRow, VisitAnalytics } from '@/lib/db/visit-queries'

const TZ = 'Asia/Jakarta'
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export function TrafficReport({ data, range }: { data: VisitAnalytics; range: string }) {
  const { totals, previous } = data
  const pagesPerSession = totals.sessions > 0 ? totals.views / totals.sessions : 0
  const bounce = totals.sessions > 0 ? totals.bounceSessions / totals.sessions : 0
  const returningShare = totals.visitors > 0 ? totals.returning / totals.visitors : 0

  return (
    <div className="tr">
      {/* --- Sekarang ------------------------------------------------------ */}
      <section className="tr-live" aria-label="Pengunjung aktif">
        <div className="tr-live-main">
          <span className="tr-live-dot" aria-hidden="true" />
          <div>
            <p className="tr-live-number mono">{fmt(data.live.last5)}</p>
            <p className="tr-live-label mono">aktif 5 menit terakhir</p>
          </div>
          <div className="tr-live-sep" />
          <div>
            <p className="tr-live-number small mono">{fmt(data.live.last30)}</p>
            <p className="tr-live-label mono">dalam 30 menit</p>
          </div>
        </div>
        <div className="tr-live-pages">
          {data.live.pagesNow.length === 0 ? (
            <span className="tr-muted mono">tidak ada yang membuka situs saat ini</span>
          ) : (
            data.live.pagesNow.map((p) => (
              <span key={p.label} className="tr-chip mono" title={`${p.visitors} pengunjung`}>
                {p.label}
                <b>{p.views}</b>
              </span>
            ))
          )}
        </div>
      </section>

      {/* --- Angka utama --------------------------------------------------- */}
      <div className="tr-kpis">
        <Kpi
          icon={<IconEye size={15} />}
          label="Tayangan halaman"
          value={fmt(totals.views)}
          delta={change(totals.views, previous.views)}
          foot={`${fmt(previous.views)} periode sebelumnya`}
          hero
        />
        <Kpi
          icon={<IconUser size={15} />}
          label="Pengunjung unik"
          value={fmt(totals.visitors)}
          delta={change(totals.visitors, previous.visitors)}
          foot={`${fmt(totals.returning)} pernah datang sebelumnya`}
          hero
        />
        <Kpi
          icon={<IconLayers size={15} />}
          label="Sesi"
          value={fmt(totals.sessions)}
          foot={`${pagesPerSession.toFixed(1).replace('.', ',')} halaman per sesi`}
        />
        <Kpi
          icon={<IconTrendDown size={15} />}
          label="Langsung pergi"
          value={pct(bounce)}
          foot="sesi yang hanya membuka 1 halaman"
        />
        <Kpi
          icon={<IconActivity size={15} />}
          label="Pengunjung kembali"
          value={pct(returningShare)}
          foot="dari seluruh pengunjung unik"
        />
        <Kpi
          icon={<IconRadar size={15} />}
          label="Klik tercatat"
          value={fmt(totals.clicks)}
          foot={totals.views > 0 ? `${(totals.clicks / totals.views).toFixed(1).replace('.', ',')} klik per tayangan` : '—'}
        />
      </div>

      {/* --- Tren ------------------------------------------------------------ */}
      <Section title={data.trend.unit === 'hour' ? 'TREN PER JAM (WIB)' : 'TREN PER HARI'} />
      <div className="tr-card">
        <TrendChart points={data.trend.points} unit={data.trend.unit} />
      </div>

      {/* --- Halaman --------------------------------------------------------- */}
      <Section title="HALAMAN YANG DIKUNJUNGI" />
      <div className="tr-card tr-flush">
        <PagesTable pages={data.pages} />
      </div>

      {/* --- Perangkat, peramban, sumber ------------------------------------- */}
      <Section title="PERANGKAT, PERAMBAN & SUMBER" />
      <DeviceSplit rows={data.devices} />
      <div className="tr-grid">
        <RankList title="Peramban" icon={<IconGlobe size={14} />} rows={data.browsers} />
        <RankList title="Sistem operasi" icon={<IconLayers size={14} />} rows={data.os} />
        <RankList title="Sumber kunjungan" icon={<IconRadar size={14} />} rows={data.referrers} />
        <RankList title="Halaman pertama dibuka" icon={<IconEye size={14} />} rows={data.entryPages} mono />
      </div>

      {/* --- Jam ramai ------------------------------------------------------- */}
      <Section title="JAM RAMAI (HARI × JAM, WIB)" />
      <div className="tr-card">
        <Heatmap cells={data.heatmap} />
      </div>

      {/* --- Klik ------------------------------------------------------------ */}
      <Section title="YANG PALING BANYAK DIKLIK" />
      <ClickSection data={data} range={range} />

      {/* --- Pengunjung ------------------------------------------------------ */}
      <Section title="PENGUNJUNG TERAKHIR" />
      <div className="tr-card tr-flush">
        <VisitorsTable data={data} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Section({ title }: { title: string }) {
  return (
    <div className="admin-section-header mono">
      <span className="admin-section-title">{title}</span>
      <span className="admin-section-line" />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  foot,
  delta,
  hero,
}: {
  icon: React.ReactNode
  label: string
  value: string
  foot: string
  delta?: number | null
  hero?: boolean
}) {
  return (
    <div className={`tr-kpi${hero ? ' is-hero' : ''}`}>
      <div className="tr-kpi-head mono">
        <span>{label}</span>
        {icon}
      </div>
      <div className="tr-kpi-value mono">{value}</div>
      <div className="tr-kpi-foot mono">
        {delta !== undefined && delta !== null && (
          <span className={`tr-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {delta >= 0 ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
            {delta >= 0 ? '+' : ''}
            {(delta * 100).toFixed(0)}%
          </span>
        )}
        <span>{foot}</span>
      </div>
    </div>
  )
}

/**
 * Tayangan (area) dan pengunjung unik (garis) di satu sumbu — keduanya
 * hitungan orang/halaman, jadi skalanya memang sama dan tidak butuh sumbu kedua.
 */
function TrendChart({ points, unit }: { points: VisitAnalytics['trend']['points']; unit: 'hour' | 'day' }) {
  if (points.length === 0) return <p className="tr-muted mono">belum ada data</p>

  const W = 1000
  const H = 240
  const PAD = { l: 36, r: 12, t: 14, b: 26 }
  const max = Math.max(1, ...points.map((p) => p.views))
  const niceMax = niceCeil(max)
  const step = (W - PAD.l - PAD.r) / Math.max(1, points.length - 1)
  const x = (i: number) => PAD.l + i * step
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / niceMax)

  const line = (key: 'views' | 'visitors') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const area = `${line('views')} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`

  const ticks = [0, 0.5, 1].map((f) => Math.round(niceMax * f))
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))
  const peak = points.reduce((best, p, i) => (p.views > points[best].views ? i : best), 0)

  return (
    <>
      <div className="tr-legend mono">
        <span><i className="tr-key area" /> Tayangan</span>
        <span><i className="tr-key line" /> Pengunjung unik</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-trend" role="img" aria-label="Tren tayangan dan pengunjung">
        <defs>
          <linearGradient id="tr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="tr-grid-line" />
            <text x={PAD.l - 8} y={y(t) + 3} className="tr-axis" textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#tr-area)" />
        <path d={line('views')} className="tr-line-views" />
        <path d={line('visitors')} className="tr-line-visitors" />

        {points[peak].views > 0 && (
          <g>
            <circle cx={x(peak)} cy={y(points[peak].views)} r="4.5" className="tr-peak" />
            <text x={x(peak)} y={y(points[peak].views) - 10} className="tr-peak-label" textAnchor="middle">
              puncak {points[peak].views}
            </text>
          </g>
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.at} x={x(i)} y={H - 6} className="tr-axis" textAnchor="middle">
              {bucketLabel(p.at, unit)}
            </text>
          ) : null,
        )}

        {/* Sasaran kursor selebar satu ember — lebih mudah dikenai daripada garisnya. */}
        {points.map((p, i) => (
          <rect key={`hit-${p.at}`} x={x(i) - step / 2} y={PAD.t} width={step} height={H - PAD.t - PAD.b} className="tr-hit">
            <title>{`${bucketLabel(p.at, unit, true)} — ${p.views} tayangan, ${p.visitors} pengunjung`}</title>
          </rect>
        ))}
      </svg>
    </>
  )
}

function PagesTable({ pages }: { pages: VisitAnalytics['pages'] }) {
  if (pages.length === 0) return <p className="tr-empty mono">belum ada kunjungan pada rentang ini</p>
  const max = Math.max(...pages.map((p) => p.views))
  const total = pages.reduce((s, p) => s + p.views, 0)

  return (
    <div className="admin-table-container">
      <table className="admin-table tr-table">
        <thead>
          <tr>
            <th style={{ width: '4%' }}>#</th>
            <th style={{ width: '52%' }}>Halaman</th>
            <th style={{ textAlign: 'right' }}>Tayangan</th>
            <th style={{ textAlign: 'right' }}>Pengunjung</th>
            <th style={{ textAlign: 'right' }}>Bagian</th>
            <th style={{ textAlign: 'right' }}>Terakhir</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page, i) => (
            <tr key={page.path}>
              <td className="mono tr-rank">{i + 1}</td>
              <td>
                <div className="tr-page">
                  <span className="tr-page-name">{pageName(page.path)}</span>
                  <span className="tr-page-path mono">{page.path}</span>
                  <span className="tr-bar"><span style={{ width: `${(page.views / max) * 100}%` }} /></span>
                </div>
              </td>
              <td className="mono ga-num">{fmt(page.views)}</td>
              <td className="mono ga-num quiet">{fmt(page.visitors)}</td>
              <td className="mono ga-num quiet">{total > 0 ? pct(page.views / total) : '—'}</td>
              <td className="mono ga-num quiet">{ago(page.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DeviceSplit({ rows }: { rows: CountRow[] }) {
  const total = rows.reduce((s, r) => s + r.views, 0)
  if (total === 0) return null
  return (
    <div className="tr-devices">
      {rows.map((r) => (
        <div key={r.label} className="tr-device">
          <span className="tr-device-icon">{deviceIcon(r.label)}</span>
          <div className="tr-device-body">
            <div className="tr-device-top">
              <span className="tr-device-name">{deviceName(r.label)}</span>
              <span className="tr-device-share mono">{pct(r.views / total)}</span>
            </div>
            <span className="tr-bar thick"><span style={{ width: `${(r.views / total) * 100}%` }} /></span>
            <span className="tr-device-foot mono">
              {fmt(r.views)} tayangan · {fmt(r.visitors)} pengunjung
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RankList({
  title,
  icon,
  rows,
  mono,
}: {
  title: string
  icon: React.ReactNode
  rows: CountRow[]
  mono?: boolean
}) {
  const total = rows.reduce((s, r) => s + r.views, 0)
  return (
    <div className="tr-card tr-rank-card">
      <div className="tr-card-head mono">
        {icon}
        <span>{title}</span>
      </div>
      {rows.length === 0 && <p className="tr-muted mono">belum ada data</p>}
      {rows.map((r) => (
        <div key={r.label} className="tr-rank-row" title={`${r.views} tayangan · ${r.visitors} pengunjung`}>
          <div className="tr-rank-top">
            <span className={`tr-rank-name${mono ? ' mono' : ''}`}>{r.label}</span>
            <span className="tr-rank-value mono">{fmt(r.views)}</span>
          </div>
          <span className="tr-bar"><span style={{ width: `${total > 0 ? (r.views / total) * 100 : 0}%` }} /></span>
        </div>
      ))}
    </div>
  )
}

/** Satu warna, terang ke gelap. Sel kosong tetap terlihat sebagai kotak redup. */
function Heatmap({ cells }: { cells: number[][] }) {
  const max = Math.max(1, ...cells.flat())
  const busiest = cells
    .flatMap((row, d) => row.map((v, h) => ({ v, d, h })))
    .sort((a, b) => b.v - a.v)[0]

  return (
    <div className="tr-heat">
      <div className="tr-heat-grid" role="img" aria-label="Tayangan per hari dan jam">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={`h${h}`} className="tr-heat-hour mono">
            {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
          </span>
        ))}
        {cells.map((row, d) => (
          <Row key={d} day={d} row={row} max={max} />
        ))}
      </div>
      <div className="tr-heat-foot mono">
        <span>sepi</span>
        <span className="tr-heat-scale" />
        <span>ramai</span>
        {busiest && busiest.v > 0 && (
          <span className="tr-heat-note">
            paling ramai: {DAYS[busiest.d]} pukul {String(busiest.h).padStart(2, '0')}.00 ({busiest.v} tayangan)
          </span>
        )}
      </div>
    </div>
  )
}

function Row({ day, row, max }: { day: number; row: number[]; max: number }) {
  return (
    <>
      <span className="tr-heat-day mono">{DAYS[day]}</span>
      {row.map((v, h) => (
        <span
          key={h}
          className="tr-heat-cell"
          style={{ ['--a' as string]: v === 0 ? 0 : 0.15 + 0.85 * (v / max) }}
          title={`${DAYS[day]} ${String(h).padStart(2, '0')}.00 — ${v} tayangan`}
        />
      ))}
    </>
  )
}

function ClickSection({ data, range }: { data: VisitAnalytics; range: string }) {
  if (data.totals.clicks === 0) {
    return (
      <div className="tr-card">
        <p className="tr-empty mono">
          Belum ada klik tercatat. Pencatat klik baru aktif sejak pembaruan ini — begitu pengunjung
          mulai mengklik tombol dan tautan, tabel dan peta panasnya terisi sendiri.
        </p>
      </div>
    )
  }

  const maxClicks = Math.max(...data.clickTargets.map((c) => c.clicks), 1)
  const maxWeight = Math.max(...data.clickDots.map((d) => d.weight), 1)

  return (
    <div className="tr-clicks">
      <div className="tr-card tr-flush">
        <div className="admin-table-container">
          <table className="admin-table tr-table">
            <thead>
              <tr>
                <th style={{ width: '48%' }}>Elemen</th>
                <th>Halaman</th>
                <th style={{ textAlign: 'right' }}>Klik</th>
                <th style={{ textAlign: 'right' }}>Orang</th>
              </tr>
            </thead>
            <tbody>
              {data.clickTargets.map((c) => (
                <tr key={`${c.path}-${c.label}`}>
                  <td>
                    <div className="tr-page">
                      <span className="tr-page-name">{c.label}</span>
                      {c.href && <span className="tr-page-path mono">→ {c.href}</span>}
                      <span className="tr-bar"><span style={{ width: `${(c.clicks / maxClicks) * 100}%` }} /></span>
                    </div>
                  </td>
                  <td className="mono quiet">{c.path}</td>
                  <td className="mono ga-num">{fmt(c.clicks)}</td>
                  <td className="mono ga-num quiet">{fmt(c.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tr-card">
        <div className="tr-card-head mono">
          <IconRadar size={14} />
          <span>Peta panas klik</span>
        </div>
        <nav className="tr-heat-pages" aria-label="Pilih halaman">
          {data.clickPages.map((p) => (
            <Link
              key={p.label}
              href={`/admin/analytics?range=${range}&heat=${encodeURIComponent(p.label)}`}
              className={`tr-chip mono${p.label === data.heatPath ? ' active' : ''}`}
              scroll={false}
            >
              {p.label}
              <b>{p.views}</b>
            </Link>
          ))}
        </nav>
        <div className="tr-page-frame" role="img" aria-label={`Sebaran klik di ${data.heatPath}`}>
          <div className="tr-page-frame-bar"><i /><i /><i /><span className="mono">{data.heatPath}</span></div>
          <div className="tr-page-canvas">
            {data.clickDots.map((d, i) => (
              <span
                key={i}
                className="tr-click-dot"
                style={{
                  left: `${d.x * 100}%`,
                  top: `${d.y * 100}%`,
                  ['--s' as string]: `${18 + 42 * Math.sqrt(d.weight / maxWeight)}px`,
                  ['--a' as string]: 0.25 + 0.75 * (d.weight / maxWeight),
                }}
                title={`${d.weight} klik`}
              />
            ))}
          </div>
        </div>
        <p className="tr-muted mono">
          Posisi relatif terhadap panjang halaman; atas bingkai = atas halaman. Klik ponsel dan
          desktop ditumpuk bersama.
        </p>
      </div>
    </div>
  )
}

function VisitorsTable({ data }: { data: VisitAnalytics }) {
  if (data.visitors.length === 0) return <p className="tr-empty mono">belum ada pengunjung</p>
  return (
    <div className="admin-table-container">
      <table className="admin-table tr-table">
        <thead>
          <tr>
            <th>Pengunjung</th>
            <th>Lokasi</th>
            <th>Perangkat</th>
            <th style={{ textAlign: 'right' }}>Tayangan</th>
            <th style={{ textAlign: 'right' }}>Sesi</th>
            <th>Terakhir membuka</th>
            <th style={{ textAlign: 'right' }}>Aktif</th>
          </tr>
        </thead>
        <tbody>
          {data.visitors.map((v) => (
            <tr key={v.id}>
              <td>
                <span className="tr-visitor mono">
                  <span className="tr-avatar" style={{ ['--h' as string]: hue(v.id) }}>{v.id.slice(0, 2)}</span>
                  {v.id}
                  <span className={`tr-badge ${v.returning ? 'back' : 'new'}`}>{v.returning ? 'kembali' : 'baru'}</span>
                </span>
              </td>
              <td className="quiet">{[v.city, v.country].filter(Boolean).join(', ') || '—'}</td>
              <td>
                <span className="tr-device-cell">
                  {deviceIcon(v.device)}
                  <span className="mono">{[v.browser, v.os].filter(Boolean).join(' · ') || deviceName(v.device)}</span>
                </span>
              </td>
              <td className="mono ga-num">{fmt(v.views)}</td>
              <td className="mono ga-num quiet">{fmt(v.sessions)}</td>
              <td className="mono quiet tr-last-path">{v.lastPath}</td>
              <td className="mono ga-num quiet" title={new Date(v.lastSeen).toLocaleString('id-ID', { timeZone: TZ })}>
                {ago(v.lastSeen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tr-muted mono tr-table-note">
        Id pengunjung adalah potongan sidik ber-garam (IP + peramban), bukan alamat IP. Satu orang
        yang ganti jaringan bisa tercatat sebagai pengunjung baru.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pembantu
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(n))
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace('.', ',')}%`
}

function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}

function niceCeil(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v) return m * mag
  return 10 * mag
}

/** Ember waktu dari kueri sudah berupa jam WIB tanpa zona. */
function bucketLabel(at: string, unit: 'hour' | 'day', long = false): string {
  const [date, time] = at.split('T')
  const [, m, d] = date.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  if (unit === 'hour') return long ? `${d} ${months[m - 1]} ${time.slice(0, 5)}` : time.slice(0, 5)
  return `${d} ${months[m - 1]}`
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  return `${Math.floor(s / 86400)} hari lalu`
}

function deviceName(label: string): string {
  if (label === 'mobile') return 'Ponsel'
  if (label === 'tablet') return 'Tablet'
  if (label === 'desktop') return 'Desktop'
  return 'Tidak diketahui'
}

function deviceIcon(label: string): React.ReactNode {
  if (label === 'mobile') return <IconDeviceMobile size={14} />
  if (label === 'tablet') return <IconDeviceTablet size={14} />
  if (label === 'desktop') return <IconDeviceDesktop size={14} />
  return <IconClock size={14} />
}

/** Nama halaman yang terbaca manusia dari jalurnya. */
function pageName(path: string): string {
  if (path === '/') return 'Beranda'
  const [first, ...rest] = path.split('/').filter(Boolean)
  const names: Record<string, string> = {
    ringkasan: 'Ringkasan pasar',
    berita: 'Berita',
    warta: 'Warta',
    screener: 'Screener',
    instruments: 'Instrumen',
    watchlist: 'Watchlist',
    portofolio: 'Portofolio',
    kalkulator: 'Kalkulator',
    'tanya-komite': 'Tanya Komite',
    bandingkan: 'Bandingkan',
    kepemilikan: 'Kepemilikan KSEI',
    makro: 'Makro',
    panduan: 'Panduan',
    metodologi: 'Metodologi',
    premium: 'Premium',
    donasi: 'Donasi',
    login: 'Masuk',
    daftar: 'Daftar',
  }
  const base = names[first] ?? first.replace(/-/g, ' ')
  if (rest.length === 0) return base
  return `${base} · ${rest.join('/').replace(/-/g, ' ').slice(0, 60)}`
}

/** Warna avatar tetap per pengunjung, diturunkan dari id-nya. */
function hue(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
