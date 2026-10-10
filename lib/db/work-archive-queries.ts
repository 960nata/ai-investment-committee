/**
 * Arsip kerja AI untuk admin: sidang komite dan warta, beserta jejak model
 * yang mengerjakannya.
 *
 * Hanya dibaca dari Server Component dan rute admin. Isinya transkrip lengkap
 * dan susunan penyedia — bukan sesuatu yang perlu dilihat pengunjung.
 */

import { and, count, desc, eq, gte, ilike, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from './client'
import { agentMessage, agentSession, marketNews, marketNewsTranslation, type AgentVerdict } from './schema'
import { getAiTraces, type AiTraceRow } from './ai-trace'
import { ensureNewsTable } from './news-queries'

export const ARCHIVE_PAGE_SIZE = 25

export interface SessionArchiveItem {
  id: number
  market: string
  symbol: string
  status: string
  verdict: AgentVerdict | null
  confidence: number | null
  startedAt: string
  finishedAt: string | null
  turns: number
  providers: string[]
  tokens: number
  /** Giliran yang dijawab setelah penyedia lain gagal. Null bila jejaknya belum ada (sidang lama). */
  replaced: number | null
}

export async function listSessionArchive(options: {
  page?: number
  symbol?: string
  verdict?: string
}): Promise<{ items: SessionArchiveItem[]; total: number }> {
  const page = Math.max(1, options.page ?? 1)
  const conditions: SQL[] = []
  if (options.symbol) conditions.push(ilike(agentSession.symbol, `%${options.symbol.trim()}%`))
  if (options.verdict && ['beli', 'tahan', 'jual', 'abstain'].includes(options.verdict)) {
    conditions.push(eq(agentSession.verdict, options.verdict as AgentVerdict))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: agentSession.id,
        market: agentSession.market,
        symbol: agentSession.symbol,
        status: agentSession.status,
        verdict: agentSession.verdict,
        confidence: agentSession.confidence,
        startedAt: agentSession.startedAt,
        finishedAt: agentSession.finishedAt,
        turns: sql<number>`(SELECT COUNT(*)::int FROM agent_message m WHERE m.session_id = agent_session.id)`,
        providers: sql<string[] | null>`(SELECT array_agg(DISTINCT m.provider_id) FROM agent_message m WHERE m.session_id = agent_session.id AND m.provider_id IS NOT NULL)`,
        tokens: sql<number>`(SELECT COALESCE(SUM(COALESCE(m.input_tokens, 0) + COALESCE(m.output_tokens, 0)), 0)::int FROM agent_message m WHERE m.session_id = agent_session.id)`,
      })
      .from(agentSession)
      .where(where)
      .orderBy(desc(agentSession.startedAt))
      .limit(ARCHIVE_PAGE_SIZE)
      .offset((page - 1) * ARCHIVE_PAGE_SIZE),
    db.select({ total: count() }).from(agentSession).where(where),
  ])

  const traces = await getAiTraces('sidang', rows.map((r) => r.id)).catch(() => new Map<number, AiTraceRow[]>())

  return {
    total,
    items: rows.map((r) => {
      const trace = traces.get(r.id)
      return {
        id: r.id,
        market: r.market,
        symbol: r.symbol,
        status: r.status,
        verdict: r.verdict,
        confidence: r.confidence,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        turns: Number(r.turns),
        providers: (r.providers ?? []).filter(Boolean),
        tokens: Number(r.tokens),
        replaced: trace ? trace.filter((t) => t.failovers.length > 0).length : null,
      }
    }),
  }
}

export async function getSessionArchive(id: number) {
  const [session] = await db.select().from(agentSession).where(eq(agentSession.id, id)).limit(1)
  if (!session) return null
  const [turns, traces] = await Promise.all([
    db.select().from(agentMessage).where(eq(agentMessage.sessionId, id)).orderBy(agentMessage.seq),
    getAiTraces('sidang', [id]).catch(() => new Map<number, AiTraceRow[]>()),
  ])
  return { session, turns, traces: traces.get(id) ?? [] }
}

export interface NewsArchiveItem {
  id: number
  slug: string
  title: string
  category: string
  sentiment: string
  impactScore: number
  author: string
  createdAt: string
  sources: number
  locales: number
  steps: AiTraceRow[]
}

/** Jumlah tautan di bagian "Sumber" yang dicetak agen warta di akhir artikel. */
export function countSources(markdown: string): number {
  const idx = markdown.lastIndexOf('### Sumber')
  if (idx === -1) return 0
  return (markdown.slice(idx).match(/<a href=/g) ?? []).length
}

