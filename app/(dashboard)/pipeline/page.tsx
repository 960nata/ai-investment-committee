/**
 * Pipeline — keadaan mesin, bukan keadaan pasar.
 *
 * Lima hal yang ditampilkan: kesiapan layanan penopang, jadwal job, kesehatan
 * tiap sumber data, hasil batch terakhir, dan baris yang dikarantina.
 *
 * Baris karantina sengaja terlihat. Sebagian besar anomali harga ternyata aksi
 * korporasi yang belum terekam, bukan data rusak; kalau disembunyikan, yang
 * hilang justru petunjuknya.
 */

import {
  IconDatabase,
  IconFlask,
  IconLayers,
  IconPlug,
  IconQueue,
  IconSchedule,
} from '@/components/icons'
import { Blank, DatabaseNotice, Lamp, Tag, type State } from '@/components/ui'
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

export const metadata = { title: 'Pipeline' }

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
    <>
      <header className="masthead">
        <p className="eyebrow">Operasional</p>
        <h1 className="headline">Pipeline</h1>
        <p className="standfirst">
          Penjadwalan, kesehatan sumber, dan hasil batch terakhir. Waktu ditampilkan pada zona
          waktu masing-masing job.
        </p>
      </header>

      <div className="statusbar">
        <span className="status-item">
          <Lamp state={error === null ? 'ok' : 'halted'} />
          <IconDatabase size={14} />
          basis data {error === null ? 'terhubung' : 'terputus'}
        </span>
        <span className="status-item">
          <Lamp state={isQStashConfigured() ? 'ok' : 'unknown'} />
          <IconQueue size={14} />
          antrian {isQStashConfigured() ? 'aktif' : 'belum diset'}
        </span>
        <span className="status-item">
          <Lamp state={cache.isAvailable() ? 'ok' : 'unknown'} />
          cache {cache.isAvailable() ? 'aktif' : 'belum diset'}
        </span>
        <span className="status-spacer mono" style={{ fontSize: 'var(--t-small)', color: 'var(--ink-faint)' }}>
          {now.toISOString().slice(0, 16).replace('T', ' ')} UTC
        </span>
      </div>

      {error && <DatabaseNotice detail={error} />}

      {data && (
        <>
          <Panel icon={<IconSchedule size={14} />} title="Jadwal" meta={`${data.schedules.length} job`}>
            {data.schedules.length === 0 ? (
              <Blank icon={<IconSchedule size={22} />} title="Belum ada jadwal">
                Jalankan <code>npm run db:seed</code> untuk mengisi jadwal awal.
              </Blank>
            ) : (
              <table className="grid">
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
                        <td className="key">{s.jobName}</td>
                        <td>{s.market ? <Tag>{fromDbMarket(s.market)}</Tag> : <span className="dim">—</span>}</td>
                        <td className="dim">{describeHours(s.hoursOfDay)}</td>
                        <td className="dim">
                          {s.timezone}
                          {s.tradingDaysOnly && ' · hari bursa'}
                        </td>
                        <td className="dim">
                          {s.lastRunAt ? localSlot(s.lastRunAt, s.timezone).slot : '—'}
                        </td>
                        <td>
                          {!s.enabled ? (
                            <Tag>dimatikan</Tag>
                          ) : decision.due ? (
                            <Tag tone="signal">jatuh tempo</Tag>
                          ) : (
                            <span className="dim" style={{ fontSize: 'var(--t-small)' }}>
                              {decision.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel icon={<IconPlug size={14} />} title="Sumber data" meta={`${data.health.length} adapter`}>
            {data.health.length === 0 ? (
              <Blank icon={<IconPlug size={22} />} title="Belum ada adapter yang dipanggil">
                Catatan kesehatan terisi sendiri begitu job ingest pertama berjalan.
              </Blank>
            ) : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Adapter</th>
                    <th>Status</th>
                    <th className="num">Gagal beruntun</th>
                    <th>Sukses terakhir</th>
                    <th>Galat terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {data.health.map((h) => (
                    <tr key={h.sourceId}>
                      <td className="key">{h.sourceId}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Lamp state={healthState(h.status)} />
                          {h.status}
                        </span>
                      </td>
                      <td className="num" style={{ color: h.consecutiveFailures > 0 ? 'var(--halted)' : undefined }}>
                        {h.consecutiveFailures}
                      </td>
                      <td className="dim">{h.lastSuccessAt ? stamp(h.lastSuccessAt) : '—'}</td>
                      <td className="wrap">{h.lastError ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            icon={<IconLayers size={14} />}
            title="Fitur terhitung"
            meta={`versi berjalan ${FEATURE_SET_VERSION}`}
          >
            {data.features.length === 0 ? (
              <Blank icon={<IconLayers size={22} />} title="Belum ada fitur terhitung">
                Job <code>compute-features-crypto</code> belum pernah berjalan, atau riwayat
                harganya belum cukup panjang.
              </Blank>
            ) : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Versi</th>
                    <th className="num">Baris</th>
                    <th className="num">Instrumen</th>
                    <th>Tanggal terakhir</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.featureSetVersion}>
                      <td className="key">{f.featureSetVersion}</td>
                      <td className="num">{f.rows.toLocaleString('id-ID')}</td>
                      <td className="num">{f.instruments}</td>
                      <td className="dim">{f.latestDate ?? '—'}</td>
                      <td>
                        {f.featureSetVersion === FEATURE_SET_VERSION ? (
                          <Tag tone="ok">versi berjalan</Tag>
                        ) : (
                          <Tag>disimpan untuk perbandingan</Tag>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel icon={<IconQueue size={14} />} title="Batch terakhir" meta={`${data.runs.length} terbaru`}>
            {data.runs.length === 0 ? (
              <Blank icon={<IconQueue size={22} />} title="Belum ada job yang pernah jalan" />
            ) : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th className="num">Berhasil</th>
                    <th className="num">Gagal</th>
                    <th>Mulai</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="key">{r.jobName}</td>
                      <td className="dim">{r.batchKey}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Lamp state={runState(r.status)} />
                          {r.status}
                        </span>
                      </td>
                      <td className="num">{r.itemsProcessed}</td>
                      <td className="num" style={{ color: r.itemsFailed > 0 ? 'var(--halted)' : undefined }}>
                        {r.itemsFailed}
                      </td>
                      <td className="dim">{stamp(r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            icon={<IconFlask size={14} />}
            title="Karantina"
            meta={data.quarantined.length === 0 ? 'kosong' : `${data.quarantined.length} terbaru`}
          >
            {data.quarantined.length === 0 ? (
              <Blank icon={<IconFlask size={22} />} title="Tidak ada baris yang ditolak">
                Baris yang gagal uji kualitas ditahan di sini, bukan dibuang. Sebagian besar
                anomali harga ternyata aksi korporasi yang belum terekam.
              </Blank>
            ) : (
              <table className="grid">
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
                      <td className="key">{q.sourceId}</td>
                      <td className="wrap">{q.reason}</td>
                      <td className="dim">{stamp(q.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Panel({
  icon,
  title,
  meta,
  children,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">
          {icon}
          {title}
        </span>
        <span className="panel-meta">{meta}</span>
      </div>
      <div className="scroll-x">{children}</div>
    </section>
  )
}

function healthState(status: string): State {
  if (status === 'healthy') return 'ok'
  if (status === 'degraded') return 'degraded'
  return 'halted'
}

function runState(status: string): State {
  if (status === 'success') return 'ok'
  if (status === 'partial' || status === 'running') return 'degraded'
  return 'halted'
}

/** Semua stempel waktu disimpan UTC; konversi zona waktu hanya di tampilan. */
function stamp(value: Date): string {
  return value.toISOString().slice(0, 16).replace('T', ' ')
}

function describeHours(hours: number[]): string {
  if (hours.length === 24) return 'tiap jam'
  return hours.map((h) => `${String(h).padStart(2, '0')}.00`).join(', ')
}
