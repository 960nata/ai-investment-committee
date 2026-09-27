'use client'

import { useEffect } from 'react'
import type { KeyAnalyticsItem } from '@/lib/ai/telemetry'
import { ApexChartWrapper } from './apex-chart-wrapper'
import {
  IconClose,
  IconCheck,
  IconAlert,
  IconGauge,
  IconPulse,
  IconLock,
  IconDatabase,
} from '@/components/icons'

interface KeyDetailModalProps {
  keyItem: KeyAnalyticsItem | null
  onClose: () => void
}

export function KeyDetailModal({ keyItem, onClose }: KeyDetailModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!keyItem) return null

  const isCooldown = keyItem.status === 'cooldown'
  const timeLabels = keyItem.hourlyTrend.map((t) => t.time)
  const successSeries = keyItem.hourlyTrend.map((t) => t.success)
  const errors429Series = keyItem.hourlyTrend.map((t) => t.errors)
  const tokensSeries = keyItem.hourlyTrend.map((t) => t.tokens)

  // Opsi ApexChart 1: Permintaan vs 429 TooManyRequests
  const requestsChartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      stacked: true,
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    colors: ['#10b981', '#ef4444'],
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '55%',
      },
    },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    xaxis: {
      categories: timeLabels,
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
      y: {
        formatter: (val) => `${val.toLocaleString()} panggilan`,
      },
    },
  }

  const requestsSeries = [
    { name: 'Panggilan Berhasil', data: successSeries },
    { name: '429 TooManyRequests', data: errors429Series },
  ]

  // Opsi ApexChart 2: Token Output & Latensi
  const tokensChartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    colors: ['#f59e0b'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 95, 100],
      },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: timeLabels,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
      },
      axisBorder: { color: 'rgba(255,255,255,0.1)' },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
        formatter: (val) => `${Math.round(val / 1000)}k`,
      },
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
      strokeDashArray: 3,
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: (val) => `${val.toLocaleString()} tokens`,
      },
    },
  }

  const tokensChartSeries = [
    { name: 'Volume Token', data: tokensSeries },
  ]

  return (
    <div className="key-modal-overlay" onClick={onClose}>
      <div
        className="key-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-key-title"
      >
        {/* Header Modal */}
        <div className="key-modal-header">
          <div className="key-modal-title-wrap">
            <div className="key-modal-badge-row">
              <span className={`key-status-chip ${isCooldown ? 'cooldown' : 'ready'}`}>
                <span className="dot" />
                {isCooldown ? 'Sedang Cooldown (429)' : 'Kunci Siap & Normal'}
              </span>
              <span className="key-provider-chip mono">{keyItem.providerName}</span>
              <span className="key-model-chip mono">{keyItem.model}</span>
            </div>
            <h2 id="modal-key-title" className="key-modal-title mono">
              {keyItem.envName}
              <span className="key-fingerprint-sub">[{keyItem.fingerprint}]</span>
            </h2>
          </div>

          <button
            type="button"
            className="key-modal-close-btn"
            onClick={onClose}
            aria-label="Tutup jendela modal"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Cooldown Alert Banner jika sedang diistirahatkan */}
        {isCooldown && (
          <div className="key-cooldown-alert">
            <IconAlert size={16} />
            <div>
              <strong>Kunci ini terkena batas kuota (HTTP 429 TooManyRequests)</strong>
              <p>
                Sistem secara otomatis mengistirahatkan kunci ini agar tidak terus gagal. Beban permintaan dialihkan ke
                kunci lain di dalam kolam.
              </p>
            </div>
          </div>
        )}

        {/* Quick KPI Cards Grid */}
        <div className="key-kpi-grid">
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">TOTAL REQUESTS</span>
            <span className="key-kpi-val mono">{keyItem.totalRequests.toLocaleString()}</span>
            <span className="key-kpi-sub">Sepanjang periode pemantauan</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">SUCCESS RATE</span>
            <span className="key-kpi-val mono" style={{ color: keyItem.successRate >= 95 ? '#10b981' : '#f59e0b' }}>
              {keyItem.successRate}%
            </span>
            <span className="key-kpi-sub">{keyItem.successfulRequests.toLocaleString()} berhasil</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">429 TOO MANY REQS</span>
            <span className="key-kpi-val mono" style={{ color: keyItem.error429Count > 0 ? '#ef4444' : '#10b981' }}>
              {keyItem.error429Count}x
            </span>
            <span className="key-kpi-sub">Batas kuota terlampaui</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">TOTAL TOKENS</span>
            <span className="key-kpi-val mono" style={{ color: '#f59e0b' }}>
              {(keyItem.inputTokens + keyItem.outputTokens).toLocaleString()}
            </span>
            <span className="key-kpi-sub">
              In: {keyItem.inputTokens.toLocaleString()} · Out: {keyItem.outputTokens.toLocaleString()}
            </span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">AVG LATENSI</span>
            <span className="key-kpi-val mono">{keyItem.avgLatencyMs}ms</span>
            <span className="key-kpi-sub">Waktu respon rata-rata</span>
          </div>
        </div>

        {/* ApexCharts Grid di dalam Modal */}
        <div className="key-charts-row">
          {/* Grafik 1: Panggilan Sukses vs 429 */}
          <div className="key-chart-box">
            <div className="key-chart-head">
              <span className="key-chart-title mono">GRAFIK PERMINTAAN &amp; 429 ERRORS</span>
              <span className="key-chart-tag mono">ApexCharts · Bar Stacked</span>
            </div>
            <div className="key-chart-body">
              <ApexChartWrapper
                options={requestsChartOptions}
                series={requestsSeries}
                type="bar"
                height={260}
              />
            </div>
          </div>

          {/* Grafik 2: Volume Token per Jam */}
          <div className="key-chart-box">
            <div className="key-chart-head">
              <span className="key-chart-title mono">GRAFIK KONSUMSI TOKEN</span>
              <span className="key-chart-tag mono">ApexCharts · Spline Area</span>
            </div>
            <div className="key-chart-body">
              <ApexChartWrapper
                options={tokensChartOptions}
                series={tokensChartSeries}
                type="area"
                height={260}
              />
            </div>
          </div>
        </div>

        {/* Footer Modal Info */}
        <div className="key-modal-footer mono">
          <span>Indeks Kunci: #{keyItem.index}</span>
          <span>Sidik SHA-256: {keyItem.fingerprint}</span>
          {keyItem.lastUsedAt && (
            <span>Terakhir Dipakai: {new Date(keyItem.lastUsedAt).toLocaleTimeString('id-ID')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