export function extractSources(markdown: string): { href: string; title: string; source: string }[] {
  const idx = markdown.lastIndexOf('### Sumber')
  if (idx === -1) return []
  const unescape = (t: string) =>
    t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return [...markdown.slice(idx).matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>(?:\s*—\s*([^\n]*))?/g)].map((m) => ({
    href: unescape(m[1]),
    title: unescape(m[2]),
    source: unescape(m[3] ?? '').trim(),
  }))
}

export async function listNewsArchive(options: {
  page?: number
  q?: string
}): Promise<{ items: NewsArchiveItem[]; total: number }> {
  await ensureNewsTable()
  const page = Math.max(1, options.page ?? 1)
  const where = options.q ? ilike(marketNews.title, `%${options.q.trim()}%`) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: marketNews.id,
        slug: marketNews.slug,
        title: marketNews.title,
        category: marketNews.category,
        sentiment: marketNews.sentiment,
        impactScore: marketNews.impactScore,
        author: marketNews.author,
        createdAt: marketNews.createdAt,
        content: marketNews.contentMarkdown,
      })
      .from(marketNews)
      .where(where)
      .orderBy(desc(marketNews.createdAt))
      .limit(ARCHIVE_PAGE_SIZE)
      .offset((page - 1) * ARCHIVE_PAGE_SIZE),
    db.select({ total: count() }).from(marketNews).where(where),
  ])

  const ids = rows.map((r) => r.id)
  const [locales, traces] = await Promise.all([
    ids.length
      ? db
          .select({ newsId: marketNewsTranslation.newsId, n: count() })
          .from(marketNewsTranslation)
          .where(inArray(marketNewsTranslation.newsId, ids))
          .groupBy(marketNewsTranslation.newsId)
          .catch(() => [])
      : Promise.resolve([]),
    getAiTraces('berita', ids).catch(() => new Map<number, AiTraceRow[]>()),
  ])
  const localeCount = new Map(locales.map((l) => [l.newsId, Number(l.n)]))

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      sentiment: r.sentiment,
      impactScore: r.impactScore,
      author: r.author,
      createdAt: r.createdAt.toISOString(),
      sources: countSources(r.content),
      locales: localeCount.get(r.id) ?? 0,
      steps: traces.get(r.id) ?? [],
    })),
  }
}

export async function getNewsArchive(id: number) {
  await ensureNewsTable()
  const [article] = await db.select().from(marketNews).where(eq(marketNews.id, id)).limit(1)
  if (!article) return null
  const [locales, traces] = await Promise.all([
    db
      .select({ locale: marketNewsTranslation.locale })
      .from(marketNewsTranslation)
      .where(eq(marketNewsTranslation.newsId, id))
      .catch(() => []),
    getAiTraces('berita', [id]).catch(() => new Map<number, AiTraceRow[]>()),
  ])
  return {
    article,
    locales: locales.map((l) => l.locale),
    sources: extractSources(article.contentMarkdown),
    traces: traces.get(id) ?? [],
  }
}

/**
 * Sidang yang sedang berjalan atau baru saja selesai, untuk ruang komite.
 * "Berjalan" dibatasi 30 menit: sidang yang macet lebih lama dari itu sudah
 * pasti mati di tengah jalan, bukan sedang bekerja.
 */
export async function getCommitteeRoomSessions() {
  const recent = await db
    .select()
    .from(agentSession)
    .where(gte(agentSession.startedAt, sql`NOW() - INTERVAL '7 days'`))
    .orderBy(desc(agentSession.startedAt))
    .limit(8)

  const ids = recent.map((s) => s.id)
  const [messages, traces] = await Promise.all([
    ids.length
      ? db.select().from(agentMessage).where(inArray(agentMessage.sessionId, ids)).orderBy(agentMessage.seq)
      : Promise.resolve([]),
    getAiTraces('sidang', ids).catch(() => new Map<number, AiTraceRow[]>()),
  ])

  const staleBefore = Date.now() - 30 * 60_000
  return recent.map((s) => ({
    id: s.id,
    market: s.market,
    symbol: s.symbol,
    status: s.status === 'running' && s.startedAt.getTime() < staleBefore ? ('stalled' as const) : s.status,
    verdict: s.verdict,
    confidence: s.confidence,
    rationale: s.rationale,
    error: s.error,
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
    turns: messages
      .filter((m) => m.sessionId === s.id)
      .map((m) => ({
        seq: m.seq,
        agent: m.agent,
        content: m.content,
        providerId: m.providerId,
        model: m.model,
        latencyMs: m.latencyMs,
        tokens: (m.inputTokens ?? 0) + (m.outputTokens ?? 0),
        createdAt: m.createdAt.toISOString(),
        failovers: traces.get(s.id)?.find((t) => t.step === m.agent)?.failovers ?? [],
      })),
  }))
}

export type CommitteeRoomSession = Awaited<ReturnType<typeof getCommitteeRoomSessions>>[number]
