import type { ApexOptions } from 'apexcharts'

/** Warna berurutan untuk deret per kunci / per model. Urutan tetap supaya warna tidak melompat saat data diperbarui. */
export const SERIES_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ec4899', '#3b82f6', '#64748b']

export const COLOR_SUCCESS = '#10b981'
export const COLOR_429 = '#ef4444'
export const COLOR_OTHER_ERR = '#64748b'
export const COLOR_INPUT = '#8b5cf6'
export const COLOR_OUTPUT = '#f59e0b'
export const COLOR_LATENCY = '#06b6d4'

const AXIS_LABEL = { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }

export function compact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return `${Math.round(v)}`
}

/**
 * Kerangka tema gelap yang sama untuk semua grafik di halaman ini. Opsi khusus
 * tiap grafik ditimpakan di atasnya secara dangkal per bagian.
 */
export function chartOptions(
  type: 'area' | 'bar' | 'line',
  categories: string[],
  overrides: ApexOptions & { yFormatter?: (v: number) => string; unit?: string } = {},
): ApexOptions {
  const { yFormatter = compact, unit = '', chart, ...rest } = overrides
  return {
    chart: {
      type,
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
      zoom: { enabled: false },
      animations: { enabled: true, speed: 350 },
      ...chart,
    },
    theme: { mode: 'dark' },
    dataLabels: { enabled: false },
    stroke: type === 'bar' ? { width: 0 } : { curve: 'smooth', width: 2 },
    // Kunci ditambahkan hanya bila ada isinya. `plotOptions: undefined` menimpa
    // bawaan ApexCharts, lalu v7 membaca `config.plotOptions.line` dan seluruh
    // halaman runtuh dengan "Cannot read properties of undefined (reading 'line')".
    ...(type === 'area' && {
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.04, stops: [0, 90, 100] } },
    }),
    ...(type === 'bar' && { plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } } }),
    xaxis: {
      categories,
      tickAmount: Math.min(categories.length, 12),
      labels: { style: AXIS_LABEL, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { color: 'rgba(255,255,255,0.1)' },
      axisTicks: { color: 'rgba(255,255,255,0.1)' },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: { style: AXIS_LABEL, formatter: (v: number) => yFormatter(v) },
    },
    grid: { borderColor: 'rgba(255, 255, 255, 0.07)', strokeDashArray: 3 },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#cbd5e1' },
      fontSize: '12px',
    },
    tooltip: {
      theme: 'dark',
      // v7 melempar galat bila `shared` hidup tanpa `intersect` dimatikan tegas.
      shared: true,
      intersect: false,
      y: {
        formatter: (v: number | null) => (v == null ? '—' : `${v.toLocaleString('id-ID')}${unit}`),
      },
    },
    noData: { text: 'Belum ada data', style: { color: '#64748b', fontSize: '12px' } },
    ...rest,
  }
}

/** Grafik mini untuk kartu penyedia: tanpa sumbu, tanpa legenda. */
export function sparklineOptions(color: string): ApexOptions {
  return {
    chart: { type: 'area', sparkline: { enabled: true }, animations: { enabled: false } },
    colors: [color],
    stroke: { curve: 'smooth', width: 1.5 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } },
    tooltip: { enabled: false },
  }
}
