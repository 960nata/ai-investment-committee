/**
 * Telemetri & Analisis AI Token / Kunci API
 *
 * Mencatat setiap panggilan ke kolam kunci LLM (Gemini, Groq, OpenRouter, dll):
 * jumlah permintaan, token input, token output, latensi, dan status galat
 * (khususnya 429 TooManyRequests), lalu menyajikannya per kunci, per penyedia,
 * dan per model untuk dashboard admin.
 *
 * Penyimpanannya satu hash Redis per ember waktu (per jam dan per hari, zona
 * WIB), dengan field `penyedia|sidik|model|metrik`. HINCRBY dipakai alih-alih
 * baca-lalu-tulis: dua invocation serverless yang berjalan bersamaan akan saling
 * menimpa hitungan kalau caranya get → set. Satu dashboard 24 jam cukup membaca
 * 24 hash, berapa pun jumlah kuncinya.
 *
 * Tidak ada angka rekaan di sini. Kunci yang belum pernah dipakai tampil nol.
 */

import { cache } from '@/lib/cache/redis'
import { LLM_ADAPTERS } from './adapters'
import { collectKeys, poolStatus } from './keyring'

export interface LlmCallEvent {
  providerId: string
  model: string
  keyIndex: number
  keyFingerprint: string
  success: boolean
  status: number
  errorKind?: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp?: number
}

export type TimeRange = '24h' | '7d' | '30d'
export const TIME_RANGES: readonly TimeRange[] = ['24h', '7d', '30d']

type Granularity = 'hour' | 'day'
type Metric = 'req' | 'ok' | 'r429' | 'err' | 'tin' | 'tout' | 'lat'

const KEY_PREFIX = 'telemetry:ai:v2'
const LAST_USED_KEY = `${KEY_PREFIX}:last`
/** Ember jam cukup hidup sedikit di atas rentang terpanjang yang memakainya (24 jam). */
const HOUR_TTL_SECONDS = 60 * 60 * 50
const DAY_TTL_SECONDS = 60 * 60 * 24 * 32
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Cadangan saat Redis tidak dikonfigurasi. Memori proses tidak dibagi antar
 * invocation serverless, jadi di produksi tanpa Redis angka dashboard hanya
 * mencerminkan instance yang kebetulan melayani halaman ini.
 */
const MEMORY_EVENTS_LIMIT = 5000
const memoryEvents: LlmCallEvent[] = []

function isRateLimited(evt: LlmCallEvent): boolean {
  return evt.status === 429 || evt.errorKind === 'rate_limited'
}

function eventMetrics(evt: LlmCallEvent): Partial<Record<Metric, number>> {
  const m: Partial<Record<Metric, number>> = { req: 1 }
  if (evt.success) {
    m.ok = 1
    m.lat = Math.max(0, Math.round(evt.latencyMs))
  } else if (isRateLimited(evt)) {
    m.r429 = 1
  } else {
    m.err = 1
  }
  if (evt.inputTokens > 0) m.tin = evt.inputTokens
  if (evt.outputTokens > 0) m.tout = evt.outputTokens
  return m
}

/** Pengenal ember dalam waktu WIB: `YYYYMMDDHH` untuk jam, `YYYYMMDD` untuk hari. */
function bucketId(ts: number, granularity: Granularity): string {
  const iso = new Date(ts + WIB_OFFSET_MS).toISOString()
  return granularity === 'hour'
    ? iso.slice(0, 13).replace(/[-T]/g, '')
    : iso.slice(0, 10).replace(/-/g, '')
}

function bucketKey(granularity: Granularity, id: string): string {
  return `${KEY_PREFIX}:${granularity === 'hour' ? 'h' : 'd'}:${id}`
}

function field(providerId: string, fp: string, model: string, metric: Metric): string {
  return `${providerId}|${fp}|${model}|${metric}`
}

/**
 * Catat satu kejadian pemanggilan LLM. Tidak pernah melempar: telemetri yang
 * gagal tidak boleh menggagalkan jawaban model.
 */
export async function recordLlmCall(event: LlmCallEvent): Promise<void> {
  const evt: LlmCallEvent = { ...event, timestamp: event.timestamp || Date.now() }
  const ts = evt.timestamp!

  if (!cache.isAvailable()) {
    memoryEvents.push(evt)
    if (memoryEvents.length > MEMORY_EVENTS_LIMIT) memoryEvents.shift()
    return
  }

  const metrics = Object.entries(eventMetrics(evt)) as [Metric, number][]
  await cache.pipeline((p) => {
    for (const [granularity, ttl] of [
      ['hour', HOUR_TTL_SECONDS],
      ['day', DAY_TTL_SECONDS],
    ] as const) {
      const key = bucketKey(granularity, bucketId(ts, granularity))
      for (const [metric, n] of metrics) {
        p.hincrby(key, field(evt.providerId, evt.keyFingerprint, evt.model, metric), n)
      }
      p.expire(key, ttl)
    }
    p.hset(LAST_USED_KEY, { [`${evt.providerId}|${evt.keyFingerprint}`]: ts })
  })
}

