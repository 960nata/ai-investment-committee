'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { ApexOptions } from 'apexcharts'
import type { AiTokensDashboardData, TimeRange } from '@/lib/ai/telemetry'
import { ApexChartWrapper } from './apex-chart-wrapper'
import { UsageDetailModal } from './usage-detail-modal'
import {
  chartOptions,
  compact,
  sparklineOptions,
  COLOR_429,
  COLOR_INPUT,
  COLOR_LATENCY,
  COLOR_OTHER_ERR,
  COLOR_OUTPUT,
  COLOR_SUCCESS,
  SERIES_COLORS,
} from './chart-options'
import { IconAlert, IconLock, IconPulse, IconSearch, IconClose } from '@/components/icons'

interface AiTokensDashboardClientProps {
  initialData: AiTokensDashboardData
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '24h': '24 Jam Terakhir',
  '7d': '7 Hari Terakhir',
  '30d': '30 Hari Terakhir',
}

function fmt(v: number | null | undefined, suffix = ''): string {
  return v == null ? '—' : `${v.toLocaleString('id-ID')}${suffix}`
}

function rateColor(rate: number | null): string | undefined {
  if (rate == null) return undefined
  return rate >= 95 ? COLOR_SUCCESS : rate >= 80 ? '#f59e0b' : COLOR_429
}

