'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiTokensDashboardData } from '@/lib/ai/telemetry'
import { IconAlert, IconArrowRight, IconBolt, IconCheck, IconClock, IconDatabase, IconPulse, IconRefresh } from '@/components/icons'
import styles from './ai-activity.module.css'

interface Props {
  initialData: AiTokensDashboardData
  committee: { name: string; provider: string }[]
}

const WIB = { timeZone: 'Asia/Jakarta' } as const

export function AiActivityClient({ initialData, committee }: Props) {
  const [data, setData] = useState(initialData)
  const [feature, setFeature] = useState('all')
  const [provider, setProvider] = useState('all')
  const [result, setResult] = useState('all')
  const [loading, setLoading] = useState(false)
  const [shownCount, setShownCount] = useState(25)
  const [error, setError] = useState<string | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/ai-tokens?range=24h', {
        cache: 'no-store', signal: controller.signal,
      })
      if (!response.ok) throw new Error(response.status === 401
        ? 'Sesi admin berakhir. Masuk kembali.'
        : 'Aktivitas gagal diperbarui. Data terakhir tetap ditampilkan.')
      const next = await response.json() as AiTokensDashboardData
      if (!controller.signal.aborted) { setData(next); setError(null) }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Gagal memuat aktivitas')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => { clearInterval(timer); activeRequest.current?.abort() }
  }, [refresh])

  const features = [...new Set(data.recentCalls.map((call) => call.feature ?? 'unspecified'))].sort()
  const providers = [...new Set(data.recentCalls.map((call) => call.providerId))].sort()
  const visible = useMemo(() => data.recentCalls.filter((call) =>
    (feature === 'all' || (call.feature ?? 'unspecified') === feature) &&
    (provider === 'all' || call.providerId === provider) &&
    (result === 'all' || (result === 'success' ? call.success : !call.success)),
  ), [data.recentCalls, feature, provider, result])

  const total = data.recentCalls.length
  const succeeded = data.recentCalls.filter((call) => call.success).length
  const fallbacks = data.recentCalls.filter((call) => (call.attempt ?? 1) > 1).length
  const requests = new Set(data.recentCalls.map((call, index) => call.requestId ?? `legacy-${index}`)).size
  const providerName = (id: string) => data.configuration.find((item) => item.id === id)?.name ?? id

  const shown = visible.slice(0, shownCount)
  const configured = committee.filter((role) => {
    const item = data.configuration.find((entry) => entry.id === role.provider)
    return item?.configured && !item.issue
  }).length

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono"><IconPulse size={13} /><span>PEMANTAUAN OPERASIONAL AI</span></div>
          <h1 className="admin-page-headline">Alur &amp; <span className="admin-headline-accent">Aktivitas AI</span></h1>
          <p className="admin-page-standfirst">
            Pantau pilihan provider setiap fitur dan lihat kapan permintaan berpindah ke cadangan. Data di bawah menampilkan hingga 100 percobaan terakhir dalam 24 jam.
          </p>
          <div className="admin-hero-actions">
            <button type="button" className="btn btn-primary mono" onClick={() => void refresh()} disabled={loading}>
              <IconRefresh size={14} /> {loading ? 'Memuat…' : 'Muat ulang'}
            </button>
            <span className={styles.updated}>Diperbarui {new Date(data.generatedAt).toLocaleString('id-ID', WIB)} WIB</span>
          </div>
        </div>
        <div className="admin-hero-chips mono">
          <div className="admin-hero-chips-head"><IconDatabase size={11} /> STATUS MONITORING</div>
          <div className="admin-hero-chip">
            <span className={`chip-indicator ${data.storage === 'redis' ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Penyimpanan</span>
            <span className={`admin-hero-chip-value ${data.storage === 'redis' ? 'ok' : 'warn'}`}>
              {data.storage === 'redis' ? 'Redis' : data.storage === 'degraded' ? 'Terganggu' : 'Memori'}
            </span>
          </div>
          <div className="admin-hero-chip"><span className="chip-indicator ok" /><span className="admin-hero-chip-name">Penyegaran</span><span className="admin-hero-chip-value">30 detik</span></div>
          <div className="admin-hero-chips-foot">Saat tab aktif</div>
        </div>
      </div>

      {error && <div role="alert" className={styles.notice}><IconAlert size={16} /><span>{error}</span></div>}
      {data.storage !== 'redis' && <div role="status" className={styles.notice}>
        <IconAlert size={16} /><span>{data.storage === 'degraded'
          ? 'Redis terganggu. Aktivitas dari instance lain mungkin belum lengkap.'
          : 'Redis belum dikonfigurasi. Aktivitas hanya berasal dari proses server ini.'}</span>
      </div>}

      <div className="admin-stats-grid">
        <article className="admin-stat-card">
          <div className="admin-stat-top"><span className="admin-stat-label mono">PERMINTAAN</span><span className="admin-stat-icon-wrap"><IconPulse size={15} /></span></div>
          <div className="admin-stat-number">{requests}</div>
          <div className="admin-stat-meta mono">ID unik dalam aktivitas terbaru</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-top"><span className="admin-stat-label mono">PANGGILAN SUKSES</span><span className="admin-stat-icon-wrap"><IconCheck size={15} /></span></div>
          <div className="admin-stat-number">{succeeded}<span className={styles.statTotal}> / {total}</span></div>
          <div className="admin-stat-meta mono"><span className="admin-stat-badge safe">{total ? Math.round(succeeded / total * 100) : 0}% berhasil</span></div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-top"><span className="admin-stat-label mono">FALLBACK / RETRY</span><span className="admin-stat-icon-wrap"><IconBolt size={15} /></span></div>
          <div className="admin-stat-number">{fallbacks}</div>
          <div className="admin-stat-meta mono"><span className={`admin-stat-badge ${fallbacks ? 'active' : 'safe'}`}>{fallbacks ? 'Ada perpindahan provider' : 'Tidak ada perpindahan'}</span></div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-top"><span className="admin-stat-label mono">GILIRAN SIAP</span><span className="admin-stat-icon-wrap"><IconClock size={15} /></span></div>
          <div className="admin-stat-number">{configured}<span className={styles.statTotal}> / {committee.length}</span></div>
          <div className="admin-stat-meta mono">Provider pertama terkonfigurasi</div>
        </article>
      </div>

      <section aria-labelledby="ai-route-title">
        <div className="admin-section-header"><h2 id="ai-route-title" className="admin-section-title">ALUR PROVIDER</h2><span className="admin-section-line" aria-hidden="true" /></div>
        <div className={styles.routeGrid}>
          <div className={styles.routeCard}>
            <div className={styles.routeHeading}><span className={styles.routeEyebrow}>EMPAT GILIRAN</span><strong>Komite investasi</strong></div>
            <ol className={styles.roleList}>{committee.map((role, index) => {
              const config = data.configuration.find((item) => item.id === role.provider)
              const ready = Boolean(config?.configured && !config.issue)
              return <li key={role.name} className={styles.roleRow}>
                <span className={styles.step}>{index + 1}</span>
                <span className={styles.roleName}>{role.name}</span>
                <IconArrowRight size={13} />
                <span className={styles.roleProvider} title={config?.model ?? role.provider}>{providerName(role.provider)}</span>
                <span className={`${styles.stateDot} ${ready ? styles.ready : styles.unready}`} title={ready ? 'Terkonfigurasi' : config?.issue ?? 'Kunci belum dikonfigurasi'} />
              </li>
            })}</ol>
            <p className={styles.routeNote}>Jika provider pertama gagal, komite mencoba provider lain yang tersedia.</p>
          </div>
          <div className={styles.routeCard}>
            <div className={styles.routeHeading}><span className={styles.routeEyebrow}>TANYA KOMITE</span><strong>Jawaban pengguna</strong></div>
            <div className={styles.askFlow}><span>OpenAI GPT</span><IconArrowRight size={14} /><span>Cloudflare</span><IconArrowRight size={14} /><span>Cadangan</span></div>
            <p className={styles.routeNote}>Urutan ini adalah prioritas. Provider yang benar-benar menjawab terlihat pada aktivitas di bawah.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="ai-activity-title">
        <div className="admin-section-header"><h2 id="ai-activity-title" className="admin-section-title">AKTIVITAS TERBARU</h2><span className="admin-section-line" aria-hidden="true" /></div>
        <div className="admin-table-card">
          <div className="admin-table-card-head">
            <div><h3 className="admin-table-title">Jejak panggilan API</h3><p className="admin-table-subtitle">Satu baris adalah satu percobaan; beberapa baris bisa berbagi ID permintaan.</p></div>
            <span className={styles.tableCount}>{visible.length} ditampilkan dari {total} terbaru</span>
          </div>
          <div className={styles.filters} aria-label="Filter aktivitas AI">
            <label>FITUR<select value={feature} onChange={(event) => { setFeature(event.target.value); setShownCount(25) }}>
              <option value="all">Semua fitur</option>{features.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <label>PROVIDER<select value={provider} onChange={(event) => { setProvider(event.target.value); setShownCount(25) }}>
              <option value="all">Semua provider</option>{providers.map((id) => <option key={id} value={id}>{providerName(id)}</option>)}
            </select></label>
            <label>HASIL<select value={result} onChange={(event) => { setResult(event.target.value); setShownCount(25) }}>
              <option value="all">Semua hasil</option><option value="success">Sukses</option><option value="failure">Gagal</option>
            </select></label>
          </div>
          <div className="admin-table-container"><table className={`admin-table ${styles.table}`}>
            <thead><tr><th>Waktu WIB</th><th>Fitur / ID</th><th>Provider / Model</th><th>Percobaan</th><th>Hasil</th><th>Token</th><th>Latensi</th></tr></thead>
            <tbody>{shown.map((call, index) => <tr key={`${call.requestId ?? 'legacy'}-${call.attempt ?? 1}-${index}`}>
              <td className={styles.nowrap}>{new Date(call.timestamp ?? 0).toLocaleString('id-ID', WIB)}</td>
              <td><span className={styles.primary}>{call.feature ?? 'Tidak tercatat'}</span><span className={styles.secondary}>{call.requestId?.slice(0, 8) ?? '—'}</span></td>
              <td><span className={styles.primary}>{providerName(call.providerId)}</span><span className={styles.secondary}>{call.model}</span></td>
              <td className={styles.nowrap}>{call.attempt ?? 1}{(call.attempt ?? 1) > 1 ? ' · fallback' : ''}</td>
              <td><span className={`${styles.resultBadge} ${call.success ? styles.success : styles.failure}`}>{call.success ? 'Sukses' : `${call.errorKind ?? 'Gagal'} · ${call.status}`}</span></td>
              <td className={styles.nowrap}>{call.inputTokens} / {call.outputTokens}</td>
              <td className={styles.nowrap}>{call.latencyMs} ms</td>
            </tr>)}</tbody>
          </table>{visible.length === 0 && <div className={styles.empty}>Tidak ada aktivitas yang cocok dengan filter.</div>}</div>
          {visible.length > shownCount && <div className={styles.more}><button type="button" className="btn mono" onClick={() => setShownCount((count) => count + 25)}>Tampilkan 25 lagi</button></div>}
        </div>
      </section>
    </div>
  )
}
