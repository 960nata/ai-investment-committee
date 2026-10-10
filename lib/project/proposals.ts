/**
 * Usulan perbaikan project — ingatan rapat dari satu rapat ke rapat berikutnya.
 *
 * Rapat yang tidak ingat apa pun hanya bisa mengulang hal yang sudah jelas:
 * "perbaiki Yahoo", tiap hari, selamanya. Di sini setiap usulan menjadi satu
 * baris dengan dua status yang sengaja dipisah:
 *
 *   status    — keputusan OWNER: menunggu, disetujui, ditolak, selesai.
 *               Hanya manusia yang mengubahnya.
 *   aiStatus  — pengamatan AGEN atas pengerjaannya: belum-digarap, sedang,
 *               tampak-selesai, terhambat. Agen boleh menilai, tidak boleh
 *               memutuskan.
 *
 * Rapat berikutnya membaca daftar ini: usulan yang ditolak tidak diusulkan
 * ulang tanpa bukti baru, usulan yang disetujui dipantau progresnya, dan usulan
 * yang sama tidak ditulis dua kali — ia hanya dihitung "diangkat lagi".
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { createIfMissing, ensureColumn } from '@/lib/db/create-if-missing'

export type ProposalStatus = 'menunggu' | 'disetujui' | 'ditolak' | 'selesai'
export type ProposalAiStatus = 'belum-digarap' | 'sedang' | 'tampak-selesai' | 'terhambat'
export type ProposalCategory = 'perbaikan-sistem' | 'data-baru' | 'api-baru' | 'fitur' | 'operasional' | 'pemasaran' | 'keuangan'

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ['menunggu', 'disetujui', 'ditolak', 'selesai']
export const PROPOSAL_CATEGORIES: readonly ProposalCategory[] = [
  'perbaikan-sistem',
  'data-baru',
  'api-baru',
  'fitur',
  'operasional',
  'pemasaran',
  'keuangan',
]
const AI_STATUSES: readonly ProposalAiStatus[] = ['belum-digarap', 'sedang', 'tampak-selesai', 'terhambat']

export interface ProposalNeeds {
  /** Data yang perlu dikumpulkan atau dicatat. */
  data: string[]
  /** Layanan/API luar yang dibutuhkan. */
  api: string[]
}

export interface Proposal {
  id: number
  title: string
  category: ProposalCategory
  problem: string
  evidence: string
  proposal: string
  needs: ProposalNeeds
  cost: string
  /** Perkiraan biaya bulanan dalam rupiah; 0 = gratis, null = tidak diketahui. */
  costIdr: number | null
  freeAlternative: string
  /** 1 (kecil) – 5 (besar). */
  impact: number
  effort: 'kecil' | 'sedang' | 'besar'
  status: ProposalStatus
  ownerNote: string | null
  aiStatus: ProposalAiStatus
  aiNote: string | null
  timesRaised: number
  firstReportId: number | null
  lastReportId: number | null
  createdAt: string
  updatedAt: string
  decidedAt: string | null
  /** Hasil voting terakhir anggota rapat atas usulan ini. */
  votes: ProposalVotes | null
  /**
   * Pengingat dari rapat untuk usulan yang lama tidak diputuskan owner:
   * kenapa masih penting, apa akibat bila ditunda, atau saran untuk ditarik.
   */
  aiReminder: string | null
  aiReminderAt: string | null
}

export { OVERDUE_AFTER_DAYS, REMIND_AFTER_DAYS, waitingDays, type ProposalVotes } from './proposal-rules'
import { REMIND_AFTER_DAYS, waitingDays, type ProposalVotes } from './proposal-rules'

let ready: Promise<void> | null = null