// ---------------------------------------------------------------------------
// Agregasi untuk dashboard
// ---------------------------------------------------------------------------

export interface UsageSeries {
  requests: number[]
  success: number[]
  rateLimited: number[]
  otherErrors: number[]
  inputTokens: number[]
  outputTokens: number[]
  /** Rata-rata latensi panggilan sukses per ember; null saat tidak ada yang sukses. */
  latencyMs: (number | null)[]
  /** Persen sukses per ember; null saat tidak ada permintaan. */
  successRate: (number | null)[]
}

export interface UsageTotals {
  requests: number
  success: number
  rateLimited: number
  otherErrors: number
  inputTokens: number
  outputTokens: number
  avgLatencyMs: number | null
  successRate: number | null
}

export interface ModelUsage {
  model: string
  totals: UsageTotals
  series: UsageSeries
}

export interface KeyAnalyticsItem {
  id: string
  envName: string
  providerId: string
  providerName: string
  /** Model yang saat ini dipasang di adaptor. Riwayat per model ada di `byModel`. */
  model: string
  index: number
  fingerprint: string
  /** `retired`: kunci pernah tercatat tapi sudah tidak ada di env. */
  status: 'ready' | 'cooldown' | 'retired'
  lastUsedAt?: string
  totals: UsageTotals
  series: UsageSeries
  byModel: ModelUsage[]
}

export interface ModelAnalyticsItem extends ModelUsage {
  id: string
  providerId: string
  providerName: string
}

export interface ProviderAnalyticsItem {
  id: string
  name: string
  model: string
  envPrefix: string
  totalKeys: number
  availableKeys: number
  coolingKeys: number
  totals: UsageTotals
  series: UsageSeries
}

export interface AiTokensDashboardData {
  range: TimeRange
  granularity: Granularity
  /** `memory` berarti Redis belum dikonfigurasi dan angkanya hanya milik instance ini. */
  storage: 'redis' | 'memory'
  generatedAt: string
  categories: string[]
  timestamps: string[]
  overview: UsageTotals & {
    totalTokens: number
    totalKeysCount: number
    readyKeysCount: number
    coolingKeysCount: number
  }
  series: UsageSeries
  providers: ProviderAnalyticsItem[]
  models: ModelAnalyticsItem[]
  keys: KeyAnalyticsItem[]
}

/** Deret mentah: latensi disimpan sebagai jumlah, baru dirata-rata di akhir. */
interface RawSeries {
  req: number[]
  ok: number[]
  r429: number[]
  err: number[]
  tin: number[]
  tout: number[]
  lat: number[]
}

function emptyRaw(n: number): RawSeries {
  const z = () => new Array<number>(n).fill(0)
  return { req: z(), ok: z(), r429: z(), err: z(), tin: z(), tout: z(), lat: z() }
}

