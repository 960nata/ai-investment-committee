/**
 * Isi ruang komite admin: sidang terbaru dengan gilirannya, umpan panggilan
 * model, dan keadaan kolam kunci. Dipakai halaman (muatan pertama) dan rute
 * API (penyegaran berkala), supaya keduanya tidak pernah berbeda bentuk.
 *
 * Murni pembacaan — tidak ada model yang dipanggil di sini.
 */

import { COMMITTEE, PEMERIKSA } from './roles'
import { llmStatus } from '@/lib/ai/registry'
import { getRecentLlmCalls } from '@/lib/ai/telemetry'
import { getCommitteeRoomSessions, type CommitteeRoomSession } from '@/lib/db/work-archive-queries'

export interface RoomFeedEvent {
  requestId?: string
  feature?: string
  attempt?: number
  providerId: string
  model: string
  keyIndex: number
  success: boolean
  status: number
  errorKind?: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp?: number
}

export interface CommitteeRoomSnapshot {
  generatedAt: string
  roles: { name: string; title: string; provider: string }[]
  sessions: CommitteeRoomSession[]
  /** Null bila Redis tidak menjawab; layar mempertahankan umpan terakhirnya. */
  feed: RoomFeedEvent[] | null
  pools: { id: string; name: string; model: string; total: number; available: number; cooling: string[] }[]
}

export async function getCommitteeRoomSnapshot(): Promise<CommitteeRoomSnapshot> {
  const [sessions, feed, pools] = await Promise.all([
    getCommitteeRoomSessions(),
    getRecentLlmCalls().catch(() => null),
    llmStatus().catch(() => []),
  ])

  return {
    generatedAt: new Date().toISOString(),
    roles: [...COMMITTEE, PEMERIKSA].map((r) => ({ name: r.name, title: r.title, provider: r.provider })),
    sessions,
    // Sidik kunci tidak ikut: layar cukup tahu indeksnya di kolam.
    feed:
      feed?.map((e) => ({
        requestId: e.requestId,
        feature: e.feature,
        attempt: e.attempt,
        providerId: e.providerId,
        model: e.model,
        keyIndex: e.keyIndex,
        success: e.success,
        status: e.status,
        errorKind: e.errorKind,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        latencyMs: e.latencyMs,
        timestamp: e.timestamp,
      })) ?? null,
    pools,
  }
}
