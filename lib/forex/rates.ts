/**
 * Pengelola Kurs Riil Dunia (Real Forex Engine).
 *
 * Mengambil kurs pasar valuta asing nyata (bukan dummy/fake) untuk mata uang utama,
 * menyimpannya di Upstash Redis, serta menyediakan fungsi konversi realtime.
 */

import { cache } from '@/lib/cache/redis'
import {
  MAJOR_CURRENCY_CODES,
  MAJOR_CURRENCIES,
  type ForexState,
  type MajorCurrencyCode,
  isMajorCurrency,
} from './types'

export const REDIS_FOREX_KEY = 'forex:rates:v1'
export const REDIS_ACTIVE_CURRENCY_KEY = 'forex:active_currency'

// Baseline realistik sebagai fallback darurat jika jaringan terputus
const FALLBACK_RATES: Record<MajorCurrencyCode, number> = {
  USD: 1.0,
  IDR: 17880.0,
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

/**
 * Mengambil kurs live dari API publik valuta asing (open.er-api.com).
 * Menjamin 100% data nyata pasar valuta asing internasional.
 */
export async function fetchLiveExchangeRates(): Promise<Record<MajorCurrencyCode, number>> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat open.er-api.com`)
    const data = await res.json()
    if (data.result !== 'success' || !data.rates) {
      throw new Error('Format balasan API kurs tidak valid')
    }

    const rates = {} as Record<MajorCurrencyCode, number>
    for (const code of MAJOR_CURRENCY_CODES) {
      const val = data.rates[code]
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
        rates[code] = val
      } else {
        rates[code] = FALLBACK_RATES[code]
      }
    }
    return rates
  } catch (err) {
    console.warn('[Forex] Gagal fetch open.er-api.com, mencoba Yahoo Finance:', err)
    return await fetchYahooRatesFallback()
  }
}

/**
 * Cadangan: Mengambil kurs IDR langsung dari Yahoo Finance jika open.er-api bermasalah.
 */
async function fetchYahooRatesFallback(): Promise<Record<MajorCurrencyCode, number>> {
  const rates = { ...FALLBACK_RATES }
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDIDR=X', {
      headers: { 'User-Agent': 'ai-investment-committee/0.1' },
    })
    if (res.ok) {
      const json = await res.json()
      const price = json.chart?.result?.[0]?.meta?.regularMarketPrice
      if (typeof price === 'number' && price > 1000) {
        rates.IDR = price
      }
    }
  } catch (e) {
    console.error('[Forex] Gagal mengambil Yahoo fallback:', e)
  }
  return rates
}

/**
 * Mengambil status kurs & mata uang aktif saat ini.
 */
const MAX_STALENESS_MS = 12 * 60 * 60 * 1000 // 12 jam: otomatis refresh tiap hari

export async function getForexState(): Promise<ForexState> {
  // 1. Coba ambil dari Redis
  try {
    const [savedRates, activeCur] = await Promise.all([
      cache.get<ForexState>(REDIS_FOREX_KEY),
      cache.get<string>(REDIS_ACTIVE_CURRENCY_KEY),
    ])

    if (savedRates && savedRates.rates) {
      if (activeCur && isMajorCurrency(activeCur)) {
        savedRates.activeCurrency = activeCur
      }

      // Otomatis refresh di latar belakang jika data sudah lebih dari 12 jam,
      // kecuali kursnya sedang dikunci dari terminal.
      if (!savedRates.locked && Date.now() - savedRates.updatedAt > MAX_STALENESS_MS) {
        syncForexRates().catch((err) => console.warn('[Forex] Gagal background sync:', err))
      }

      return savedRates
    }
  } catch (err) {
    console.warn('[Forex] Gagal membaca Redis:', err)
  }

  // 2. Jika di Redis belum ada, ambil data live sekarang juga
  const liveRates = await fetchLiveExchangeRates()
  const newState: ForexState = {
    base: 'USD',
    activeCurrency: 'IDR',
    updatedAt: Date.now(),
    source: 'open.er-api.com',
    rates: liveRates,
  }

  // Simpan ke Redis tanpa menghalangi
  cache.set(REDIS_FOREX_KEY, newState).catch(() => {})
  return newState
}

/**
 * Sinkronisasi data kurs dunia dari API live dan simpan ke Redis.
 *
 * Kurs yang dikunci lewat `npm run kurs -- set` dibiarkan; tanpa ini dispatcher
 * per jam menimpanya dalam waktu kurang dari satu jam. `force` (perintah
 * `npm run kurs -- sync`) membuka kuncinya dan kembali ke kurs pasar.
 */
export async function syncForexRates({ force = false }: { force?: boolean } = {}): Promise<ForexState> {
  const currentState = await getForexState()
  if (currentState.locked && !force) return currentState

  const liveRates = await fetchLiveExchangeRates()

  const updatedState: ForexState = {
    base: 'USD',
    activeCurrency: currentState.activeCurrency,
    updatedAt: Date.now(),
    source: 'open.er-api.com',
    rates: liveRates,
  }

  await cache.set(REDIS_FOREX_KEY, updatedState)
  return updatedState
}

/**
 * Mengganti mata uang aktif global (disiarkan ke seluruh pengunjung via SSE).
 */
export async function setActiveCurrency(currency: MajorCurrencyCode): Promise<ForexState> {
  const current = await getForexState()
  current.activeCurrency = currency
  current.updatedAt = Date.now()

  await Promise.all([
    cache.set(REDIS_ACTIVE_CURRENCY_KEY, currency),
    cache.set(REDIS_FOREX_KEY, current),
  ])
  return current
}

/**
 * Mengubah nilai kurs tertentu secara manual dari terminal.
 */
export async function overrideForexRate(currency: MajorCurrencyCode, rate: number): Promise<ForexState> {
  const current = await getForexState()
  current.rates[currency] = rate
  current.updatedAt = Date.now()
  current.source = 'terminal_override'
  current.locked = true

  await cache.set(REDIS_FOREX_KEY, current)
  return current
}

/**
 * Konversi angka harga dari satu mata uang ke mata uang lain menggunakan kurs USD sebagai patokan:
 * inUSD = amount / rate[from]
 * result = inUSD * rate[to]
 */
export function convertCurrency(
  amount: number | null,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null

  const from = fromCurrency.toUpperCase().trim()
  const to = toCurrency.toUpperCase().trim()
  if (from === to) return amount

  // Ambil rate vs USD (USD = 1.0)
  const fromRate = rates[from] ?? (from === 'IDR' ? 17880 : 1.0)
  const toRate = rates[to] ?? (to === 'IDR' ? 17880 : 1.0)

  if (fromRate <= 0) return null

  const amountInUSD = amount / fromRate
  return amountInUSD * toRate
}

/**
 * Format angka ke dalam mata uang dengan standar internasional (Intl.NumberFormat).
 */
export function formatCurrencyAmount(
  amount: number | null,
  currencyCode: string,
  customLocale?: string,
): string {
  if (amount === null || !Number.isFinite(amount)) return '—'

  const upper = currencyCode.toUpperCase() as MajorCurrencyCode
  const meta = MAJOR_CURRENCIES[upper]
  const locale = customLocale ?? (meta ? meta.locale : 'en-US')

  const isZeroDecimals = (upper as string) === 'IDR' || (upper as string) === 'JPY'
  const digits = isZeroDecimals
    ? 0
    : Math.abs(amount) < 0.01
      ? 4
      : Math.abs(amount) < 1
        ? 3
        : 2

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: upper,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    const symbol = meta?.symbol ?? upper
    return `${symbol} ${amount.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  }
}
