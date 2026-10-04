/**
 * Definisi mata uang utama dunia dan konfigurasi kurs real.
 *
 * Hanya melacak mata uang resmi utama dunia untuk menjaga konsistensi,
 * akurasi data riil (tanpa angka palsu/dummy), dan kinerja sistem.
 */

import type { Locale } from '@/lib/i18n/locales'

export const MAJOR_CURRENCY_CODES = [
  'IDR', // Rupiah Indonesia
  'USD', // US Dollar
  'EUR', // Euro
  'GBP', // British Pound Sterling
  'JPY', // Japanese Yen
  'CNY', // Chinese Yuan Renminbi
  'SGD', // Singapore Dollar
  'AUD', // Australian Dollar
  'CAD', // Canadian Dollar
  'CHF', // Swiss Franc
  'SAR', // Saudi Riyal
  'RUB', // Russian Ruble
] as const

export type MajorCurrencyCode = (typeof MAJOR_CURRENCY_CODES)[number]

export interface CurrencyMeta {
  code: MajorCurrencyCode
  name: string
  nativeName: string
  symbol: string
  locale: string
  defaultDecimals: number
  flagRegion: string
}

export const MAJOR_CURRENCIES: Record<MajorCurrencyCode, CurrencyMeta> = {
  IDR: {
    code: 'IDR',
    name: 'Rupiah Indonesia',
    nativeName: 'Rupiah',
    symbol: 'Rp',
    locale: 'id-ID',
    defaultDecimals: 0,
    flagRegion: 'Indonesia',
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    nativeName: 'US Dollar',
    symbol: '$',
    locale: 'en-US',
    defaultDecimals: 2,
    flagRegion: 'Amerika Serikat',
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    nativeName: 'Euro',
    symbol: '€',
    locale: 'de-DE',
    defaultDecimals: 2,
    flagRegion: 'Zona Euro',
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    nativeName: 'Pound Sterling',
    symbol: '£',
    locale: 'en-GB',
    defaultDecimals: 2,
    flagRegion: 'Inggris',
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    nativeName: '日本円',
    symbol: '¥',
    locale: 'ja-JP',
    defaultDecimals: 0,
    flagRegion: 'Jepang',
  },
  CNY: {
    code: 'CNY',
    name: 'Chinese Yuan',
    nativeName: '人民币',
    symbol: '¥',
    locale: 'zh-CN',
    defaultDecimals: 2,
    flagRegion: 'China',
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    nativeName: 'Singapore Dollar',
    symbol: 'S$',
    locale: 'en-SG',
    defaultDecimals: 2,
    flagRegion: 'Singapura',
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    nativeName: 'Australian Dollar',
    symbol: 'A$',
    locale: 'en-AU',
    defaultDecimals: 2,
    flagRegion: 'Australia',
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    nativeName: 'Canadian Dollar',
    symbol: 'C$',
    locale: 'en-CA',
    defaultDecimals: 2,
    flagRegion: 'Kanada',
  },
  CHF: {
    code: 'CHF',
    name: 'Swiss Franc',
    nativeName: 'Schweizer Franken',
    symbol: 'CHF',
    locale: 'de-CH',
    defaultDecimals: 2,
    flagRegion: 'Swiss',
  },
  SAR: {
    code: 'SAR',
    name: 'Saudi Riyal',
    nativeName: 'ريال سعودي',
    symbol: 'SAR',
    locale: 'ar-SA',
    defaultDecimals: 2,
    flagRegion: 'Arab Saudi',
  },
  RUB: {
    code: 'RUB',
    name: 'Russian Ruble',
    nativeName: 'Российский рубль',
    symbol: '₽',
    locale: 'ru-RU',
    defaultDecimals: 2,
    flagRegion: 'Rusia',
  },
}

/**
 * Pemetaan bawaan bahasa situs ke mata uang acuan utama:
 * id -> IDR, en -> USD, zh -> CNY, ja -> JPY, ru -> RUB
 */
export const LOCALE_DEFAULT_CURRENCY: Record<Locale, MajorCurrencyCode> = {
  id: 'IDR',
  en: 'USD',
  zh: 'CNY',
  ja: 'JPY',
  ru: 'RUB',
}

export interface ForexState {
  base: 'USD'
  activeCurrency: MajorCurrencyCode
  updatedAt: number
  source: 'open.er-api.com' | 'yahoo' | 'terminal_override' | 'cache'
  rates: Record<MajorCurrencyCode, number>
  /** Kurs diatur manual dari terminal; sinkronisasi otomatis tidak menimpanya. */
  locked?: boolean
}

export function isMajorCurrency(code: string): code is MajorCurrencyCode {
  return (MAJOR_CURRENCY_CODES as readonly string[]).includes(code.toUpperCase())
}