function addRaw(target: RawSeries, source: RawSeries): void {
  for (const m of Object.keys(target) as Metric[]) {
    for (let i = 0; i < target[m].length; i++) target[m][i] += source[m][i]
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

function finalise(raw: RawSeries): { totals: UsageTotals; series: UsageSeries } {
  const ok = sum(raw.ok)
  const req = sum(raw.req)
  return {
    totals: {
      requests: req,
      success: ok,
      rateLimited: sum(raw.r429),
      otherErrors: sum(raw.err),
      inputTokens: sum(raw.tin),
      outputTokens: sum(raw.tout),
      avgLatencyMs: ok > 0 ? Math.round(sum(raw.lat) / ok) : null,
      successRate: rate(ok, req),
    },
    series: {
      requests: raw.req,
      success: raw.ok,
      rateLimited: raw.r429,
      otherErrors: raw.err,
      inputTokens: raw.tin,
      outputTokens: raw.tout,
      latencyMs: raw.lat.map((l, i) => (raw.ok[i] > 0 ? Math.round(l / raw.ok[i]) : null)),
      successRate: raw.req.map((r, i) => rate(raw.ok[i], r)),
    },
  }
}

interface Bucket {
  id: string
  label: string
  timestamp: string
}

function rangeBuckets(range: TimeRange, now: number): { granularity: Granularity; buckets: Bucket[] } {
  const granularity: Granularity = range === '24h' ? 'hour' : 'day'
  const count = range === '24h' ? 24 : range === '7d' ? 7 : 30
  const step = granularity === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const buckets: Bucket[] = []

  for (let i = count - 1; i >= 0; i--) {
    const id = bucketId(now - i * step, granularity)
    const y = Number(id.slice(0, 4))
    const mo = Number(id.slice(4, 6))
    const d = Number(id.slice(6, 8))
    const h = granularity === 'hour' ? Number(id.slice(8, 10)) : 0
    buckets.push({
      id,
      label: granularity === 'hour' ? `${id.slice(8, 10)}:00` : `${d} ${MONTHS_ID[mo - 1]}`,
      timestamp: new Date(Date.UTC(y, mo - 1, d, h) - WIB_OFFSET_MS).toISOString(),
    })
  }

  return { granularity, buckets }
}

/** Isi tiap ember sebagai peta field → angka, dari Redis atau dari memori. */
async function loadBuckets(
  granularity: Granularity,
  buckets: Bucket[],
): Promise<{ cells: Record<string, number>[]; lastUsed: Record<string, number> }> {
  if (cache.isAvailable()) {
    const results = await cache.pipeline((p) => {
      for (const b of buckets) p.hgetall(bucketKey(granularity, b.id))
      p.hgetall(LAST_USED_KEY)
    })
    const toNumbers = (raw: unknown): Record<string, number> => {
      const out: Record<string, number> = {}
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
          const n = Number(v)
          if (Number.isFinite(n)) out[k] = n
        }
      }
      return out
    }
    const rows = results ?? []
    return {
      cells: buckets.map((_, i) => toNumbers(rows[i])),
      lastUsed: toNumbers(rows[buckets.length]),
    }
  }

  const index = new Map(buckets.map((b, i) => [b.id, i]))
  const cells = buckets.map(() => ({}) as Record<string, number>)
  const lastUsed: Record<string, number> = {}

  for (const evt of memoryEvents) {
    const ts = evt.timestamp ?? 0
    const keyId = `${evt.providerId}|${evt.keyFingerprint}`
    lastUsed[keyId] = Math.max(lastUsed[keyId] ?? 0, ts)

    const i = index.get(bucketId(ts, granularity))
    if (i === undefined) continue
    for (const [metric, n] of Object.entries(eventMetrics(evt)) as [Metric, number][]) {
      const f = field(evt.providerId, evt.keyFingerprint, evt.model, metric)
      cells[i][f] = (cells[i][f] ?? 0) + n
    }
  }

  return { cells, lastUsed }
}

/**
 * Ambil seluruh data analitik AI Token & API Keys untuk dashboard dan popup chart.
 */
