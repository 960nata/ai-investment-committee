'use client'

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import {
  type MajorCurrencyCode,
  MAJOR_CURRENCIES,
  MAJOR_CURRENCY_CODES,
  LOCALE_DEFAULT_CURRENCY,
  isMajorCurrency,
} from '@/lib/forex/types'
import { convertCurrency, formatCurrencyAmount } from '@/lib/forex/rates'
import { LOCALE_EVENT, readPreference } from '@/lib/i18n/preference'
import type { Locale } from '@/lib/i18n/locales'

interface CurrencyContextValue {
  activeCurrency: MajorCurrencyCode
  rates: Record<MajorCurrencyCode, number>
  updatedAt: number
  source: string
  setCurrency: (code: MajorCurrencyCode) => void
  convert: (amount: number | null, fromCurrency: string, overrideTarget?: MajorCurrencyCode) => number | null
  format: (amount: number | null, fromCurrency: string, overrideTarget?: MajorCurrencyCode) => string
  currencies: typeof MAJOR_CURRENCIES
}

const DEFAULT_RATES: Record<MajorCurrencyCode, number> = {
  USD: 1.0,
  IDR: 17883.0,
  EUR: 0.889,
  GBP: 0.756,
  JPY: 157.8,
  CNY: 6.714,
  SGD: 1.279,
  AUD: 1.439,
  CAD: 1.424,
  CHF: 0.829,
  SAR: 3.75,
  RUB: 83.5,
}

const CurrencyContext = createContext<CurrencyContextValue>({
  activeCurrency: 'IDR',
  rates: DEFAULT_RATES,
  updatedAt: Date.now(),
  source: 'init',
  setCurrency: () => {},
  convert: () => null,
  format: () => '—',
  currencies: MAJOR_CURRENCIES,
})

const STORAGE_KEY = 'komite_user_currency'

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [activeCurrency, setActiveCurrencyState] = useState<MajorCurrencyCode>('IDR')
  const [rates, setRates] = useState<Record<MajorCurrencyCode, number>>(DEFAULT_RATES)
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now())
  const [source, setSource] = useState<string>('init')
  const [userOverridden, setUserOverridden] = useState<boolean>(false)

  // 1. Inisialisasi mata uang sesuai preferensi bahasa awal atau pilihan tersimpan
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && isMajorCurrency(saved)) {
        setActiveCurrencyState(saved)
        setUserOverridden(true)
        return
      }
    } catch {
      // Abaikan jika localStorage diblokir
    }

    const currentLocale = readPreference()
    const mapped = LOCALE_DEFAULT_CURRENCY[currentLocale] || 'IDR'
    setActiveCurrencyState(mapped)
  }, [])

  // 2. Dengarkan perubahan bahasa di header (LOCALE_EVENT)
  // Jika pengguna belum mengunci mata uang secara eksplisit, sesuaikan kurs dengan bahasa yang dipilih
  useEffect(() => {
    const onLocaleChange = (e: Event) => {
      const newLocale = (e as CustomEvent<Locale>).detail
      if (!userOverridden) {
        const mapped = LOCALE_DEFAULT_CURRENCY[newLocale] || 'IDR'
        setActiveCurrencyState(mapped)
      }
    }

    window.addEventListener(LOCALE_EVENT, onLocaleChange)
    return () => window.removeEventListener(LOCALE_EVENT, onLocaleChange)
  }, [userOverridden])

  // 3. Sambungkan ke Realtime SSE Stream (/api/v1/forex/stream)
  // Perubahan di terminal (npx tsx scripts/kurs.ts set / sync / currency) langsung tersiar ke sini!
  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: NodeJS.Timeout | null = null

    function connect() {
      try {
        es = new EventSource('/api/v1/forex/stream')

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data && data.rates) {
              setRates(data.rates)
              if (data.updatedAt) setUpdatedAt(data.updatedAt)
              if (data.source) setSource(data.source)

              // Jika terminal mengubah mata uang aktif global, update state
              if (data.activeCurrency && isMajorCurrency(data.activeCurrency)) {
                setActiveCurrencyState(data.activeCurrency)
              }
            }
          } catch {
            // Abaikan heartbeat atau pesan non-JSON
          }
        }

        es.onerror = () => {
          if (es) {
            es.close()
            es = null
          }
          // Coba sambung ulang setelah 5 detik
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              connect()
            }, 5000)
          }
        }
      } catch {
        // Fallback jika EventSource tidak didukung
      }
    }

    connect()

    return () => {
      if (es) es.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [])

  const setCurrency = useCallback((code: MajorCurrencyCode) => {
    setActiveCurrencyState(code)
    setUserOverridden(true)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {}
  }, [])

  const convert = useCallback(
    (amount: number | null, fromCurrency: string, overrideTarget?: MajorCurrencyCode): number | null => {
      const target = overrideTarget ?? activeCurrency
      return convertCurrency(amount, fromCurrency, target, rates)
    },
    [activeCurrency, rates],
  )

  const format = useCallback(
    (amount: number | null, fromCurrency: string, overrideTarget?: MajorCurrencyCode): string => {
      const target = overrideTarget ?? activeCurrency
      const converted = convert(amount, fromCurrency, target)
      if (converted === null) return '—'
      const meta = MAJOR_CURRENCIES[target]
      return formatCurrencyAmount(converted, target, meta?.locale)
    },
    [activeCurrency, convert],
  )

  const value = useMemo(
    () => ({
      activeCurrency,
      rates,
      updatedAt,
      source,
      setCurrency,
      convert,
      format,
      currencies: MAJOR_CURRENCIES,
    }),
    [activeCurrency, rates, updatedAt, source, setCurrency, convert, format],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
