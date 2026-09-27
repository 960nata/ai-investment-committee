'use client'

import dynamic from 'next/dynamic'
import type { Props as ApexChartProps } from 'react-apexcharts'

interface ChartWrapperProps extends ApexChartProps {
  height?: number | string
}

/**
 * Dynamic import untuk ApexCharts agar tidak dievaluasi pada sisi server (SSR).
 */
const DynamicApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        minHeight: '280px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.4)',
        borderRadius: '8px',
        border: '1px dashed rgba(255, 255, 255, 0.1)',
        gap: '8px',
      }}
    >
      <div
        className="badge-live-pulse"
        style={{ width: '8px', height: '8px', background: 'var(--accent, #f59e0b)' }}
      />
      <span className="mono" style={{ color: 'var(--ink-faint, #94a3b8)', fontSize: '11px' }}>
        Memuat grafik ApexCharts...
      </span>
    </div>
  ),
})

export function ApexChartWrapper(props: ChartWrapperProps) {
  return <DynamicApexChart {...props} />
}