export async function getAiTokensDashboardData(range: TimeRange = '24h'): Promise<AiTokensDashboardData> {
  const { granularity, buckets } = rangeBuckets(range, Date.now())
  const n = buckets.length
  const { cells, lastUsed } = await loadBuckets(granularity, buckets)

  // 1. Pecah field menjadi deret per kunci×model.
  //    keyModels: "penyedia|sidik" → model → deret
  const keyModels = new Map<string, Map<string, RawSeries>>()

  cells.forEach((cell, i) => {
    for (const [f, value] of Object.entries(cell)) {
      const parts = f.split('|')
      if (parts.length < 4) continue
      const metric = parts[parts.length - 1] as Metric
      const providerId = parts[0]
      const fp = parts[1]
      const model = parts.slice(2, -1).join('|')

      const keyId = `${providerId}|${fp}`
      let models = keyModels.get(keyId)
      if (!models) keyModels.set(keyId, (models = new Map()))
      let raw = models.get(model)
      if (!raw) models.set(model, (raw = emptyRaw(n)))
      if (metric in raw) raw[metric][i] += value
    }
  })

  const adapterById = new Map(LLM_ADAPTERS.map((a) => [a.id, a]))
  const providerName = (id: string) => adapterById.get(id)?.name ?? id

  const keys: KeyAnalyticsItem[] = []
  const providers: ProviderAnalyticsItem[] = []
  const providerRaw = new Map<string, RawSeries>()
  const modelRaw = new Map<string, { providerId: string; model: string; raw: RawSeries }>()

  const buildKey = (
    providerId: string,
    fp: string,
    base: Pick<KeyAnalyticsItem, 'envName' | 'index' | 'model' | 'status'>,
  ): KeyAnalyticsItem => {
    const models = keyModels.get(`${providerId}|${fp}`) ?? new Map<string, RawSeries>()
    const total = emptyRaw(n)
    const byModel: ModelUsage[] = []

    for (const [model, raw] of models) {
      addRaw(total, raw)
      byModel.push({ model, ...finalise(raw) })

      const mKey = `${providerId}|${model}`
      let agg = modelRaw.get(mKey)
      if (!agg) modelRaw.set(mKey, (agg = { providerId, model, raw: emptyRaw(n) }))
      addRaw(agg.raw, raw)
    }

    let pRaw = providerRaw.get(providerId)
    if (!pRaw) providerRaw.set(providerId, (pRaw = emptyRaw(n)))
    addRaw(pRaw, total)

    const last = lastUsed[`${providerId}|${fp}`]
    return {
      id: `${providerId}-${fp}`,
      providerId,
      providerName: providerName(providerId),
      fingerprint: fp,
      ...base,
      lastUsedAt: last ? new Date(last).toISOString() : undefined,
      ...finalise(total),
      byModel: byModel.sort((a, b) => b.totals.requests - a.totals.requests),
    }
  }

  // 2. Kunci yang terpasang di env, per penyedia.
  let totalKeysCount = 0
  let readyKeysCount = 0
  let coolingKeysCount = 0
  const seenKeys = new Set<string>()

  for (const adapter of LLM_ADAPTERS) {
    const pool = collectKeys(adapter.envPrefix)
    if (pool.length === 0) continue

    const status = await poolStatus(adapter.id, pool)
    totalKeysCount += pool.length
    readyKeysCount += status.available
    coolingKeysCount += status.cooling.length

    for (const k of pool) {
      seenKeys.add(`${adapter.id}|${k.fingerprint}`)
      const cooling = status.cooling.some((c) => c.endsWith(` ${k.fingerprint}`))
      keys.push(
        buildKey(adapter.id, k.fingerprint, {
          envName: k.envName,
          index: k.index,
          model: adapter.model,
          status: cooling ? 'cooldown' : 'ready',
        }),
      )
    }

    providers.push({
      id: adapter.id,
      name: adapter.name,
      model: adapter.model,
      envPrefix: adapter.envPrefix,
      totalKeys: pool.length,
      availableKeys: status.available,
      coolingKeys: status.cooling.length,
      ...finalise(emptyRaw(n)), // diisi ulang setelah kunci pensiunan ikut dihitung
    })
  }

  // 3. Kunci yang tercatat tapi sudah dicabut dari env. Pemakaiannya nyata,
  //    jadi tetap dihitung, hanya ditandai pensiun.
  for (const keyId of keyModels.keys()) {
    if (seenKeys.has(keyId)) continue
    const [providerId, fp] = keyId.split('|')
    const adapter = adapterById.get(providerId)
    keys.push(
      buildKey(providerId, fp, {
        envName: adapter ? `${adapter.envPrefix} (dicabut)` : `${providerId} (dicabut)`,
        index: -1,
        model: adapter?.model ?? '—',
        status: 'retired',
      }),
    )
    if (!providers.some((p) => p.id === providerId)) {
      providers.push({
        id: providerId,
        name: providerName(providerId),
        model: adapter?.model ?? '—',
        envPrefix: adapter?.envPrefix ?? '—',
        totalKeys: 0,
        availableKeys: 0,
        coolingKeys: 0,
        ...finalise(emptyRaw(n)),
      })
    }
  }

  for (const p of providers) {
    Object.assign(p, finalise(providerRaw.get(p.id) ?? emptyRaw(n)))
  }

  const overallRaw = emptyRaw(n)
  for (const raw of providerRaw.values()) addRaw(overallRaw, raw)
  const overall = finalise(overallRaw)

  const models: ModelAnalyticsItem[] = [...modelRaw.values()]
    .map(({ providerId, model, raw }) => ({
      id: `${providerId}|${model}`,
      providerId,
      providerName: providerName(providerId),
      model,
      ...finalise(raw),
    }))
    .sort((a, b) => b.totals.requests - a.totals.requests)

  return {
    range,
    granularity,
    storage: cache.isAvailable() ? 'redis' : 'memory',
    generatedAt: new Date().toISOString(),
    categories: buckets.map((b) => b.label),
    timestamps: buckets.map((b) => b.timestamp),
    overview: {
      ...overall.totals,
      totalTokens: overall.totals.inputTokens + overall.totals.outputTokens,
      totalKeysCount,
      readyKeysCount,
      coolingKeysCount,
    },
    series: overall.series,
    providers,
    models,
    keys,
  }
}
