/**
 * Halaman Pipeline — kondisi mesin, bukan kondisi pasar.
 *
 * Empat hal yang ditampilkan: jadwal job, hasil batch terakhir, kesehatan tiap
 * sumber data, dan baris yang dikarantina. Tiga yang pertama menjawab "apakah
 * data masih masuk"; yang terakhir menjawab "apa yang ditolak dan kenapa".
 *
 * Baris karantina sengaja terlihat. Sebagian besar anomali harga ternyata aksi
 * korporasi yang belum terekam, bukan data rusak — kalau disembunyikan, yang
 * hilang justru petunjuknya.
 */

import {
  getFeatureCoverage,
  listAdapterHealth,
  listQuarantined,
  listRecentJobRuns,
  listSchedules,
} from '@/lib/db/queries'
import { FEATURE_SET_VERSION } from '@/lib/features/compute'
import { isDue, localSlot } from '@/lib/jobs/due'
import { isQStashConfigured } from '@/lib/queue/qstash'
import { cache } from '@/lib/cache/redis'
import { fromDbMarket } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Pipeline — Investasi',
}

export default async function PipelinePage() {
  const now = new Date()

  let data: {
    schedules: Awaited<ReturnType<typeof listSchedules>>
    runs: Awaited<ReturnType<typeof listRecentJobRuns>>
    health: Awaited<ReturnType<typeof listAdapterHealth>>
    quarantined: Awaited<ReturnType<typeof listQuarantined>>
    features: Awaited<ReturnType<typeof getFeatureCoverage>>
  } | null = null
  let error: string | null = null

  try {
    const [schedules, runs, health, quarantined, features] = await Promise.all([
      listSchedules(),
      listRecentJobRuns(15),
      listAdapterHealth(),
      listQuarantined(10),
      getFeatureCoverage(),
    ])
    data = { schedules, runs, health, quarantined, features }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pipeline</h1>
        <p className="page-subtitle">
          Penjadwalan, hasil batch, dan kesehatan sumber data. Waktu ditampilkan pada zona
          waktu masing-masing job.
        </p>
      </div>

      <div className="pipeline-strip">
        <Dependency label="Antrian QStash" ok={isQStashConfigured()} />
        <div className="pipeline-strip-separator" />
        <Dependency label="Cache Redis" ok={cache.isAvailable()} />
        <div className="pipeline-strip-separator" />
        <Dependency label="Database" ok={error === null} />
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Dicek {now.toISOString().slice(0, 19).replace('T', ' ')} UTC
        </div>
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
        </div>
      )}

      {data && (
        <>
          <Section title="Jadwal job" meta={`${data.schedules.length} terdaftar`}>
            {data.schedules.length === 0 ? (
              <Empty text="Belum ada jadwal. Jalankan npm run db:seed." />
            ) : (
              <table className="instruments-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Pasar</th>
                    <th>Jam</th>
                    <th>Zona waktu</th>
                    <th>Terakhir jalan</th>
                    <th>Jam ini</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedules.map((s) => {
                    const decision = isDue(
                      {
                        jobName: s.jobName,
                        hoursOfDay: s.hoursOfDay,
                        timezone: s.timezone,
                        tradingDaysOnly: s.tradingDaysOnly,
                        lastRunAt: s.lastRunAt,
                      },
                      now,
                    )
                    return (
                      <tr key={s.jobName}>
                        <td className="symbol">
                          {s.jobName}
                          {!s.enabled && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                              }}
                            >
                              dimatikan
                            </span>
                          )}
                        </td>
                        <td>
                          {s.market ? (
                            <span className={`market-badge ${s.market}`}>
                              {fromDbMarket(s.market)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td className="name">{describeHours(s.hoursOfDay)}</td>
                        <td className="name">
                          {s.timezone}
                          {s.tradingDaysOnly && (
                            <span style={{ color: 'var(--text-muted)' }}> · hari bursa</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-tertiary)' }}>
                          {s.lastRunAt ? localSlot(s.lastRunAt, s.timezone).slot : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {!s.enabled
                            ? 'dimatikan'
                            : decision.due
                              ? 'jatuh tempo'
                              : decision.reason}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Sumber data" meta={`${data.health.length} adaptor`}>
            {data.health.length === 0 ? (
              <Empty text="Belum ada adaptor yang pernah dipanggil." />
            ) : (
              <table className="instruments-table">
                <thead>
                  <tr>
                    <th>Adaptor</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Gagal beruntun</th>
                    <th>Sukses terakhir</th>
                    <th>Galat terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {data.health.map((h) => (
                    <tr key={h.sourceId}>
                      <td className="symbol">{h.sourceId}</td>
                      <td>
                        <span className={`status-dot ${dotClass(h.status)}`} />
                        <span style={{ marginLeft: 8, fontSize: 13 }}>{h.status}</span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                          color:
                            h.consecutiveFailures > 0
                              ? 'var(--negative)'
                              : 'var(--text-tertiary)',
                        }}
                      >
                        {h.consecutiveFailures}
                      </td>
                      <td style={{ color: 'var(--text-tertiary)' }}>
                        {h.lastSuccessAt ? formatUtc(h.lastSuccessAt) : '—'}
                      </td>
                      <td
                        className="name"
                        style={{ maxWidth: 320, color: 'var(--text-muted)' }}
                      >
                        {h.lastError ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Fitur terhitung" meta={`versi berjalan ${FEATURE_SET_VERSION}`}>
            {data.features.length === 0 ? (
              <Empty text="Belum ada fitur terhitung. Job compute-features belum pernah jalan." />
            ) : (
              <table className="instruments-table">
                <thead>
                  <tr>
                    <th>Versi set fitur</th>
                    <th style={{ textAlign: 'right' }}>Baris</th>
                    <th style={{ textAlign: 'right' }}>Instrumen</th>
                    <th>Tanggal terakhir</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.featureSetVersion}>
                      <td className="symbol">{f.featureSetVersion}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {f.rows.toLocaleString('id-ID')}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {f.instruments}
                      </td>
                      <td style={{ color: 'var(--text-tertiary)' }}>{f.latestDate ?? '—'}</td>
                      <td className="name" style={{ color: 'var(--text-muted)' }}>
                        {f.featureSetVersion === FEATURE_SET_VERSION
                          ? 'versi berjalan'
                          : 'versi lama, disimpan untuk perbandingan'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Batch terakhir" meta={`${data.runs.length} terbaru`}>
            {data.runs.length === 0 ? (
              <Empty text="Belum ada job yang pernah jalan." />
            ) : (
              <table className="instruments-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Berhasil</th>
                    <th style={{ textAlign: 'right' }}>Gagal</th>
                    <th>Mulai</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="symbol">{r.jobName}</td>
                      <td className="name">{r.batchKey}</td>
                      <td>
                        <span className={`status-dot ${runDotClass(r.status)}`} />
                        <span style={{ marginLeft: 8, fontSize: 13 }}>{r.status}</span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {r.itemsProcessed}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: r.itemsFailed > 0 ? 'var(--negative)' : 'var(--text-tertiary)',
                        }}
                      >
                        {r.itemsFailed}
                      </td>
                      <td style={{ color: 'var(--text-tertiary)' }}>
                        {formatUtc(r.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="Karantina"
            meta={
              data.quarantined.length === 0
                ? 'kosong'
                : `${data.quarantined.length} baris terbaru`
            }
          >
            {data.quarantined.length === 0 ? (
              <Empty text="Tidak ada baris yang ditolak uji kualitas." />
            ) : (
              <table className="instruments-table">
                <thead>
                  <tr>
                    <th>Sumber</th>
                    <th>Alasan</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quarantined.map((q) => (
                    <tr key={q.id}>
                      <td className="symbol">{q.sourceId}</td>
                      <td className="name" style={{ maxWidth: 520 }}>
                        {q.reason}
                      </td>
                      <td style={{ color: 'var(--text-tertiary)' }}>
                        {formatUtc(q.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{meta}</span>
      </div>
      {children}
    </div>
  )
}

function Dependency({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="pipeline-strip-item">
      <span className={`status-dot ${ok ? 'healthy' : 'down'}`} />
      <span>
        {label} {ok ? 'siap' : 'belum diset'}
      </span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
      <div className="empty-state-text">{text}</div>
    </div>
  )
}

function dotClass(status: string): string {
  if (status === 'healthy') return 'healthy'
  if (status === 'degraded') return 'degraded'
  return 'down'
}

function runDotClass(status: string): string {
  if (status === 'success') return 'healthy'
  if (status === 'partial' || status === 'running') return 'degraded'
  return 'down'
}

/** Semua timestamp disimpan UTC; konversi ke zona waktu pasar hanya di tampilan. */
function formatUtc(value: Date): string {
  return value.toISOString().slice(0, 16).replace('T', ' ')
}

function describeHours(hours: number[]): string {
  if (hours.length === 24) return 'tiap jam'
  return hours.map((h) => `${String(h).padStart(2, '0')}.00`).join(', ')
}
