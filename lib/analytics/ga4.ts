/**
 * Pembacaan Google Analytics 4 lewat Data API.
 *
 * Tidak memakai `@google-analytics/data`. Pustaka resmi itu menyeret seluruh
 * tumpukan gRPC dan google-gax — puluhan megabita — padahal yang dibutuhkan di
 * sini cuma dua permintaan HTTP biasa: satu menukar JWT jadi token akses, satu
 * lagi meminta laporan. Proyek ini sudah memanggil Supabase Storage dengan cara
 * yang sama, dan penandatanganan RS256 sudah tersedia di `node:crypto`.
 *
 * Batas yang perlu diketahui sebelum membaca sisanya: GA4 tidak pernah
 * mengembalikan alamat IP pengunjung. Google membuangnya di sisi mereka demi
 * privasi, jadi tabel "pengunjung per IP" tidak mungkin diisi dari sini dalam
 * bentuk apa pun. Yang tersedia paling dalam adalah kota, itu pun teragregasi.
 *
 * Kredensial yang dibutuhkan, semuanya dari satu service account Google Cloud
 * yang sudah diberi peran Viewer di properti GA4 yang bersangkutan:
 *
 *   GA4_PROPERTY_ID                      -> angka properti, bukan "G-XXXX"
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL         -> client_email dari berkas JSON
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   -> private_key dari berkas JSON
 */

import crypto from 'crypto'
import { fetchWithTimeout } from '@/lib/http/fetch'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

export interface Ga4Config {
  propertyId: string
  clientEmail: string
  privateKey: string
}

/**
 * Baca kredensial dari lingkungan.
 *
 * Kunci privat di berkas JSON Google memuat baris baru sungguhan. Begitu ia
 * dipindahkan ke `.env`, baris barunya berubah jadi dua karakter `\n` harfiah,
 * dan OpenSSL menolak PEM yang seluruhnya satu baris. Pemulihan itu dilakukan
 * di sini, sekali, supaya pemanggil tidak perlu tahu soal ini.
 */
export function getGa4Config(): Ga4Config | null {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim()
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!propertyId || !clientEmail || !rawKey) return null

  const privateKey = rawKey.replace(/\\n/g, '\n').trim()
  if (!privateKey.includes('BEGIN')) return null

  return { propertyId: propertyId.replace(/^properties\//, ''), clientEmail, privateKey }
}

/** Benar kalau ketiga kredensial Data API sudah terisi dan bentuknya masuk akal. */
export function isGa4Configured(): boolean {
  return getGa4Config() !== null
}

/**
 * Tag pengukuran untuk gtag.js di peramban.
 *
 * Sengaja terpisah dari kredensial Data API: memasang tag hanya butuh satu id
 * publik, sedangkan membaca laporan butuh service account. Keduanya bisa hidup
 * sendiri-sendiri, dan sering memang begitu urutan pemasangannya.
 */
export function getMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_ID?.trim()
  return id && id.startsWith('G-') ? id : null
}

// ---------------------------------------------------------------------------
// Token akses
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Tukar JWT bertanda tangan service account dengan token akses OAuth2.
 *
 * Tokennya berumur satu jam dan disimpan di memori modul sampai tersisa satu
 * menit. Tanpa itu tiap muatan halaman analitik membuka delapan laporan yang
 * masing-masing minta token baru, dan delapan penukaran token per kunjungan
 * adalah cara tercepat menghabiskan kuota tanpa mendapat apa-apa.
 */
async function getAccessToken(config: Ga4Config): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  )

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(config.privateKey)

  const assertion = `${header}.${claims}.${base64url(signature)}`

  const res = await fetchWithTimeout(TOKEN_ENDPOINT, {
    label: 'Google OAuth2',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Penukaran token GA4 ditolak (${res.status}). ${detail.slice(0, 200)}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('Google tidak mengembalikan access_token.')

  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  }

  return cachedToken.value
}

// ---------------------------------------------------------------------------
// Pemanggilan laporan
// ---------------------------------------------------------------------------

interface ReportRow {
  dimensionValues?: { value?: string }[]
  metricValues?: { value?: string }[]
}

interface ReportResponse {
  rows?: ReportRow[]
  totals?: ReportRow[]
  rowCount?: number
}

