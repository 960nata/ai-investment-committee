'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AiTokensDashboardData, UsageSeries } from '@/lib/ai/telemetry'
import { ApexChartWrapper } from './apex-chart-wrapper'
import {
  chartOptions,
  COLOR_429,
  COLOR_OTHER_ERR,
  COLOR_SUCCESS,
  SERIES_COLORS,
} from './chart-options'
import { IconClose, IconAlert } from '@/components/icons'

/** Berapa kunci teratas yang digambar sebagai garis sendiri; sisanya digabung. */
const TOP_KEYS = 5

interface UsageDetailModalProps {
  data: AiTokensDashboardData
  providerId: string
  /** Buka langsung dengan satu kunci terpilih (dari tombol di tabel kunci). */
  initialKeyId?: string
  rangeLabel: string
  onClose: () => void
}

type Line = { name: string; data: (number | null)[] }

function formatNumber(v: number | null | undefined, suffix = ''): string {
  return v == null ? '—' : `${v.toLocaleString('id-ID')}${suffix}`
}

/**
 * Popup analisis satu penyedia, meniru panel pemakaian Google AI Studio:
 * permintaan per kunci, success rate, galat 429, dan token per model — untuk
 * semua kunci penyedia itu atau satu kunci yang dipilih.
 */
export function UsageDetailModal({ data, providerId, initialKeyId, rangeLabel, onClose }: UsageDetailModalProps) {
  const [keyId, setKeyId] = useState<string>(initialKeyId ?? 'all')

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const provider = data.providers.find((p) => p.id === providerId)
  const providerKeys = useMemo(
    () =>
      data.keys
        .filter((k) => k.providerId === providerId)
        .sort((a, b) => b.totals.requests - a.totals.requests || a.index - b.index),
    [data.keys, providerId],
  )
  const selectedKey = providerKeys.find((k) => k.id === keyId)

  const scope = selectedKey ?? provider
  const modelUsage = useMemo(
    () => (selectedKey ? selectedKey.byModel : data.models.filter((m) => m.providerId === providerId)),
    [selectedKey, data.models, providerId],
  )

  // Garis "Total API Requests": satu garis per kunci teratas, sisanya digabung.
  const requestLines = useMemo<Line[]>(() => {
    if (!scope) return []
    if (selectedKey) return [{ name: selectedKey.envName, data: selectedKey.series.requests }]

    const active = providerKeys.filter((k) => k.totals.requests > 0)
    if (active.length === 0) return [{ name: 'Semua kunci', data: scope.series.requests }]

    const top = active.slice(0, TOP_KEYS)
    const rest = active.slice(TOP_KEYS)
    const lines: Line[] = top.map((k) => ({ name: k.envName, data: k.series.requests }))
    if (rest.length > 0) {
      lines.push({
        name: `Kunci lain (${rest.length})`,
        data: data.categories.map((_, i) => rest.reduce((a, k) => a + k.series.requests[i], 0)),
      })
    }
    return lines
  }, [scope, selectedKey, providerKeys, data.categories])

  if (!provider || !scope) return null

  const series: UsageSeries = scope.series
  const totals = scope.totals
  const cats = data.categories
  const perModel = (pick: (s: UsageSeries) => number[]): Line[] =>
    modelUsage.length > 0
      ? modelUsage.map((m) => ({ name: m.model, data: pick(m.series) }))
      : [{ name: provider.model, data: pick(series) }]

  const charts: {
    title: string
    type: 'area' | 'bar' | 'line'
    series: Line[]
    options: ReturnType<typeof chartOptions>
  }[] = [
    {
      title: 'TOTAL API REQUESTS',
      type: 'line',
      series: requestLines,
      options: chartOptions('line', cats, { colors: SERIES_COLORS, unit: ' req' }),
    },
    {
      title: 'SUCCESS RATE',
      type: 'area',
      series: [{ name: 'Success rate', data: series.successRate }],
      options: chartOptions('area', cats, {
        colors: [COLOR_SUCCESS],
        unit: '%',
        yaxis: { min: 0, max: 100, tickAmount: 4, labels: { style: { colors: '#94a3b8', fontSize: '11px' }, formatter: (v) => `${Math.round(v)}%` } },
      }),
    },
    {
      title: 'TOTAL API ERRORS',
      type: 'bar',
      series: [
        { name: '429 TooManyRequests', data: series.rateLimited },
        { name: 'Galat lain', data: series.otherErrors },
      ],
      options: chartOptions('bar', cats, {
        colors: [COLOR_429, COLOR_OTHER_ERR],
        chart: { stacked: true },
        unit: ' galat',
      }),
    },
    {
      title: 'REQUESTS PER MODEL',
      type: 'bar',
      series: perModel((s) => s.requests),
      options: chartOptions('bar', cats, { colors: SERIES_COLORS, chart: { stacked: true }, unit: ' req' }),
    },
    {
      title: 'INPUT TOKENS PER MODEL',
      type: 'line',
      series: perModel((s) => s.inputTokens),
      options: chartOptions('line', cats, { colors: SERIES_COLORS.slice(2), unit: ' token' }),
    },
    {
      title: 'OUTPUT TOKENS PER MODEL',
      type: 'line',
      series: perModel((s) => s.outputTokens),
      options: chartOptions('line', cats, { colors: SERIES_COLORS, unit: ' token' }),
    },
  ]

  const errorsTotal = totals.rateLimited + totals.otherErrors

  return (
    <div className="key-modal-overlay" onClick={onClose}>
      <div
        className="key-modal-dialog wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-modal-title"
      >
        <div className="key-modal-header">
          <div className="key-modal-title-wrap">
            <div className="key-modal-badge-row">
              {selectedKey ? (
                <span className={`key-status-chip ${selectedKey.status === 'ready' ? 'ready' : 'cooldown'}`}>
                  <span className="dot" />
                  {selectedKey.status === 'ready'
                    ? 'Kunci siap'
                    : selectedKey.status === 'cooldown'
                      ? 'Sedang cooldown'
                      : 'Sudah dicabut dari env'}
                </span>
              ) : (
                <span className={`key-status-chip ${provider.coolingKeys > 0 ? 'cooldown' : 'ready'}`}>
                  <span className="dot" />
                  {provider.availableKeys}/{provider.totalKeys} kunci siap
                </span>
              )}
              <span className="key-model-chip mono">{provider.model}</span>
              <span className="key-provider-chip mono">{rangeLabel}</span>
            </div>
            <h2 id="usage-modal-title" className="key-modal-title mono">
              {provider.name}
              {selectedKey && <span className="key-fingerprint-sub">{selectedKey.envName} [{selectedKey.fingerprint}]</span>}
            </h2>
          </div>

          <button type="button" className="key-modal-close-btn" onClick={onClose} aria-label="Tutup jendela">
            <IconClose size={18} />
          </button>
        </div>

        <div className="usage-modal-filters mono">
          <label htmlFor="usage-key-select">API Key</label>
          <select
            id="usage-key-select"
            className="usage-key-select mono"
            value={selectedKey ? selectedKey.id : 'all'}
            onChange={(e) => setKeyId(e.target.value)}
          >
            <option value="all">Semua kunci {provider.name} ({providerKeys.length})</option>
            {providerKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.envName} [{k.fingerprint}] · {k.totals.requests.toLocaleString('id-ID')} req
              </option>
            ))}
          </select>
        </div>

        {selectedKey?.status === 'cooldown' && (
          <div className="key-cooldown-alert">
            <IconAlert size={16} />
            <div>
              <strong>Kunci ini sedang diistirahatkan</strong>
              <p>Terakhir kena 429 atau ditolak autentikasinya. Permintaan dialihkan ke kunci lain di kolam.</p>
            </div>
          </div>
        )}

        {totals.requests === 0 && (
          <div className="usage-empty-note">
            Belum ada panggilan tercatat untuk {selectedKey ? 'kunci ini' : provider.name} dalam {rangeLabel.toLowerCase()}.
          </div>
        )}

        <div className="key-kpi-grid">
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">TOTAL REQUESTS</span>
            <span className="key-kpi-val mono">{formatNumber(totals.requests)}</span>
            <span className="key-kpi-sub">{formatNumber(totals.success)} berhasil</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">SUCCESS RATE</span>
            <span
              className="key-kpi-val mono"
              style={{ color: totals.successRate == null ? undefined : totals.successRate >= 95 ? COLOR_SUCCESS : '#f59e0b' }}
            >
              {formatNumber(totals.successRate, '%')}
            </span>
            <span className="key-kpi-sub">dari seluruh percobaan</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">API ERRORS</span>
            <span className="key-kpi-val mono" style={{ color: errorsTotal > 0 ? COLOR_429 : undefined }}>
              {formatNumber(errorsTotal)}
            </span>
            <span className="key-kpi-sub">429: {formatNumber(totals.rateLimited)} · lain: {formatNumber(totals.otherErrors)}</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">INPUT TOKENS</span>
            <span className="key-kpi-val mono" style={{ color: '#8b5cf6' }}>{formatNumber(totals.inputTokens)}</span>
            <span className="key-kpi-sub">prompt masuk</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">OUTPUT TOKENS</span>
            <span className="key-kpi-val mono" style={{ color: '#f59e0b' }}>{formatNumber(totals.outputTokens)}</span>
            <span className="key-kpi-sub">hasil generasi</span>
          </div>
          <div className="key-kpi-card">
            <span className="key-kpi-label mono">AVG LATENSI</span>
            <span className="key-kpi-val mono">{formatNumber(totals.avgLatencyMs, ' ms')}</span>
            <span className="key-kpi-sub">panggilan sukses</span>
          </div>
        </div>

        <div className="key-charts-row">
          {charts.map((c) => (
            <div className="key-chart-box" key={c.title}>
              <div className="key-chart-head">
                <span className="key-chart-title mono">{c.title}</span>
              </div>
              <div className="key-chart-body">
                <ApexChartWrapper options={c.options} series={c.series} type={c.type} height={240} />
              </div>
            </div>
          ))}
        </div>

        {selectedKey && (
          <div className="key-modal-footer mono">
            <span>{selectedKey.index >= 0 ? `Indeks kolam: #${selectedKey.index}` : 'Tidak lagi di kolam'}</span>
            <span>Sidik SHA-256: {selectedKey.fingerprint}</span>
            <span>
              Terakhir dipakai:{' '}
              {selectedKey.lastUsedAt
                ? new Date(selectedKey.lastUsedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
                : 'belum pernah'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