export function ensureProposalTable(): Promise<void> {
  ready ??= createIfMissing('project_proposal', sql`
    CREATE TABLE IF NOT EXISTS project_proposal (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(24) NOT NULL,
      problem TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      proposal TEXT NOT NULL DEFAULT '',
      needs JSONB NOT NULL DEFAULT '{"data":[],"api":[]}'::jsonb,
      cost VARCHAR(200) NOT NULL DEFAULT '',
      cost_idr BIGINT,
      free_alternative TEXT NOT NULL DEFAULT '',
      impact SMALLINT NOT NULL DEFAULT 3,
      effort VARCHAR(8) NOT NULL DEFAULT 'sedang',
      status VARCHAR(12) NOT NULL DEFAULT 'menunggu',
      owner_note TEXT,
      ai_status VARCHAR(16) NOT NULL DEFAULT 'belum-digarap',
      ai_note TEXT,
      times_raised INTEGER NOT NULL DEFAULT 1,
      first_report_id INTEGER,
      last_report_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ,
      votes JSONB,
      ai_reminder TEXT,
      ai_reminder_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS project_proposal_status_idx ON project_proposal (status, updated_at DESC);
  `)
    // Kolom yang datang sesudah tabel mungkin sudah terpasang.
    .then(() => ensureColumn('project_proposal', 'votes', 'JSONB'))
    .then(() => ensureColumn('project_proposal', 'ai_reminder', 'TEXT'))
    .then(() => ensureColumn('project_proposal', 'ai_reminder_at', 'TIMESTAMPTZ'))
    .catch((err) => {
    ready = null
    throw err
  })
  return ready
}

type ProposalDbRow = {
  id: number
  title: string
  category: ProposalCategory
  problem: string
  evidence: string
  proposal: string
  needs: ProposalNeeds | null
  cost: string
  cost_idr: string | number | null
  free_alternative: string
  impact: number
  effort: Proposal['effort']
  status: ProposalStatus
  owner_note: string | null
  ai_status: ProposalAiStatus
  ai_note: string | null
  times_raised: number
  first_report_id: number | null
  last_report_id: number | null
  created_at: Date | string
  updated_at: Date | string
  decided_at: Date | string | null
  votes: ProposalVotes | null
  ai_reminder: string | null
  ai_reminder_at: Date | string | null
}

function toProposal(r: ProposalDbRow): Proposal {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    problem: r.problem,
    evidence: r.evidence,
    proposal: r.proposal,
    needs: { data: r.needs?.data ?? [], api: r.needs?.api ?? [] },
    cost: r.cost,
    costIdr: r.cost_idr === null ? null : Number(r.cost_idr),
    freeAlternative: r.free_alternative,
    impact: Number(r.impact),
    effort: r.effort,
    status: r.status,
    ownerNote: r.owner_note,
    aiStatus: r.ai_status,
    aiNote: r.ai_note,
    timesRaised: Number(r.times_raised),
    firstReportId: r.first_report_id,
    lastReportId: r.last_report_id,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    votes: r.votes ?? null,
    aiReminder: r.ai_reminder ?? null,
    aiReminderAt: r.ai_reminder_at ? new Date(r.ai_reminder_at).toISOString() : null,
  }
}

export async function listProposals(status?: ProposalStatus | null, limit = 200): Promise<Proposal[]> {
  await ensureProposalTable()
  const rows = await db.execute<ProposalDbRow>(sql`
    SELECT * FROM project_proposal
    ${status ? sql`WHERE status = ${status}` : sql``}
    ORDER BY CASE status WHEN 'menunggu' THEN 0 WHEN 'disetujui' THEN 1 WHEN 'selesai' THEN 2 ELSE 3 END,
             impact DESC, updated_at DESC
    LIMIT ${limit}
  `)
  return rows.map(toProposal)
}

