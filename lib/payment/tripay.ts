/**
 * Klien Tripay (closed payment).
 *
 * Tiga hal saja yang dipakai: daftar kanal pembayaran, membuat transaksi, dan
 * memeriksa tanda tangan callback. Semua panggilan berjalan di server; kunci
 * privat tidak pernah menyentuh peramban.
 *
 * Mode dipilih lewat TRIPAY_MODE. Bawaannya sandbox, bukan produksi: salah
 * konfigurasi yang berujung transaksi uji jauh lebih murah daripada salah
 * konfigurasi yang menagih uang sungguhan.
 *
 * Dokumentasi: https://tripay.co.id/developer
 */

import crypto from 'crypto'
import { fetchWithTimeout } from '@/lib/http/fetch'
import { cache } from '@/lib/cache/redis'

interface TripayConfig {
  apiKey: string
  privateKey: string
  merchantCode: string
  baseUrl: string
  isProduction: boolean
}

export function tripayConfig(): TripayConfig | null {
  const apiKey = process.env.TRIPAY_API_KEY?.trim()
  const privateKey = process.env.TRIPAY_PRIVATE_KEY?.trim()
  const merchantCode = process.env.TRIPAY_MERCHANT_CODE?.trim()
  if (!apiKey || !privateKey || !merchantCode) return null

  const isProduction = process.env.TRIPAY_MODE === 'production'
  return {
    apiKey,
    privateKey,
    merchantCode,
    isProduction,
    baseUrl: isProduction ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox',
  }
}

export function isTripayConfigured(): boolean {
  return tripayConfig() !== null
}

export class TripayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TripayError'
  }
}

function hmac(privateKey: string, payload: string): string {
  return crypto.createHmac('sha256', privateKey).update(payload).digest('hex')
}

async function call<T>(config: TripayConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(`${config.baseUrl}${path}`, {
    label: 'Tripay',
    ...init,
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; data?: T }
    | null

  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new TripayError(payload?.message ?? `Tripay membalas HTTP ${response.status}`)
  }
  return payload.data
}

// ---------------------------------------------------------------------------
// Kanal pembayaran
// ---------------------------------------------------------------------------

export interface PaymentChannel {
  code: string
  name: string
  group: string
  /** Biaya yang ditanggung pembeli, dalam rupiah, untuk nominal tertentu. */
  feeFlat: number
  feePercent: number
  minAmount: number
  maxAmount: number
}

interface RawChannel {
  code: string
  name: string
  group: string
  active: boolean
  fee_customer?: { flat?: number; percent?: number | string }
  minimum_amount?: number
  maximum_amount?: number
}

/**
 * Kanal aktif merchant. Disimpan satu jam: daftarnya hampir tidak pernah
 * berubah, dan halaman Premium tidak boleh menunggu Tripay di tiap kunjungan.
 */
export async function listChannels(): Promise<PaymentChannel[]> {
  const config = tripayConfig()
  if (!config) return []

  const cacheKey = `tripay:channels:${config.isProduction ? 'prod' : 'sandbox'}`
  const cached = await cache.get<PaymentChannel[]>(cacheKey)
  if (cached) return cached

  const raw = await call<RawChannel[]>(config, '/merchant/payment-channel')
  const channels = raw
    .filter((c) => c.active)
    .map((c) => ({
      code: c.code,
      name: c.name,
      group: c.group,
      feeFlat: Number(c.fee_customer?.flat ?? 0),
      feePercent: Number(c.fee_customer?.percent ?? 0),
      minAmount: Number(c.minimum_amount ?? 0),
      maxAmount: Number(c.maximum_amount ?? 0),
    }))

  await cache.set(cacheKey, channels, 3600)
  return channels
}

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export interface CreateTransactionInput {
  method: string
  merchantRef: string
  amount: number
  customerName: string
  customerEmail: string
  itemSku: string
  itemName: string
  returnUrl: string
  callbackUrl: string
  /** Detik sampai tagihan kedaluwarsa. */
  expiresInSeconds: number
}

export interface CreatedTransaction {
  reference: string
  checkoutUrl: string
  status: string
  expiredAt: number
}

export async function createTransaction(input: CreateTransactionInput): Promise<CreatedTransaction> {
  const config = tripayConfig()
  if (!config) throw new TripayError('Tripay belum dikonfigurasi.')

  const body = {
    method: input.method,
    merchant_ref: input.merchantRef,
    amount: input.amount,
    customer_name: input.customerName.slice(0, 100),
    customer_email: input.customerEmail,
    order_items: [
      { sku: input.itemSku, name: input.itemName, price: input.amount, quantity: 1 },
    ],
    return_url: input.returnUrl,
    callback_url: input.callbackUrl,
    expired_time: Math.floor(Date.now() / 1000) + input.expiresInSeconds,
    signature: hmac(config.privateKey, `${config.merchantCode}${input.merchantRef}${input.amount}`),
  }

  const data = await call<{
    reference: string
    checkout_url: string
    status: string
    expired_time: number
  }>(config, '/transaction/create', { method: 'POST', body: JSON.stringify(body) })

  return {
    reference: data.reference,
    checkoutUrl: data.checkout_url,
    status: data.status,
    expiredAt: data.expired_time,
  }
}

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

/**
 * Periksa tanda tangan callback terhadap badan MENTAH.
 *
 * Harus badan mentah, bukan hasil JSON.parse lalu stringify ulang: urutan kunci
 * dan spasi yang berubah sedikit saja membuat HMAC-nya berbeda, dan callback
 * sah akan ditolak.
 */
export function verifyCallbackSignature(rawBody: string, signature: string | null): boolean {
  const config = tripayConfig()
  if (!config || !signature) return false

  const expected = Buffer.from(hmac(config.privateKey, rawBody), 'hex')
  const given = Buffer.from(signature.trim(), 'hex')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export type TripayStatus = 'UNPAID' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND'

export interface TripayCallback {
  reference: string
  merchant_ref: string
  status: TripayStatus
  total_amount: number
  amount_received?: number
  payment_method?: string
  payment_method_code?: string
  paid_at?: number | null
}
