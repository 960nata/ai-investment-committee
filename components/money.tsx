'use client'

import React from 'react'
import { useCurrency } from './currency-provider'
import type { MajorCurrencyCode } from '@/lib/forex/types'

interface MoneyProps {
  value: number | null | undefined
  /** Mata uang asal data (misal: 'IDR', 'USD', 'USDT', dll.) */
  from?: string
  /** Opsional: paksa konversi ke mata uang tertentu alih-alih mata uang aktif */
  to?: MajorCurrencyCode
  className?: string
  /** Tampilkan tooltip harga asal saat kursor diarahkan */
  showTooltip?: boolean
}

/**
 * Komponen Pemformat Uang Realtime.
 *
 * Menyesuaikan mata uang otomatis mengikuti bahasa pengguna atau perintah terminal.
 * Mengonversi nilai secara instan tanpa perlu memuat ulang halaman.
 */
export function Money({
  value,
  from = 'USD',
  to,
  className,
  showTooltip = true,
}: MoneyProps) {
  const { format, activeCurrency } = useCurrency()

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={className}>—</span>
  }

  // Normalisasi USDT -> USD
  const fromNormalized = from.toUpperCase() === 'USDT' ? 'USD' : from

  const formatted = format(value, fromNormalized, to)
  const targetCode = to ?? activeCurrency

  // Keterangan harga asal jika mata uang target berbeda dari asalnya
  const isConverted = fromNormalized.toUpperCase() !== targetCode.toUpperCase()
  const title =
    showTooltip && isConverted
      ? `Asal: ${value.toLocaleString()} ${fromNormalized}`
      : undefined

  return (
    <span className={className} title={title}>
      {formatted}
    </span>
  )
}
