'use client'

import { useState, useMemo } from 'react'
import type { AiTokensDashboardData, KeyAnalyticsItem } from '@/lib/ai/telemetry'
import { ApexChartWrapper } from './apex-chart-wrapper'
import { KeyDetailModal } from './key-detail-modal'
import {
  IconGauge,
  IconPulse,
  IconAlert,
  IconCheck,
  IconLock,
  IconSearch,
  IconTarget,
  IconRows,
  IconFlow,
  IconClose,
} from '@/components/icons'

interface AiTokensDashboardClientProps {
  initialData: AiTokensDashboardData
}

export function AiTokensDashboardClient({ initialData }: AiTokensDashboardClientProps) {
  const [data, setData] = useState<AiTokensDashboardData>(initialData)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [modelFilter, setModelFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedKeyForModal, setSelectedKeyForModal] = useState<KeyAnalyticsItem | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch data ulang saat timeRange / filter berubah
  async function refreshData(nextRange: '24h' | '7d' | '30d', prov = providerFilter, mod = modelFilter) {
    setTimeRange(nextRange)
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/ai-tokens?range=${nextRange}&provider=${prov}&model=${mod}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Gagal memperbarui data AI Tokens:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter keys berdasarkan search query
  const filteredKeys = useMemo(() => {
    let result = data.keys
    if (providerFilter !== 'all') {
      result = result.filter((k) => k.providerId === providerFilter)
    }
    if (modelFilter !== 'all') {
      result = result.filter((k) => k.model === modelFilter)
    }
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
  }, [data.keys, providerFilter, modelFilter, searchQuery])

  // --- Konfigurasi ApexCharts Utama ---

  // Chart 1: Total API Requests (Sukses vs 429 TooManyRequests)
  const requestsTimelineOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
      zoom: { enabled: false },
    },
    theme: { mode: 'dark' },
    colors: ['#10b981', '#ef4444', '#64748b'],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 90, 100],
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data.timeSeries.categories,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
      },
      axisBorder: { color: 'rgba(255,255,255,0.1)' },
      axisTicks: { color: 'rgba(255,255,255,0.1)' },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
      },
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
      strokeDashArray: 3,
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#cbd5e1' },
      fontSize: '12px',
    },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v.toLocaleString()} req` },
    },
  }

  const requestsTimelineSeries = [
    { name: 'Panggilan Sukses', data: data.timeSeries.requestsSuccess },
    { name: '429 TooManyRequests', data: data.timeSeries.requests429 },
    { name: 'Galat Lainnya', data: data.timeSeries.requestsOtherErrors },
  ]

  // Chart 2: Input & Output Tokens
  const tokensTimelineOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      stacked: true,
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    colors: ['#8b5cf6', '#f59e0b'],
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: '60%',
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data.timeSeries.categories,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
      },
      axisBorder: { color: 'rgba(255,255,255,0.1)' },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
        formatter: (v) => `${Math.round(v / 1000)}k`,
      },
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
      strokeDashArray: 3,
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#cbd5e1' },
      fontSize: '12px',
    },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v.toLocaleString()} tokens` },
    },
  }

  const tokensTimelineSeries = [
    { name: 'Input Tokens', data: data.timeSeries.inputTokens },
    { name: 'Output Tokens', data: data.timeSeries.outputTokens },
  ]

  // Chart 3: Requests Share per Model (Donut)
  const modelsDonutOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'donut',
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    colors: ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ec4899', '#3b82f6'],
    labels: data.models.map((m) => m.name),
    dataLabels: { enabled: false },
    legend: {
      position: 'bottom',
      labels: { colors: '#cbd5e1' },
      fontSize: '11px',
    },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total Panggilan',
              color: '#94a3b8',
              fontSize: '11px',
              fontFamily: 'monospace',
              formatter: () => data.overview.totalRequests.toLocaleString(),
            },
            value: {
              color: '#f8fafc',
              fontSize: '18px',
              fontWeight: 700,
              fontFamily: 'monospace',
            },
          },
        },
      },
    },
    stroke: { width: 0 },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v.toLocaleString()} req` },
    },
  }

  const modelsDonutSeries = data.models.map((m) => m.requests)

  // Chart 4: Latensi Respon (Spline)
  const latencyOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    colors: ['#06b6d4'],
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data.timeSeries.categories,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
      },
      axisBorder: { color: 'rgba(255,255,255,0.1)' },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
        formatter: (v) => `${v}ms`,
      },
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
      strokeDashArray: 3,
    },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v} ms` },
    },
  }

  const latencySeries = [{ name: 'Latensi Rata-rata', data: data.timeSeries.latency }]

  return (
    <div className="admin-page-content ai-tokens-dashboard">
      {/* 1. HERO HEADER */}
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
            Pemantauan langsung perputaran {data.overview.totalKeysCount} kunci API terpasang (Gemini, Groq, OpenRouter),
            indikator batas kuota 429 TooManyRequests, konsumsi token input/output, dan analisis visual ApexCharts interaktif.
          </p>

          {/* Time Range Selector */}
          <div className="ai-tokens-range-tabs mono">
            <button
              type="button"
              className={`range-tab ${timeRange === '24h' ? 'active' : ''}`}
              onClick={() => refreshData('24h')}
              disabled={loading}
            >
              24 Jam Terakhir
            </button>
            <button
              type="button"
              className={`range-tab ${timeRange === '7d' ? 'active' : ''}`}
              onClick={() => refreshData('7d')}
              disabled={loading}
            >
              7 Hari
            </button>
            <button
              type="button"
              className={`range-tab ${timeRange === '30d' ? 'active' : ''}`}
              onClick={() => refreshData('30d')}
              disabled={loading}
            >
              30 Hari
            </button>
          </div>
        </div>

        {/* Status System Chips */}
        <div className="admin-hero-chips mono">
          <div className="admin-hero-chips-head">
            <IconLock size={11} />
            <span>KOLAM KUNCI TERPASANG</span>
          </div>

          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span className="admin-hero-chip-name">Kunci Siap</span>
            <span className="admin-hero-chip-value ok">{data.overview.readyKeysCount} Kunci</span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${data.overview.coolingKeysCount > 0 ? 'warn' : 'ok'}`} />
            <span className="admin-hero-chip-name">Sedang Cooldown</span>
            <span className={`admin-hero-chip-value ${data.overview.coolingKeysCount > 0 ? 'warn' : 'ok'}`}>
              {data.overview.coolingKeysCount} Kunci
            </span>
          </div>

          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span className="admin-hero-chip-name">Penyedia Aktif</span>
            <span className="admin-hero-chip-value ok">{data.providers.length} Vendor</span>
          </div>
        </div>
      </div>

      {/* 2. OVERVIEW KPI CARDS (Persis sesuai permintaan pengguna) */}
      <div className="ai-tokens-kpi-grid">
        {/* KPI 1: Total API Requests */}
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">TOTAL API REQUESTS</span>
            <span className="ai-kpi-tag ok mono">All API Keys</span>
          </div>
          <div className="ai-kpi-value mono">{data.overview.totalRequests.toLocaleString()}</div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              Default Gemini: <strong>{data.providers.find((p) => p.id === 'gemini')?.requests.toLocaleString() ?? '0'}</strong>
            </span>
            <span className="ai-kpi-sublink">38 Kunci Bergilir</span>
          </div>
        </div>

        {/* KPI 2: Success Rate */}
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">SUCCESS RATE</span>
            <span
              className="ai-kpi-tag mono"
              style={{
                background: data.overview.successRate >= 95 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: data.overview.successRate >= 95 ? '#10b981' : '#f59e0b',
              }}
            >
              {data.overview.successRate}%
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: '#10b981' }}>
            {data.overview.totalSuccess.toLocaleString()}
          </div>
          <div className="ai-kpi-foot">
            <div className="ai-kpi-bar-wrap">
              <div
                className="ai-kpi-bar-fill"
                style={{ width: `${Math.min(100, data.overview.successRate)}%`, background: '#10b981' }}
              />
            </div>
            <span className="ai-kpi-detail">Berhasil dieksekusi model</span>
          </div>
        </div>

        {/* KPI 3: Total API Errors (429 TooManyRequests) */}
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">TOTAL API ERRORS</span>
            <span className="ai-kpi-tag warn mono">429 TooManyRequests</span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: data.overview.total429Errors > 0 ? '#ef4444' : '#94a3b8' }}>
            {data.overview.totalErrors.toLocaleString()}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              Terkena 429: <strong style={{ color: '#ef4444' }}>{data.overview.total429Errors}x</strong> (Diistirahatkan)
            </span>
            <span className="ai-kpi-sublink">Failover Aman</span>
          </div>
        </div>

        {/* KPI 4: Input Tokens */}
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">INPUT TOKENS</span>
            <span className="ai-kpi-tag mono" style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.15)' }}>
              Prompt Masuk
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: '#8b5cf6' }}>
            {data.overview.totalInputTokens.toLocaleString()}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              Gemini 2.5 Flash:{' '}
              <strong>
                {data.models.find((m) => m.id === 'gemini-2.5-flash')?.inputTokens.toLocaleString() ?? '0'}
              </strong>
            </span>
          </div>
        </div>

        {/* KPI 5: Output Tokens */}
        <div className="ai-kpi-card">
          <div className="ai-kpi-head">
            <span className="ai-kpi-label mono">OUTPUT TOKENS</span>
            <span className="ai-kpi-tag mono" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)' }}>
              Hasil Generasi
            </span>
          </div>
          <div className="ai-kpi-value mono" style={{ color: '#f59e0b' }}>
            {data.overview.totalOutputTokens.toLocaleString()}
          </div>
          <div className="ai-kpi-foot">
            <span className="ai-kpi-detail">
              Rata-rata: <strong>~{Math.round(data.overview.totalOutputTokens / Math.max(1, data.overview.totalRequests))} tok/req</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. APEXCHARTS MAIN SECTION (2 Grid Kolom) */}
      <div className="ai-charts-grid">
        {/* Chart 1: Total API Requests (Sukses vs 429) */}
        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">VOLUME PERMINTAAN &amp; DETEKSI 429</h3>
              <p className="ai-chart-subtitle">
                Grafik garis area tren pemanggilan API sukses vs batas kuota per jam (ApexCharts Area Spline)
              </p>
            </div>
            <div className="ai-chart-badge ok mono">Live Telemetry</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper
              options={requestsTimelineOptions}
              series={requestsTimelineSeries}
              type="area"
              height={300}
            />
          </div>
        </div>

        {/* Chart 2: Input & Output Tokens per Model */}
        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">KONSUMSI TOKEN (INPUT VS OUTPUT)</h3>
              <p className="ai-chart-subtitle">
                Volume token masuk (prompt pasar) dan token keluar (analisis komite) per segmen waktu
              </p>
            </div>
            <div className="ai-chart-badge mono" style={{ color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.3)' }}>
              Token Analysis
            </div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper
              options={tokensTimelineOptions}
              series={tokensTimelineSeries}
              type="bar"
              height={300}
            />
          </div>
        </div>

        {/* Chart 3: Proporsi Penggunaan per Model (Donut) */}
        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">DISTRIBUSI MODEL AI</h3>
              <p className="ai-chart-subtitle">
                Porsi pembagian beban antara Gemini 2.5 Flash, Llama 3.3, DeepSeek, dan OpenRouter
              </p>
            </div>
            <div className="ai-chart-badge mono">Model Share</div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper
              options={modelsDonutOptions}
              series={modelsDonutSeries}
              type="donut"
              height={300}
            />
          </div>
        </div>

        {/* Chart 4: Latensi Respon Model (ms) */}
        <div className="ai-chart-card">
          <div className="ai-chart-card-head">
            <div>
              <h3 className="ai-chart-title mono">LATENSI RESUMEN &amp; INFERENSI</h3>
              <p className="ai-chart-subtitle">
                Kecepatan respons penyedia dalam milidetik (Groq ~300ms, Gemini ~600ms)
              </p>
            </div>
            <div className="ai-chart-badge mono" style={{ color: '#06b6d4', borderColor: 'rgba(6, 182, 212, 0.3)' }}>
              {data.overview.avgLatencyMs}ms Avg
            </div>
          </div>
          <div className="ai-chart-card-body">
            <ApexChartWrapper
              options={latencyOptions}
              series={latencySeries}
              type="line"
              height={300}
            />
          </div>
        </div>
      </div>

      {/* 4. TABEL KOLAM KUNCI & POPUP CHART TRIGGER */}
      <div className="ai-keys-section">
        <div className="ai-keys-header">
          <div>
            <h2 className="ai-keys-title mono">KOLAM KUNCI API TERPASANG ({filteredKeys.length} KUNCI)</h2>
            <p className="ai-keys-subtitle">
              Klik tombol <strong>"Lihat Grafik (Popup)"</strong> pada baris kunci mana pun untuk memunculkan modal analisis detail ApexCharts.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="ai-keys-filters">
            {/* Search Input */}
            <div className="ai-keys-search-wrap">
              <IconSearch size={14} />
              <input
                type="text"
                className="ai-keys-search-input mono"
                placeholder="Cari kunci, fingerprint, provider..."
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

            {/* Provider Filter Tabs */}
            <div className="ai-keys-provider-tabs mono">
              <button
                type="button"
                className={`prov-tab ${providerFilter === 'all' ? 'active' : ''}`}
                onClick={() => setProviderFilter('all')}
              >
                Semua ({data.overview.totalKeysCount})
              </button>
              {data.providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`prov-tab ${providerFilter === p.id ? 'active' : ''}`}
                  onClick={() => setProviderFilter(p.id)}
                >
                  {p.name} ({p.totalKeys})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabel Kunci */}
        <div className="ai-keys-table-wrap">
          <table className="ai-keys-table">
            <thead>
              <tr className="mono">
                <th>KUNCI / ENV</th>
                <th>PROVIDER</th>
                <th>MODEL</th>
                <th>STATUS</th>
                <th>REQUESTS</th>
                <th>SUCCESS %</th>
                <th>429 TOO MANY</th>
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
                    {/* Nama Kunci & Fingerprint */}
                    <td>
                      <div className="key-name-cell mono">
                        <span className="key-env">{k.envName}</span>
                        <span className="key-fp">[{k.fingerprint}]</span>
                      </div>
                    </td>

                    {/* Provider */}
                    <td>
                      <span className="key-prov-badge mono">{k.providerName}</span>
                    </td>

                    {/* Model */}
                    <td>
                      <span className="key-model-badge mono">{k.model}</span>
                    </td>

                    {/* Status */}
                    <td>
                      {k.status === 'ready' ? (
                        <span className="key-status-pill ok mono">
                          <span className="dot" /> Siap
                        </span>
                      ) : (
                        <span className="key-status-pill warn mono">
                          <span className="dot" /> Cooldown ({k.cooldownRemainingSec ?? 60}s)
                        </span>
                      )}
                    </td>

                    {/* Requests */}
                    <td className="mono">{k.totalRequests.toLocaleString()}</td>

                    {/* Success Rate */}
                    <td>
                      <span
                        className="mono"
                        style={{
                          color: k.successRate >= 95 ? '#10b981' : k.successRate >= 80 ? '#f59e0b' : '#ef4444',
                          fontWeight: 600,
                        }}
                      >
                        {k.successRate}%
                      </span>
                    </td>

                    {/* 429 Errors */}
                    <td>
                      <span
                        className="mono"
                        style={{
                          color: k.error429Count > 0 ? '#ef4444' : 'var(--ink-faint)',
                          fontWeight: k.error429Count > 0 ? 700 : 400,
                        }}
                      >
                        {k.error429Count > 0 ? `${k.error429Count}x` : '0'}
                      </span>
                    </td>

                    {/* Total Tokens */}
                    <td className="mono" style={{ color: '#f59e0b' }}>
                      {(k.inputTokens + k.outputTokens).toLocaleString()}
                    </td>

                    {/* Action Button: Buka Popup Chart Apex */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-key-chart mono"
                        onClick={() => setSelectedKeyForModal(k)}
                        title={`Buka grafik analisis ApexCharts untuk ${k.envName}`}
                      >
                        <IconPulse size={12} />
                        <span>Lihat Grafik (Popup)</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. POPUP MODAL APEXCHARTS */}
      {selectedKeyForModal && (
        <KeyDetailModal
          keyItem={selectedKeyForModal}
          onClose={() => setSelectedKeyForModal(null)}
        />
      )}
    </div>
  )
}