async function callReport(
  config: Ga4Config,
  method: 'runReport' | 'runRealtimeReport',
  body: Record<string, unknown>,
): Promise<ReportResponse> {
  const token = await getAccessToken(config)

  const res = await fetchWithTimeout(`${DATA_API}/properties/${config.propertyId}:${method}`, {
    label: 'GA4 Data API',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Token yang ditolak dibuang supaya percobaan berikutnya tidak memakai
    // token mati yang sama sampai jam berikutnya.
    if (res.status === 401) cachedToken = null
    throw new Error(`GA4 ${method} gagal (${res.status}). ${detail.slice(0, 300)}`)
  }

  return (await res.json()) as ReportResponse
}

function num(row: ReportRow | undefined, index: number): number {
  const raw = row?.metricValues?.[index]?.value
  const parsed = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function dim(row: ReportRow, index: number): string {
  return row.dimensionValues?.[index]?.value ?? '(tidak diketahui)'
}

// ---------------------------------------------------------------------------
// Rentang waktu
// ---------------------------------------------------------------------------

export type Ga4Range = '24h' | '7d' | '30d'

export const RANGE_LABELS: Record<Ga4Range, string> = {
  '24h': 'Hari ini',
  '7d': '7 hari terakhir',
  '30d': '30 hari terakhir',
}

/** Rentang yang diminta, beserta rentang sebelumnya yang sepanjang itu juga. */
function dateRanges(range: Ga4Range): { current: DateRange; previous: DateRange } {
  if (range === '24h') {
    return {
      current: { startDate: 'today', endDate: 'today' },
      previous: { startDate: 'yesterday', endDate: 'yesterday' },
    }
  }
  if (range === '7d') {
    return {
      current: { startDate: '7daysAgo', endDate: 'today' },
      previous: { startDate: '14daysAgo', endDate: '8daysAgo' },
    }
  }
  return {
    current: { startDate: '30daysAgo', endDate: 'today' },
    previous: { startDate: '60daysAgo', endDate: '31daysAgo' },
  }
}

interface DateRange {
  startDate: string
  endDate: string
}

/** Kembalikan nilai `Ga4Range` yang sah dari teks bebas di query string. */
export function parseRange(value: string | undefined): Ga4Range {
  return value === '7d' || value === '30d' || value === '24h' ? value : '7d'
}

// ---------------------------------------------------------------------------
// Bentuk data untuk halaman
// ---------------------------------------------------------------------------

export interface Ga4Summary {
  totalUsers: number
  newUsers: number
  sessions: number
  pageViews: number
  /** Detik. */
  avgSessionDuration: number
  /** 0..1 */
  bounceRate: number
}

export interface Ga4PageRow {
  path: string
  title: string
  views: number
  users: number
  avgTime: number
  bounceRate: number
}

export interface Ga4Slice {
  label: string
  value: number
  share: number
}

export interface Ga4GeoRow {
  country: string
  city: string
  users: number
  sessions: number
}

export interface Ga4Overview {
  range: Ga4Range
  activeNow: number
  current: Ga4Summary
  previous: Ga4Summary
  pages: Ga4PageRow[]
  devices: Ga4Slice[]
  operatingSystems: Ga4Slice[]
  browsers: Ga4Slice[]
  channels: Ga4Slice[]
  geo: Ga4GeoRow[]
  /** Benar kalau properti terhubung tetapi belum ada satu pun peristiwa tercatat. */
  empty: boolean
}

/** Ubah baris berdimensi tunggal jadi potongan berpersentase. */
function toSlices(rows: ReportRow[] | undefined): Ga4Slice[] {
  const list = (rows ?? []).map((row) => ({ label: dim(row, 0), value: num(row, 0) }))
  const total = list.reduce((sum, item) => sum + item.value, 0)

  return list.map((item) => ({
    ...item,
    share: total > 0 ? item.value / total : 0,
  }))
}

/**
 * Ambil baris milik satu rentang dari laporan dua-rentang.
 *
 * Saat lebih dari satu `dateRanges` diminta, GA4 menyisipkan dimensi
 * `dateRange` berisi `date_range_0` dan `date_range_1`. Urutan barisnya tidak
 * dijamin di dokumentasi mana pun, dan menukar dua baris ini diam-diam akan
 * membalik seluruh tanda perbandingan periode: pertumbuhan terbaca sebagai
 * penyusutan, dan tidak ada satu pun galat yang muncul. Jadi barisnya dicari
 * lewat nilai dimensinya, bukan lewat posisi.
 */
function rowForRange(report: ReportResponse, index: number): ReportRow | undefined {
  const tag = `date_range_${index}`
  const matched = report.rows?.find((row) =>
    row.dimensionValues?.some((value) => value.value === tag),
  )
  return matched ?? report.rows?.[index]
}

function toSummary(row: ReportRow | undefined): Ga4Summary {
  return {
    totalUsers: num(row, 0),
    newUsers: num(row, 1),
    sessions: num(row, 2),
    pageViews: num(row, 3),
    avgSessionDuration: num(row, 4),
    bounceRate: num(row, 5),
  }
}

/**
 * Tarik seluruh isi halaman analitik dalam satu kali jalan.
 *
 * Delapan laporan berjalan berbarengan karena tidak satu pun bergantung pada
 * hasil yang lain. Laporan realtime dibiarkan gagal diam-diam: ia yang paling
 * sering kena batas kuota, dan kehilangan satu angka "pengunjung aktif" bukan
 * alasan yang cukup untuk mengosongkan seluruh halaman.
 */
export async function getGa4Overview(range: Ga4Range): Promise<Ga4Overview> {
  const config = getGa4Config()
  if (!config) throw new Error('Kredensial GA4 Data API belum dikonfigurasi.')

  const { current, previous } = dateRanges(range)

  const summaryMetrics = [
    { name: 'totalUsers' },
    { name: 'newUsers' },
    { name: 'sessions' },
    { name: 'screenPageViews' },
    { name: 'averageSessionDuration' },
    { name: 'bounceRate' },
  ]

  const byDimension = (dimension: string, metric: string, limit: number) => ({
    dateRanges: [current],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
  })

  const [summary, pages, devices, os, browsers, channels, geo, realtime] = await Promise.all([
    // Dua rentang dalam satu permintaan: GA4 mengembalikan satu baris per
    // rentang, jadi perbandingan periode tidak perlu panggilan kedua.
    callReport(config, 'runReport', {
      dateRanges: [current, previous],
      metrics: summaryMetrics,
    }),
    callReport(config, 'runReport', {
      dateRanges: [current],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
        { name: 'userEngagementDuration' },
        { name: 'bounceRate' },
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 25,
    }),
    callReport(config, 'runReport', byDimension('deviceCategory', 'sessions', 10)),
    callReport(config, 'runReport', byDimension('operatingSystem', 'sessions', 8)),
    callReport(config, 'runReport', byDimension('browser', 'sessions', 8)),
    callReport(config, 'runReport', byDimension('sessionDefaultChannelGroup', 'sessions', 8)),
    callReport(config, 'runReport', {
      dateRanges: [current],
      dimensions: [{ name: 'country' }, { name: 'city' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
      limit: 15,
    }),
    callReport(config, 'runRealtimeReport', {
      metrics: [{ name: 'activeUsers' }],
    }).catch(() => null),
  ])

  const currentSummary = toSummary(rowForRange(summary, 0))
  const previousSummary = toSummary(rowForRange(summary, 1))

  const pageRows: Ga4PageRow[] = (pages.rows ?? []).map((row) => {
    const users = num(row, 1)
    return {
      path: dim(row, 0),
      title: dim(row, 1),
      views: num(row, 0),
      users,
      // GA4 memberi total detik keterlibatan, bukan rata-rata per pengguna.
      // Pembagiannya dilakukan di sini supaya kolomnya sebanding dengan kolom
      // durasi sesi di ringkasan.
      avgTime: users > 0 ? num(row, 2) / users : 0,
      bounceRate: num(row, 3),
    }
  })

  return {
    range,
    activeNow: num(realtime?.rows?.[0], 0),
    current: currentSummary,
    previous: previousSummary,
    pages: pageRows,
    devices: toSlices(devices.rows),
    operatingSystems: toSlices(os.rows),
    browsers: toSlices(browsers.rows),
    channels: toSlices(channels.rows),
    geo: (geo.rows ?? []).map((row) => ({
      country: dim(row, 0),
      city: dim(row, 1),
      users: num(row, 0),
      sessions: num(row, 1),
    })),
    empty: currentSummary.sessions === 0 && pageRows.length === 0,
  }
}
