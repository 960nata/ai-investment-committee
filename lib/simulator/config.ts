/**
 * Simulator trading: mode, modal awal, dan batas-batas yang dipakai bersama
 * oleh API, desk AI, dan antarmuka.
 *
 * Empat mode sengaja dipisah total — tiap mode punya dompet $1.000 sendiri.
 * Binary option yang kalah sepuluh kali berturut-turut tidak boleh menggerus
 * modal simulasi investasi tahunan; menggabungkannya membuat hasil tiap gaya
 * trading mustahil dibaca.
 */

import { z } from 'zod'

export const SIM_MODES = ['binary', 'harian', 'bulanan', 'tahunan'] as const
export type SimMode = (typeof SIM_MODES)[number]

export const STARTING_BALANCE_USD = 1_000

/** Pembayaran binary bila tebakan arah benar: stake kembali + 85%. */
export const BINARY_PAYOUT = 0.85

/** Pilihan kedaluwarsa binary, dalam detik. */
export const BINARY_EXPIRIES = [60, 300, 600, 900, 1800, 3600] as const

/**
 * Binary hanya untuk kripto. Pasar kripto buka 24 jam dan Binance memberi
 * candle 1 menit gratis, jadi harga pada detik kedaluwarsa bisa diperiksa
 * ulang dengan jujur. Saham lewat Yahoo hanya punya candle 15 menit — opsi
 * 1 menit di atas data itu adalah tebakan, bukan penyelesaian.
 */
export const BINARY_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
] as const

export interface ModeInfo {
  id: SimMode
  label: string
  short: string
  /** Lama maksimum posisi dibiarkan terbuka sebelum ditutup otomatis. */
  horizonDays: number | null
  /** Skor sistem yang dibaca desk untuk mode ini. */
  scoreHorizon: 'pendek' | 'menengah' | 'panjang' | null
  /** Jeda autopilot, dalam detik. Null = autopilot tidak tersedia. */
  autopilotSeconds: number | null
  description: string
}

export const MODE_INFO: Record<SimMode, ModeInfo> = {
  binary: {
    id: 'binary',
    label: 'Binary Option',
    short: 'Binary',
    horizonDays: null,
    scoreHorizon: null,
    autopilotSeconds: 240,
    description:
      'Tebak arah harga kripto dalam 1–60 menit. Benar: stake kembali +85%. Salah: stake hangus. Harga penyelesaian = transaksi Binance pertama pada detik kedaluwarsa.',
  },
  harian: {
    id: 'harian',
    label: 'Investasi Harian',
    short: 'Harian',
    horizonDays: 1,
    scoreHorizon: 'pendek',
    autopilotSeconds: 900,
    description:
      'Posisi intraday, ditutup otomatis setelah 24 jam. Desk membaca candle 5–15 menit hari ini.',
  },
  bulanan: {
    id: 'bulanan',
    label: 'Investasi Bulanan',
    short: 'Bulanan',
    horizonDays: 30,
    scoreHorizon: 'menengah',
    autopilotSeconds: null,
    description:
      'Swing trade sampai 30 hari. Desk membaca candle harian, skor jangka menengah, dan jejak akumulasi.',
  },
  tahunan: {
    id: 'tahunan',
    label: 'Investasi Tahunan',
    short: 'Tahunan',
    horizonDays: 365,
    scoreHorizon: 'panjang',
    autopilotSeconds: null,
    description:
      'Posisi sampai 1 tahun. Desk membaca tren panjang, fundamental, dan arus kepemilikan asing (KSEI).',
  },
}

/** Batas posisi terbuka per dompet, supaya desk tidak menyebar modal jadi debu. */
export const MAX_OPEN_POSITIONS = 8
export const MIN_STAKE_USD = 1

export const SimModeSchema = z.enum(SIM_MODES)

export const OpenTradeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('binary'),
    symbol: z.enum(BINARY_SYMBOLS),
    direction: z.enum(['up', 'down']),
    stake: z.number().min(MIN_STAKE_USD).max(100_000),
    expirySeconds: z
      .number()
      .int()
      .refine((v) => (BINARY_EXPIRIES as readonly number[]).includes(v), 'Kedaluwarsa tidak sah.'),
  }),
  z.object({
    kind: z.literal('invest'),
    mode: z.enum(['harian', 'bulanan', 'tahunan']),
    market: z.enum(['CRYPTO', 'IDX', 'US', 'GLOBAL']),
    symbol: z.string().regex(/^[A-Za-z0-9.^=_-]{1,24}$/),
    side: z.enum(['long', 'short']),
    stake: z.number().min(MIN_STAKE_USD).max(100_000),
    stopLossPct: z.number().min(0.2).max(90).nullable().optional(),
    takeProfitPct: z.number().min(0.2).max(1000).nullable().optional(),
  }),
])

export type OpenTradeInput = z.infer<typeof OpenTradeSchema>

/** Timeframe grafik simulator. Nama mengikuti Binance; Yahoo dipetakan di server. */
export const CHART_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const
export type ChartInterval = (typeof CHART_INTERVALS)[number]

export const DEFAULT_INTERVAL: Record<SimMode, ChartInterval> = {
  binary: '1m',
  harian: '15m',
  bulanan: '1d',
  tahunan: '1w',
}
