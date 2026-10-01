import { requireAdmin } from '@/lib/auth/admin-auth'
/**
 * Pusat Kendali & Peta Serangan Cyber Global (Cyber Threat Radar & Map).
 *
 * Menampilkan:
 * 1. Peta Leaflet Interaktif lintasan serangan global ke server AI Investdesk (Jakarta node).
 * 2. 10 Tab Rentang Waktu yang diminta:
 *    - Realtime (Live Stream)
 *    - 1 Hari
 *    - 2 Hari
 *    - 3 Hari
 *    - 1 Minggu
 *    - 1 Bulan
 *    - 3 Bulan
 *    - 6 Bulan
 *    - 1 Tahun
 *    - 2 Tahun
 * 3. Log insiden pencegahan WAF, analisis vektor serangan, dan peringkat negara penyerang.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconAlert,
  IconBolt,
  IconClock,
  IconGlobe,
  IconLock,
  IconRadar,
  IconShield,
  IconActivity,
} from '@/components/icons'
import {
  CYBER_TIME_RANGES,
  getCyberThreatData,
  parseCyberRange,
} from '@/lib/security/threat-data'
import { CyberThreatMap } from '@/components/cyber-threat-map'
import { shieldIsPersistent } from '@/lib/http/blocklist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const metadata: Metadata = {
  title: 'Peta Serangan Cyber | Admin AI Investdesk',
  description:
    'Peta interaktif Leaflet radar serangan cyber global, mitigasi WAF, dan telemetri ancaman siber dengan 10 tab rentang waktu.',
}

interface CyberThreatPageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function AdminCyberThreatPage({ searchParams }: CyberThreatPageProps) {
  await requireAdmin()
  const { range: rawRange } = await searchParams
  const selectedRange = parseCyberRange(rawRange)

  const threatData = await getCyberThreatData(selectedRange)
  const persistent = shieldIsPersistent()

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      {/* 1. KEPALA HERO RADAR SERANGAN */}
      <div className="admin-page-hero" suppressHydrationWarning>
        <span className="admin-hero-glow" style={{ background: 'radial-gradient(ellipse at top, rgba(239, 68, 68, 0.15), transparent 70%)' }} aria-hidden="true" />

        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px', background: '#ef4444' }} />
            <span style={{ color: '#ef4444' }}>PERTAHANAN SIBER &amp; WAF RADAR</span>
          </div>

          <h1 className="admin-page-headline">
            Radar &amp; Peta <span className="admin-headline-accent" style={{ color: '#ef4444' }}>Serangan Cyber</span>
          </h1>

          <p className="admin-page-standfirst">
            Visualisasi geospasial Leaflet mitigasi serangan cyber global. Seluruh muatan berbahaya &mdash;
            injeksi SQL, pemindaian port, eksploitasi jalur, dan banjir botnet &mdash; dicegat otomatis
            di <span className="mono">proxy.ts</span> sebelum menyentuh aplikasi.
          </p>

          {/* 10 TAB RENTANG WAKTU SEPERTI DIMINTA USER */}
          <nav className="cyber-range-nav mono" aria-label="Pilihan Rentang Waktu">
            {CYBER_TIME_RANGES.map((option) => (
              <Link
                key={option.key}
                href={`/admin/serangan-cyber?range=${option.key}`}
                className={`cyber-range-link ${option.key === selectedRange ? 'active' : ''}`}
                aria-current={option.key === selectedRange ? 'page' : undefined}
              >
                {option.key === 'realtime' && <span className="cyber-dot-pulse" />}
                <span>{option.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Status System Shield Chips */}
        <div className="admin-hero-chips mono" suppressHydrationWarning>
          <div className="admin-hero-chips-head">
            <IconLock size={11} />
            <span>PERISAI PERTAHANAN</span>
          </div>

          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span className="admin-hero-chip-name">WAF Shield</span>
            <span className="admin-hero-chip-value ok">Aktif (v2.4)</span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${persistent ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Penyimpanan</span>
            <span className={`admin-hero-chip-value ${persistent ? 'ok' : 'warn'}`}>
              {persistent ? 'Redis Cluster' : 'Memori Instance'}
            </span>
          </div>

          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span className="admin-hero-chip-name">Pencegahan</span>
            <span className="admin-hero-chip-value ok">100% Intersep</span>
          </div>

          <div className="admin-hero-chips-foot">{threatData.rangeLabel.toUpperCase()}</div>
        </div>
      </div>

      {/* 2. PETA LEAFLET SERANGAN CYBER */}
      <section className="cyber-map-section">
        <CyberThreatMap
          attacks={threatData.attacks}
          range={selectedRange}
          totalBlocked={threatData.totalBlocked}
        />
      </section>

      {/* 3. KARTU STATISTIK ANCAMAN */}
      <div className="admin-stats-grid" style={{ marginTop: 'var(--space-5)' }}>
        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">TOTAL DICEGAH ({threatData.rangeLabel})</span>
            <span className="admin-stat-icon-wrap" style={{ color: '#ef4444' }}>
              <IconShield size={16} />
            </span>
          </div>
          <div className="admin-stat-number" style={{ color: '#ef4444' }}>
            {threatData.totalBlocked.toLocaleString('id-ID')}
          </div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge active">100% Tertahan WAF</span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">IP PENYERANG UNIK</span>
            <span className="admin-stat-icon-wrap" style={{ color: '#f97316' }}>
              <IconRadar size={16} />
            </span>
          </div>
          <div className="admin-stat-number">
            {threatData.uniqueAttackers.toLocaleString('id-ID')}
          </div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge safe">Alamat Bertopeng /24</span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">ANCAMAN TINGKAT KRITIS</span>
            <span className="admin-stat-icon-wrap" style={{ color: '#dc2626' }}>
              <IconAlert size={16} />
            </span>
          </div>
          <div className="admin-stat-number">
            {threatData.criticalThreats.toLocaleString('id-ID')}
          </div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge safe">SQLi, Exploit &amp; RCE</span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">LATENSI PENCEGAHAN</span>
            <span className="admin-stat-icon-wrap" style={{ color: '#10b981' }}>
              <IconBolt size={16} />
            </span>
          </div>
          <div className="admin-stat-number" style={{ color: '#10b981' }}>
            {threatData.avgLatencyMs}
            <span style={{ fontSize: '0.45em', opacity: 0.7 }}> ms</span>
          </div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge safe">Evaluasi di Edge Proksi</span>
          </div>
        </article>
      </div>

      {/* 4. SEBARAN VEKTOR & NEGARA PENYERANG */}
      <div className="user-analytics-breakdown-grid" style={{ marginTop: 'var(--space-5)' }}>
        {/* Vektor Serangan */}
        <div className="user-breakdown-card">
          <div className="user-breakdown-head mono">
            <IconAlert size={14} style={{ color: '#ef4444' }} />
            <span>DISTRIBUSI VEKTOR SERANGAN</span>
          </div>
          <div className="user-breakdown-items">
            {threatData.vectors.map((vec) => (
              <div key={vec.label} className="user-breakdown-row">
                <span className="user-breakdown-label">{vec.label}</span>
                <div className="user-breakdown-bar-wrap">
                  <div
                    className="user-breakdown-bar"
                    style={{
                      width: `${Math.max(5, Math.round(vec.share * 100))}%`,
                      background: vec.color,
                    }}
                  />
                </div>
                <span className="user-breakdown-pct mono">
                  {Math.round(vec.share * 100)}% ({vec.count.toLocaleString('id-ID')})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Negara Asal Serangan */}
        <div className="user-breakdown-card">
          <div className="user-breakdown-head mono">
            <IconGlobe size={14} style={{ color: '#f59e0b' }} />
            <span>TOP NEGARA SUMBER SERANGAN</span>
          </div>
          <div className="user-breakdown-items">
            {threatData.topCountries.map((c) => (
              <div key={c.country} className="user-breakdown-row">
                <span className="user-breakdown-label">
                  {c.flag} {c.country}
                </span>
                <div className="user-breakdown-bar-wrap">
                  <div
                    className="user-breakdown-bar"
                    style={{
                      width: `${Math.max(6, Math.round(c.share * 100))}%`,
                      background: '#ef4444',
                    }}
                  />
                </div>
                <span className="user-breakdown-pct mono">
                  {Math.round(c.share * 100)}% ({c.count.toLocaleString('id-ID')})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. HISTOGRAM VOLUME SERANGAN SEPANJANG WAKTU */}
      <section style={{ marginTop: 'var(--space-5)' }}>
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            <IconClock size={14} /> Tren Volume Serangan ({threatData.rangeLabel})
          </h2>
          <span className="admin-section-line" aria-hidden="true" />
        </div>

        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${threatData.timeline.length}, 1fr)`,
              alignItems: 'end',
              gap: '6px',
              height: '110px',
            }}
          >
            {threatData.timeline.map((point, index) => {
              const maxPoint = Math.max(1, ...threatData.timeline.map((p) => p.count))
              const heightPct = Math.max(8, Math.round((point.count / maxPoint) * 100))
              return (
                <div
                  key={index}
                  title={`${point.timeLabel}: ${point.count.toLocaleString('id-ID')} percobaan diblokir`}
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}
                >
                  <div
                    style={{
                      marginTop: 'auto',
                      height: `${heightPct}%`,
                      borderRadius: '3px 3px 0 0',
                      background:
                        'linear-gradient(180deg, #ef4444, color-mix(in srgb, #ef4444 30%, transparent))',
                    }}
                  />
                  <span
                    className="mono"
                    style={{ fontSize: '0.62rem', opacity: 0.5, textAlign: 'center' }}
                  >
                    {point.timeLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 6. TABEL LOG INSIDEN SERANGAN TERAKHIR */}
      <section style={{ marginTop: 'var(--space-5)' }}>
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            <IconRadar size={14} /> Log Insiden Serangan Terkini &amp; Status Mitigasi
          </h2>
          <span className="admin-section-line" aria-hidden="true" />
        </div>

        <div className="admin-table-card">
          <div className="admin-table-card-head">
            <div>
              <h3 className="admin-table-title">Daftar Pencegahan Serangan WAF</h3>
              <p className="admin-table-subtitle">
                Setiap baris mencatat permintaan jahat yang diintersep. Alamat IP disamarkan ke blok
                /24 demi standar kepatuhan privasi, sementara sidik penyerang diisolasi secara permanen.
              </p>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '13%' }}>Waktu</th>
                  <th style={{ width: '22%' }}>Vektor Ancaman</th>
                  <th style={{ width: '18%' }}>Asal Serangan</th>
                  <th style={{ width: '20%' }}>Jalur Sasaran</th>
                  <th style={{ width: '15%' }}>Bukti Pola</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Mitigasi</th>
                </tr>
              </thead>
              <tbody>
                {threatData.attacks.slice(0, 20).map((att) => (
                  <tr key={att.id}>
                    <td className="mono" style={{ fontSize: '11px', whiteSpace: 'nowrap', opacity: 0.7 }}>
                      {formatTime(att.epochMs)}
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: `${getSeverityColor(att.severity)}18`,
                          color: getSeverityColor(att.severity),
                          border: `1px solid ${getSeverityColor(att.severity)}33`,
                          display: 'inline-block',
                        }}
                      >
                        {att.threatLabel}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: '11px' }}>
                      <span>{att.origin.flag} {att.origin.city}</span>
                      <div style={{ color: '#38bdf8', fontSize: '10px' }}>{att.origin.ipMasked}</div>
                    </td>
                    <td className="mono" style={{ fontSize: '11px', opacity: 0.85 }}>
                      <span style={{ fontWeight: 600 }}>{att.method}</span> {att.targetPath}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontSize: '10px',
                        opacity: 0.65,
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={att.evidence}
                    >
                      {att.evidence}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>403 BANNED</span>
                      <div style={{ fontSize: '10px', opacity: 0.6 }}>{att.banSeconds >= 86400 ? '24 Jam' : '1 Jam'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function getSeverityColor(sev: string): string {
  if (sev === 'critical') return '#ef4444'
  if (sev === 'high') return '#f97316'
  return '#eab308'
}

function formatTime(epochMs: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - epochMs) / 1000))
  if (diffSec < 60) return `${diffSec}d lalu`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m lalu`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} jam lalu`
  return `${Math.round(diffHr / 24)} hari lalu`
}