export async function countPendingProposals(): Promise<number> {
  await ensureProposalTable()
  const [r] = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM project_proposal WHERE status = 'menunggu'`)
  return Number(r?.n ?? 0)
}

export async function proposalsForReport(reportId: number): Promise<Proposal[]> {
  await ensureProposalTable()
  const rows = await db.execute<ProposalDbRow>(sql`
    SELECT * FROM project_proposal WHERE first_report_id = ${reportId} OR last_report_id = ${reportId}
    ORDER BY impact DESC, id
  `)
  return rows.map(toProposal)
}

/** Keputusan owner. Catatan ikut dibaca rapat berikutnya. */
export async function decideProposals(ids: number[], status: ProposalStatus, note?: string): Promise<number> {
  if (ids.length === 0) return 0
  await ensureProposalTable()
  const rows = await db.execute<{ id: number }>(sql`
    UPDATE project_proposal SET
      status = ${status},
      owner_note = COALESCE(${note?.trim() || null}, owner_note),
      decided_at = NOW(),
      updated_at = NOW()
    WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    RETURNING id
  `)
  return rows.length
}

// --- Dari rapat ---------------------------------------------------------------

/** Kata-kata judul tanpa imbuhan umum, untuk mengenali usulan yang sama dengan kata berbeda. */
const STOP = new Set(['dan', 'yang', 'untuk', 'di', 'ke', 'dari', 'dengan', 'agar', 'pada', 'atau', 'the', 'a', 'of', 'to'])

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/** Kemiripan Jaccard dua judul, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const x = titleTokens(a)
  const y = titleTokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / (x.size + y.size - common)
}

export interface ResearchOutput {
  usulan: NewProposal[]
  pembaruan: { id: number; aiStatus: ProposalAiStatus; catatan: string }[]
  pengingat: { id: number; alasan: string; saran: 'putuskan' | 'tarik' }[]
}

export interface NewProposal {
  title: string
  category: ProposalCategory
  problem: string
  evidence: string
  proposal: string
  needs: ProposalNeeds
  cost: string
  costIdr: number | null
  freeAlternative: string
  impact: number
  effort: Proposal['effort']
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v: unknown, n = 6) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, n) : [])

/** Urai keluaran peneliti. Butir yang cacat dibuang satu per satu, bukan seluruhnya. */
export function parseResearch(raw: string): ResearchOutput | null {
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1'))
  } catch {
    return null
  }

  const usulan: NewProposal[] = (Array.isArray(obj.usulan) ? obj.usulan : []).flatMap((u: Record<string, unknown>) => {
    const title = str(u?.judul, 200)
    const proposal = str(u?.usulan, 2000)
    if (!title || !proposal) return []
    const category = PROPOSAL_CATEGORIES.includes(u.kategori as ProposalCategory) ? (u.kategori as ProposalCategory) : 'perbaikan-sistem'
    const effort = (['kecil', 'sedang', 'besar'] as const).includes(u.usaha as Proposal['effort']) ? (u.usaha as Proposal['effort']) : 'sedang'
    const needs = (u.kebutuhan ?? {}) as Record<string, unknown>
    const costIdr = typeof u.biayaRupiahPerBulan === 'number' && u.biayaRupiahPerBulan >= 0 ? Math.round(u.biayaRupiahPerBulan) : null
    return [
      {
        title,
        category,
        problem: str(u.masalah, 1000),
        evidence: str(u.bukti, 1000),
        proposal,
        needs: { data: strList(needs.data), api: strList(needs.api) },
        cost: str(u.biaya, 200),
        costIdr,
        freeAlternative: str(u.alternatifGratis, 1000),
        impact: Math.min(5, Math.max(1, Math.round(Number(u.dampak) || 3))),
        effort,
      },
    ]
  }).slice(0, 5)

  const pembaruan = (Array.isArray(obj.pembaruan) ? obj.pembaruan : []).flatMap((p: Record<string, unknown>) => {
    const id = Number(p?.id)
    const aiStatus = p?.status as ProposalAiStatus
    if (!Number.isInteger(id) || !AI_STATUSES.includes(aiStatus)) return []
    return [{ id, aiStatus, catatan: str(p.catatan, 600) }]
  })

  const pengingat = (Array.isArray(obj.pengingat) ? obj.pengingat : []).flatMap((p: Record<string, unknown>) => {
    const id = Number(p?.id)
    const alasan = str(p?.alasan, 800)
    if (!Number.isInteger(id) || !alasan) return []
    return [{ id, alasan, saran: p.saran === 'tarik' ? ('tarik' as const) : ('putuskan' as const) }]
  })

  return { usulan, pembaruan, pengingat }
}

/** Ambang kemiripan judul untuk dianggap usulan yang sama. */
export const SAME_PROPOSAL = 0.5

export interface ApplyResult {
  created: number[]
  reraised: number[]
  updated: number[]
  /** Usulan yang dibuang karena mirip usulan yang sudah ditolak owner. */
  skippedRejected: string[]
  /** Usulan menunggu yang diberi pengingat rapat ini. */
  reminded: number[]
}

/**
 * Simpan hasil rapat: usulan baru ditulis, yang mirip usulan lama hanya
 * menambah hitungan, yang mirip usulan yang DITOLAK dibuang, dan catatan
 * progres agen diperbarui untuk usulan yang memang ada.
 */
export async function applyResearch(
  research: ResearchOutput,
  keep: (index: number) => boolean,
  reportId: number,
  votesFor: (index: number) => ProposalVotes | null = () => null,
): Promise<ApplyResult> {
  await ensureProposalTable()
  const existing = await listProposals(null, 500)
  const result: ApplyResult = { created: [], reraised: [], updated: [], skippedRejected: [], reminded: [] }

  for (const [index, p] of research.usulan.entries()) {
    if (!keep(index)) continue
    const votes = votesFor(index)
    const votesJson = votes ? JSON.stringify(votes) : null
    const match = existing
      .map((e) => ({ e, sim: titleSimilarity(e.title, p.title) }))
      .filter((x) => x.sim >= SAME_PROPOSAL)
      .sort((a, b) => b.sim - a.sim)[0]?.e

    if (match?.status === 'ditolak') {
      result.skippedRejected.push(p.title)
      continue
    }
    if (match) {
      await db.execute(sql`
        UPDATE project_proposal SET times_raised = times_raised + 1, last_report_id = ${reportId}, updated_at = NOW(),
          votes = COALESCE(${votesJson}::jsonb, votes)
        WHERE id = ${match.id}
      `)
      result.reraised.push(match.id)
      continue
    }
    const [row] = await db.execute<{ id: number }>(sql`
      INSERT INTO project_proposal
        (title, category, problem, evidence, proposal, needs, cost, cost_idr, free_alternative, impact, effort, first_report_id, last_report_id, votes)
      VALUES (
        ${p.title}, ${p.category}, ${p.problem}, ${p.evidence}, ${p.proposal}, ${JSON.stringify(p.needs)}::jsonb,
        ${p.cost}, ${p.costIdr}, ${p.freeAlternative}, ${p.impact}, ${p.effort}, ${reportId}, ${reportId}, ${votesJson}::jsonb
      )
      RETURNING id
    `)
    result.created.push(row.id)
    existing.push({ ...p, id: row.id, status: 'menunggu', votes } as Proposal)
  }

  // Pengingat hanya untuk usulan yang memang masih menunggu owner.
  const waiting = new Set(existing.filter((e) => e.status === 'menunggu').map((e) => e.id))
  for (const r of research.pengingat) {
    if (!waiting.has(r.id)) continue
    const text = r.saran === 'tarik' ? `Saran: tarik usulan ini. ${r.alasan}` : r.alasan
    await db.execute(sql`
      UPDATE project_proposal SET ai_reminder = ${text}, ai_reminder_at = NOW(), last_report_id = ${reportId}
      WHERE id = ${r.id}
    `)
    result.reminded.push(r.id)
  }

  const known = new Set(existing.map((e) => e.id))
  for (const u of research.pembaruan) {
    if (!known.has(u.id)) continue
    await db.execute(sql`
      UPDATE project_proposal SET ai_status = ${u.aiStatus}, ai_note = ${u.catatan || null}, last_report_id = ${reportId}, updated_at = NOW()
      WHERE id = ${u.id}
    `)
    result.updated.push(u.id)
  }

  return result
}

/** Daftar usulan untuk prompt rapat: ringkas, berisi keputusan dan alasan owner. */
export function backlogForPrompt(proposals: Proposal[]): string {
  if (proposals.length === 0) return 'DAFTAR USULAN SEBELUMNYA: belum ada.'
  const now = Date.now()
  const line = (p: Proposal) => {
    const days = waitingDays(p, now)
    const waiting = p.status === 'menunggu' && days >= REMIND_AFTER_DAYS ? `, BELUM DIPUTUSKAN OWNER ${days} HARI` : ''
    return (
    `- #${p.id} [${p.status}${p.status === 'disetujui' ? `, progres: ${p.aiStatus}` : ''}${waiting}] ${p.title}` +
    ` (dampak ${p.impact}, usaha ${p.effort}, diangkat ${p.timesRaised}×)` +
    (p.ownerNote ? ` — catatan owner: "${p.ownerNote.slice(0, 200)}"` : '') +
    (p.aiNote && p.status === 'disetujui' ? ` — catatan progres terakhir: ${p.aiNote.slice(0, 160)}` : '')
    )
  }
  return `DAFTAR USULAN SEBELUMNYA (ingatan rapat):\n${proposals.slice(0, 40).map(line).join('\n')}`
}
