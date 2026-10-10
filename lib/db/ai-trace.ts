/**
 * Jejak kerja AI
 *
 * Satu baris per langkah model yang menghasilkan sesuatu yang tersimpan: tiap
 * giliran sidang komite, tiap artikel warta dan versi bahasanya. Isinya siapa
 * yang benar-benar menjawab, berapa lama, dan siapa yang gagal lebih dulu lalu
 * digantikan.
 *
 * Telemetri di Redis sudah mencatat setiap panggilan, tapi hanya 100 terakhir
 * dan tanpa tautan ke hasil kerjanya. Arsip butuh jawaban untuk "berita #812
 * ditulis siapa?" berbulan-bulan kemudian, jadi jejaknya disimpan di Postgres
 * bersama ID hasilnya.
 *
 * Tabelnya berdiri sendiri, dibuat saat pertama dibutuhkan — tidak ada kolom
 * baru di tabel lama, jadi kueri lain tidak bisa ikut rusak bila pembuatannya
 * tertunda. Pencatatan tidak pernah menggagalkan pekerjaan yang dicatatnya.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { LlmFailover, LlmResponse } from '@/lib/ai/types'
import { createIfMissing } from '@/lib/db/create-if-missing'

export type TraceKind = 'sidang' | 'berita'

export interface AiTraceRow {
  id: number
  kind: TraceKind
  refId: number
  step: string
  providerId: string
  model: string
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  failovers: LlmFailover[]
  createdAt: string
}

let tableReady: Promise<void> | null = null

function ensureTraceTable(): Promise<void> {
  tableReady ??= createIfMissing('ai_work_trace', sql`
      CREATE TABLE IF NOT EXISTS ai_work_trace (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(16) NOT NULL,
        ref_id INTEGER NOT NULL,
        step VARCHAR(48) NOT NULL,
        provider_id VARCHAR(32) NOT NULL,
        model VARCHAR(96) NOT NULL,
        latency_ms INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        failovers JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ai_work_trace_ref_idx ON ai_work_trace (kind, ref_id);
      CREATE INDEX IF NOT EXISTS ai_work_trace_created_idx ON ai_work_trace (created_at);
    `).catch((err) => {
    tableReady = null
    throw err
  })
  return tableReady
}

/** Catat satu langkah. Galat ditelan: jejak yang hilang lebih murah daripada artikel yang batal. */
export async function recordAiTrace(kind: TraceKind, refId: number, step: string, response: LlmResponse): Promise<void> {
  try {
    await ensureTraceTable()
    await db.execute(sql`
      INSERT INTO ai_work_trace
        (kind, ref_id, step, provider_id, model, latency_ms, input_tokens, output_tokens, failovers)
      VALUES (
        ${kind}, ${refId}, ${step.slice(0, 48)}, ${response.providerId.slice(0, 32)}, ${response.model.slice(0, 96)},
        ${response.latencyMs ?? null}, ${response.inputTokens ?? null}, ${response.outputTokens ?? null},
        ${JSON.stringify(response.failovers ?? [])}::jsonb
      )
    `)
  } catch (err) {
    console.warn(`[AiTrace] ${kind}#${refId} ${step} tidak tercatat:`, err instanceof Error ? err.message : err)
  }
}

/** Jejak untuk sekumpulan hasil, dikelompokkan per ID. */
export async function getAiTraces(kind: TraceKind, refIds: number[]): Promise<Map<number, AiTraceRow[]>> {
  const map = new Map<number, AiTraceRow[]>()
  if (refIds.length === 0) return map
  await ensureTraceTable()

  const rows = await db.execute<{
    id: number
    kind: TraceKind
    ref_id: number
    step: string
    provider_id: string
    model: string
    latency_ms: number | null
    input_tokens: number | null
    output_tokens: number | null
    failovers: LlmFailover[]
    created_at: Date | string
  }>(sql`
    SELECT id, kind, ref_id, step, provider_id, model, latency_ms, input_tokens, output_tokens, failovers, created_at
    FROM ai_work_trace
    WHERE kind = ${kind} AND ref_id IN (${sql.join(refIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY created_at, id
  `)

  for (const r of rows) {
    const list = map.get(r.ref_id) ?? []
    list.push({
      id: r.id,
      kind: r.kind,
      refId: r.ref_id,
      step: r.step,
      providerId: r.provider_id,
      model: r.model,
      latencyMs: r.latency_ms,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      failovers: Array.isArray(r.failovers) ? r.failovers : [],
      createdAt: new Date(r.created_at).toISOString(),
    })
    map.set(r.ref_id, list)
  }
  return map
}