export function AiTokensDashboardClient({ initialData }: AiTokensDashboardClientProps) {
  const [data, setData] = useState<AiTokensDashboardData>(initialData)
  const [loading, setLoading] = useState(false)
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [modal, setModal] = useState<{ providerId: string; keyId?: string } | null>(null)

  const [refreshError, setRefreshError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const timeRange = data.range
  const rangeLabel = RANGE_LABELS[timeRange]

  const refreshData = useCallback(async (nextRange: TimeRange) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/ai-tokens?range=${nextRange}`, {
        cache: 'no-store', signal: controller.signal,
      })
      if (!res.ok) throw new Error(res.status === 401 ? 'Sesi admin berakhir. Masuk kembali.' : 'Monitoring gagal diperbarui; data terakhir tetap ditampilkan.')
      const next = await res.json() as AiTokensDashboardData
      if (!controller.signal.aborted) { setData(next); setRefreshError(null) }
    } catch (err) {
      if (!controller.signal.aborted) setRefreshError(err instanceof Error ? err.message : 'Gagal memperbarui monitoring')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshData(timeRange)
    }, 30_000)
    return () => { clearInterval(timer); requestRef.current?.abort() }
  }, [refreshData, timeRange])

  const filteredKeys = useMemo(() => {
    let result = data.keys
    if (providerFilter !== 'all') result = result.filter((k) => k.providerId === providerFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (k) =>
          k.envName.toLowerCase().includes(q) ||
          k.fingerprint.toLowerCase().includes(q) ||
          k.providerName.toLowerCase().includes(q) ||
          k.model.toLowerCase().includes(q),
      )
    }
    return result
  }, [data.keys, providerFilter, searchQuery])

  const { overview, series, categories } = data
  const topModel = data.models[0]
  const hasActivity = overview.requests > 0

  // --- Grafik utama ---
  const requestsOptions = chartOptions('area', categories, {
    colors: [COLOR_SUCCESS, COLOR_429, COLOR_OTHER_ERR],
    unit: ' req',
  })
  const requestsSeries = [
    { name: 'Panggilan sukses', data: series.success },
    { name: '429 TooManyRequests', data: series.rateLimited },
    { name: 'Galat lain', data: series.otherErrors },
  ]

  const tokensOptions = chartOptions('bar', categories, {
    colors: [COLOR_INPUT, COLOR_OUTPUT],
    chart: { stacked: true },
    unit: ' token',
  })
  const tokensSeries = [
    { name: 'Input tokens', data: series.inputTokens },
    { name: 'Output tokens', data: series.outputTokens },
  ]

  const donutModels = data.models.filter((m) => m.totals.requests > 0)
  const modelsDonutOptions: ApexOptions = {
    chart: { type: 'donut', background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: 'dark' },
    colors: SERIES_COLORS,
    labels: donutModels.map((m) => `${m.model} · ${m.providerName}`),
    dataLabels: { enabled: false },
    legend: { position: 'bottom', labels: { colors: '#cbd5e1' }, fontSize: '11px' },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total panggilan',
              color: '#94a3b8',
              fontSize: '11px',
              fontFamily: 'monospace',
              formatter: () => overview.requests.toLocaleString('id-ID'),
            },
            value: { color: '#f8fafc', fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' },
          },
        },
      },
    },
    stroke: { width: 0 },
    tooltip: { theme: 'dark', y: { formatter: (v) => `${v.toLocaleString('id-ID')} req` } },
    noData: { text: 'Belum ada panggilan', style: { color: '#64748b', fontSize: '12px' } },
  }

  const latencyOptions = chartOptions('line', categories, {
    colors: [COLOR_LATENCY],
    unit: ' ms',
    yFormatter: (v) => `${Math.round(v)}ms`,
  })
  const latencySeries = [{ name: 'Latensi rata-rata', data: series.latencyMs }]

  return (
    <div className="admin-page-content ai-tokens-dashboard">
      {refreshError && <p role="alert">{refreshError}</p>}
      <p className="mono">Diperbarui {new Date(data.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB · otomatis setiap 30 detik</p>
      {data.storage !== 'redis' && <p role="status">{data.storage === 'degraded' ? 'Redis bermasalah: riwayat dapat tidak lengkap.' : 'Redis belum dikonfigurasi: angka hanya dari proses server ini.'}</p>}
      {/* 1. HERO */}
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />

        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span>KONTROL KUOTA &amp; TELEMETRI MODEL AI</span>
          </div>

          <h1 className="admin-page-headline">
            Analisis <span className="admin-headline-accent">AI Token</span> &amp; Kolam Kunci API
          </h1>

          <p className="admin-page-standfirst">
            Pemakaian nyata {overview.totalKeysCount} kunci API dari {data.providers.length} penyedia: permintaan,
            galat 429 TooManyRequests, token input/output, dan latensi. Klik kartu penyedia atau baris kunci untuk
            membuka grafik rinciannya.
          </p>

          <div className="ai-tokens-range-tabs mono">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`range-tab ${timeRange === r ? 'active' : ''}`}
                onClick={() => refreshData(r)}
                disabled={loading}
              >
                {r === '24h' ? '24 Jam' : r === '7d' ? '7 Hari' : '30 Hari'}
              </button>
            ))}
            <button
              type="button"
              className="range-tab"
              onClick={() => refreshData(timeRange)}
              disabled={loading}
              title="Muat ulang data"
            >
              {loading ? 'Memuat…' : 'Muat ulang'}
            </button>
          </div>
        </div>

        <div className="admin-hero-chips mono">
          <div className="admin-hero-chips-head">
            <IconLock size={11} />
            <span>KOLAM KUNCI TERPASANG</span>
          </div>
          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span className="admin-hero-chip-name">Kunci siap</span>
            <span className="admin-hero-chip-value ok">{overview.readyKeysCount} kunci</span>
          </div>
          <div className="admin-hero-chip">
            <span className={`chip-indicator ${overview.coolingKeysCount > 0 ? 'warn' : 'ok'}`} />
            <span className="admin-hero-chip-name">Sedang cooldown</span>
            <span className={`admin-hero-chip-value ${overview.coolingKeysCount > 0 ? 'warn' : 'ok'}`}>
              {overview.coolingKeysCount} kunci
            </span>
          </div>
          <div className="admin-hero-chip">
            <span className={`chip-indicator ${data.storage === 'redis' ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Penyimpanan</span>
            <span className={`admin-hero-chip-value ${data.storage === 'redis' ? 'ok' : 'warn'}`}>
              {data.storage === 'redis' ? 'Redis' : data.storage === 'degraded' ? 'Terganggu' : 'Memori'}
            </span>
          </div>
        </div>
      </div>

      {data.storage === 'memory' && (
        <div className="key-cooldown-alert">
          <IconAlert size={16} />
          <div>
            <strong>Redis belum dikonfigurasi</strong>
            <p>
              Angka di halaman ini hanya berasal dari memori proses server yang sedang melayani, dan hilang saat server
              dimulai ulang. Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN supaya riwayat 7 dan 30 hari
              tersimpan.
            </p>
          </div>
        </div>
      )}

      {/* 2. KPI */}
      <div className="ai-tokens-kpi-grid">
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">TOTAL API REQUESTS</span>
            <span className="ai-kpi-tag ok mono">Semua kunci</span>
          </div>
          <div className="ai-kpi-value mono">{fmt(overview.requests)}</div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">{rangeLabel}</span>
            <span className="ai-kpi-sublink">{overview.totalKeysCount} kunci bergilir</span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">SUCCESS RATE</span>
            <span className="ai-kpi-tag mono" style={{ color: rateColor(overview.successRate) }}>
              {fmt(overview.successRate, '%')}
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: COLOR_SUCCESS }}>
            {fmt(overview.success)}
          </div>
          <div className="ai-kpi-foot">
            <div className="ai-kpi-bar-wrap">
              <div
                className="ai-kpi-bar-fill"
                style={{ width: `${Math.min(100, overview.successRate ?? 0)}%`, background: COLOR_SUCCESS }}
              />
            </div>
            <span className="ai-kpi-detail">panggilan berhasil</span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">TOTAL API ERRORS</span>
            <span className="ai-kpi-tag warn mono">429 TooManyRequests</span>
          </div>
          <div
            className="ai-kpi-value mono"
            style={{ color: overview.rateLimited + overview.otherErrors > 0 ? COLOR_429 : '#94a3b8' }}
          >
            {fmt(overview.rateLimited + overview.otherErrors)}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              429: <strong style={{ color: COLOR_429 }}>{fmt(overview.rateLimited)}</strong> · lain:{' '}
              <strong>{fmt(overview.otherErrors)}</strong>
            </span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">INPUT TOKENS</span>
            <span className="ai-kpi-tag mono" style={{ color: COLOR_INPUT }}>
              Prompt masuk
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: COLOR_INPUT }}>
            {fmt(overview.inputTokens)}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              {topModel && topModel.totals.requests > 0 ? (
                <>
                  {topModel.model}: <strong>{fmt(topModel.totals.inputTokens)}</strong>
                </>
              ) : (
                'Belum ada pemakaian'
              )}
            </span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">OUTPUT TOKENS</span>
            <span className="ai-kpi-tag mono" style={{ color: COLOR_OUTPUT }}>
              Hasil generasi
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: COLOR_OUTPUT }}>
            {fmt(overview.outputTokens)}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              Rata-rata:{' '}
              <strong>
                {overview.success > 0 ? `${Math.round(overview.outputTokens / overview.success)} tok/req` : '—'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. KARTU PENYEDIA → POPUP */}
      <div className="ai-provider-grid">
        {data.providers.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="ai-provider-card"
            onClick={() => setModal({ providerId: p.id })}
            title={`Buka grafik pemakaian ${p.name}`}
          >
            <div className="ai-provider-card-head">
              <span className="ai-provider-name">{p.name}</span>
              <span className={`ai-provider-keys mono ${p.coolingKeys > 0 ? 'warn' : ''}`}>
                {p.availableKeys}/{p.totalKeys} siap
              </span>
            </div>
            <span className="ai-provider-model mono">{p.model}</span>
            <div className="ai-provider-spark">
              <ApexChartWrapper
                options={sparklineOptions(SERIES_COLORS[i % SERIES_COLORS.length])}
                series={[{ name: 'Requests', data: p.series.requests }]}
                type="area"
                height={44}
              />
            </div>
            <div className="ai-provider-stats mono">
              <span>
                <em>REQ</em>
                {compact(p.totals.requests)}
              </span>
              <span style={{ color: rateColor(p.totals.successRate) }}>
                <em>SUKSES</em>
                {fmt(p.totals.successRate, '%')}
              </span>
              <span style={{ color: p.totals.rateLimited > 0 ? COLOR_429 : undefined }}>
                <em>429</em>
                {compact(p.totals.rateLimited)}
              </span>
              <span>
                <em>TOKEN</em>
                {compact(p.totals.inputTokens + p.totals.outputTokens)}
              </span>
            </div>
            <span className="ai-provider-cta mono">
              <IconPulse size={11} /> Lihat grafik
            </span>
          </button>
        ))}
      </div>

      {/* 4. GRAFIK UTAMA */}
      <div className="ai-charts-grid">
        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">VOLUME PERMINTAAN &amp; DETEKSI 429</h3>
              <p className="ai-chart-subtitle">Panggilan sukses vs kena batas kuota, seluruh penyedia</p>
            </div>
            <div className="ai-chart-badge ok mono">{rangeLabel}</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper options={requestsOptions} series={requestsSeries} type="area" height={300} />
          </div>
        </div>

        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">KONSUMSI TOKEN (INPUT VS OUTPUT)</h3>
              <p className="ai-chart-subtitle">Token prompt masuk dan token hasil generasi per segmen waktu</p>
            </div>
            <div className="ai-chart-badge mono">{compact(overview.totalTokens)} token</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper options={tokensOptions} series={tokensSeries} type="bar" height={300} />
          </div>
        </div>

        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">DISTRIBUSI MODEL AI</h3>
              <p className="ai-chart-subtitle">Porsi permintaan per model dan penyedia</p>
            </div>
            <div className="ai-chart-badge mono">{donutModels.length} model aktif</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper
              options={modelsDonutOptions}
              series={donutModels.map((m) => m.totals.requests)}
              type="donut"
              height={300}
            />
          </div>
        </div>

        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">LATENSI RESPONS</h3>
              <p className="ai-chart-subtitle">Rata-rata waktu respons panggilan sukses, dalam milidetik</p>
            </div>
            <div className="ai-chart-badge mono">{fmt(overview.avgLatencyMs, ' ms')} rata-rata</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper options={latencyOptions} series={latencySeries} type="line" height={300} />
          </div>
        </div>
      </div>

      {/* 5. TABEL KUNCI */}
      <div className="ai-keys-section">
        <div className="ai-keys-header">
          <div>
            <h2 className="ai-keys-title mono">KOLAM KUNCI API ({filteredKeys.length} KUNCI)</h2>
            <p className="ai-keys-subtitle">
              {hasActivity
                ? 'Klik "Lihat grafik" pada kunci mana pun untuk membuka popup analisisnya.'
                : `Belum ada panggilan tercatat dalam ${rangeLabel.toLowerCase()}.`}
            </p>
          </div>

          <div className="ai-keys-filters">
            <div className="ai-keys-search-wrap">
              <IconSearch size={14} />
              <input
                type="text"
                className="ai-keys-search-input mono"
                placeholder="Cari kunci, sidik, penyedia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ai-keys-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Bersihkan pencarian"
                >
                  <IconClose size={12} />
                </button>
              )}
            </div>

            <div className="ai-keys-provider-tabs mono">
              <button
                type="button"
                className={`prov-tab ${providerFilter === 'all' ? 'active' : ''}`}
                onClick={() => setProviderFilter('all')}
              >
                Semua ({data.keys.length})
              </button>
              {data.providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`prov-tab ${providerFilter === p.id ? 'active' : ''}`}
                  onClick={() => setProviderFilter(p.id)}
                >
                  {p.name} ({data.keys.filter((k) => k.providerId === p.id).length})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ai-keys-table-wrap">
          <table className="ai-keys-table">
            <thead>
              <tr className="mono">
                <th>KUNCI / ENV</th>
                <th>PENYEDIA</th>
                <th>MODEL</th>
                <th>STATUS</th>
                <th>REQUESTS</th>
                <th>SUCCESS %</th>
                <th>429</th>
                <th>TOTAL TOKENS</th>
                <th style={{ textAlign: 'right' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-faint)' }}>
                    Tidak ada kunci yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredKeys.map((k) => (
                  <tr key={k.id} className={k.status === 'cooldown' ? 'row-cooldown' : ''}>
                    <td>
                      <div className="key-name-cell mono">
                        <span className="key-env">{k.envName}</span>
                        <span className="key-fp">[{k.fingerprint}]</span>
                      </div>
                    </td>
                    <td>
                      <span className="key-prov-badge mono">{k.providerName}</span>
                    </td>
                    <td>
                      <span className="key-model-badge mono">{k.model}</span>
                    </td>
                    <td>
                      {k.status === 'ready' ? (
                        <span className="key-status-pill ok mono">
                          <span className="dot" /> Siap
                        </span>
                      ) : (
                        <span className="key-status-pill warn mono">
                          <span className="dot" /> {k.status === 'cooldown' ? 'Cooldown' : k.status === 'blocked' ? 'Konfigurasi belum lengkap' : 'Dicabut'}
                        </span>
                      )}
                    </td>
                    <td className="mono">{fmt(k.totals.requests)}</td>
                    <td>
                      <span className="mono" style={{ color: rateColor(k.totals.successRate), fontWeight: 600 }}>
                        {fmt(k.totals.successRate, '%')}
                      </span>
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          color: k.totals.rateLimited > 0 ? COLOR_429 : 'var(--ink-faint)',
                          fontWeight: k.totals.rateLimited > 0 ? 700 : 400,
                        }}
                      >
                        {fmt(k.totals.rateLimited)}
                      </span>
                    </td>
                    <td className="mono" style={{ color: COLOR_OUTPUT }}>
                      {fmt(k.totals.inputTokens + k.totals.outputTokens)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-key-chart mono"
                        onClick={() => setModal({ providerId: k.providerId, keyId: k.id })}
                        title={`Buka grafik analisis untuk ${k.envName}`}
                      >
                        <IconPulse size={12} />
                        <span>Lihat grafik</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <UsageDetailModal
          key={`${modal.providerId}-${modal.keyId ?? 'all'}`}
          data={data}
          providerId={modal.providerId}
          initialKeyId={modal.keyId}
          rangeLabel={rangeLabel}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
