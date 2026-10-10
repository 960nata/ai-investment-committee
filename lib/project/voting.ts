/**
 * Voting usulan oleh seluruh anggota rapat — satu anggota per penyedia AI.
 *
 * Empat peran rapat masing-masing dijawab satu model. Voting melebar: setiap
 * penyedia yang terpasang diundang memberi satu suara per usulan, supaya
 * keputusan tidak bergantung pada selera satu keluarga model.
 *
 * Penyedia yang tidak bisa menjawab tercatat ABSEN beserta alasannya — semua
 * kuncinya sedang beristirahat, kena limit, kuncinya ditolak, atau servernya
 * galat. Absen tidak dihitung sebagai suara apa pun. Penyedia yang menjawab
 * tapi suaranya tidak bisa dibaca tercatat hadir dengan "suara tidak sah".
 *
 * Tiap anggota dipanggil terpisah dengan semua penyedia lain dikecualikan:
 * kalau tidak, anggota yang absen diam-diam diwakili penyedia cadangan, dan
 * satu model bisa memberi dua suara.
 */

import { complete, llmStatus, AllProvidersFailedError } from '@/lib/ai/registry'
import { LLM_ADAPTERS } from '@/lib/ai/adapters'
import { LlmError } from '@/lib/ai/types'
import type { NewProposal } from './proposals'

export type VoteChoice = 'setuju' | 'tolak' | 'abstain'

export interface Attendance {
  providerId: string
  name: string
  model: string | null
  hadir: boolean
  /** Alasan absen, atau "suara tidak sah" untuk anggota hadir yang balasannya rusak. */
  alasan?: string
  latencyMs?: number
}

export interface Ballot {
  providerId: string
  pilihan: VoteChoice
  alasan: string
}

export interface VoteTally {
  /** Nomor urut usulan baru dari peneliti, mulai 1. */
  no: number
  setuju: number
  tolak: number
  abstain: number
  rincian: Ballot[]
}

export interface VoteResult {
  attendance: Attendance[]
  tallies: VoteTally[]
  /** Penyedia sehat yang tidak diundang supaya voting tidak menguras kuota. */
  notInvited?: string[]
}

/**
 * Anggota voting paling banyak segini. Lima suara dari lima keluarga model
 * sudah cukup untuk melihat arah; mengundang sepuluh menggandakan biaya tanpa
 * mengubah hasil.
 */
export const MAX_VOTERS = 5

const CHOICES: readonly VoteChoice[] = ['setuju', 'tolak', 'abstain']

/** Urai surat suara satu anggota. Null bila tidak ada JSON yang bisa dibaca. */
export function parseBallot(raw: string, proposals: number): { no: number; pilihan: VoteChoice; alasan: string }[] | null {
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    const obj = JSON.parse(raw.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1')) as { suara?: unknown }
    if (!Array.isArray(obj.suara)) return null
    const seen = new Set<number>()
    return obj.suara.flatMap((s: Record<string, unknown>) => {
      const no = Number(s?.no)
      const pilihan = typeof s?.pilihan === 'string' ? (s.pilihan.trim().toLowerCase() as VoteChoice) : null
      if (!Number.isInteger(no) || no < 1 || no > proposals || seen.has(no) || !pilihan || !CHOICES.includes(pilihan)) return []
      seen.add(no)
      return [{ no, pilihan, alasan: typeof s.alasan === 'string' ? s.alasan.trim().slice(0, 200) : '' }]
    })
  } catch {
    return null
  }
}

/** Jumlahkan suara per usulan. Usulan tanpa suara tetap muncul dengan nol. */
export function tally(proposals: number, ballots: (Ballot & { no: number })[]): VoteTally[] {
  return Array.from({ length: proposals }, (_, i) => {
    const mine = ballots.filter((b) => b.no === i + 1)
    return {
      no: i + 1,
      setuju: mine.filter((b) => b.pilihan === 'setuju').length,
      tolak: mine.filter((b) => b.pilihan === 'tolak').length,
      abstain: mine.filter((b) => b.pilihan === 'abstain').length,
      rincian: mine.map(({ providerId, pilihan, alasan }) => ({ providerId, pilihan, alasan })),
    }
  })
}

const ABSENCE: Record<string, string> = {
  rate_limited: 'kena limit / kuota habis',
  exhausted: 'semua kunci sedang beristirahat',
  auth: 'kunci ditolak penyedia',
  server: 'server penyedia galat',
  network: 'jaringan ke penyedia gagal',
  bad_request: 'permintaan ditolak penyedia',
}

function absenceReason(err: unknown): string {
  if (err instanceof AllProvidersFailedError) {
    const kind = err.attempts.at(-1)?.kind
    return (kind && ABSENCE[kind]) ?? (err.attempts.length === 0 ? 'tidak ada kunci yang bisa dipakai' : 'gagal menjawab')
  }
  if (err instanceof LlmError) return ABSENCE[err.kind] ?? err.kind
  return 'gagal menjawab'
}

const SYSTEM = [
  'Kamu anggota rapat project yang memberi suara atas usulan perbaikan.',
  'Nilai tiap usulan dari bahan rapat: apakah menyelesaikan penyebab nyata, apakah biayanya sepadan untuk pemilik yang bekerja sendiri dengan anggaran kecil, dan apakah alternatif gratisnya masuk akal.',
  'Pilihan: "setuju", "tolak", atau "abstain" (bila bahan tidak cukup untuk menilai). Alasan satu kalimat, maksimal 20 kata.',
  'Balas HANYA satu objek JSON: {"suara":[{"no":1,"pilihan":"setuju","alasan":"..."}]}',
].join('\n')

/**
 * Gelar voting. `context` adalah ringkasan rapat sejauh ini (laporan dan
 * kritik); usulan dikirim bernomor sesuai urutan peneliti.
 */
export async function holdVote(proposals: NewProposal[], context: string): Promise<VoteResult> {
  const status = await llmStatus().catch(() => [])
  const configured = LLM_ADAPTERS.filter((a) => status.some((s) => s.id === a.id))
  const ids = configured.map((m) => m.id)
  const ready = (id: string) => status.find((s) => s.id === id)?.available ?? 0
  // Yang kuncinya habis tetap tercatat absen (bukan disembunyikan); dari yang
  // siap, diundang yang kolamnya paling longgar.
  const invited = configured
    .filter((a) => ready(a.id) > 0)
    .sort((a, b) => ready(b.id) - ready(a.id))
    .slice(0, MAX_VOTERS)
  const members = [...invited, ...configured.filter((a) => ready(a.id) === 0)]
  const notInvited = configured.filter((a) => ready(a.id) > 0 && !invited.includes(a)).map((a) => a.id)
  const list = proposals
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} [${p.category}, dampak ${p.impact}, usaha ${p.effort}, biaya: ${p.cost || 'tidak disebut'}]\n` +
        `   Usulan: ${p.proposal.slice(0, 500)}\n   Alternatif gratis: ${p.freeAlternative.slice(0, 200) || '-'}`,
    )
    .join('\n')

  const ballots: (Ballot & { no: number })[] = []
  const attendance = await Promise.all(
    members.map(async (member): Promise<Attendance> => {
      const pool = status.find((s) => s.id === member.id)
      const base = { providerId: member.id, name: member.name, model: member.model ?? null }
      if (pool && pool.available === 0) return { ...base, hadir: false, alasan: 'semua kunci sedang beristirahat' }
      try {
        const res = await complete({
          feature: 'rapat-project-voting',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `BAHAN RAPAT:\n${context}\n\nUSULAN:\n${list}\n\n[BERIKAN SUARAMU — BALAS HANYA OBJEK JSON]` },
          ],
          temperature: 0.2,
          maxOutputTokens: 400,
          json: true,
          prefer: [member.id],
          // Hanya anggota ini. Cadangan berarti suara orang lain atas namanya.
          exclude: ids.filter((id) => id !== member.id),
          timeoutMs: 30_000,
        })
        const parsed = parseBallot(res.text, proposals.length)
        if (!parsed || parsed.length === 0) {
          return { ...base, model: res.model, hadir: true, alasan: 'suara tidak sah', latencyMs: res.latencyMs }
        }
        for (const b of parsed) ballots.push({ ...b, providerId: member.id })
        return { ...base, model: res.model, hadir: true, latencyMs: res.latencyMs }
      } catch (err) {
        return { ...base, hadir: false, alasan: absenceReason(err) }
      }
    }),
  )

  return { attendance, tallies: tally(proposals.length, ballots), notInvited }
}

/** Ringkasan voting untuk dibaca ketua rapat. */
export function voteSummaryForPrompt(result: VoteResult, proposals: NewProposal[]): string {
  const present = result.attendance.filter((a) => a.hadir).length
  const absent = result.attendance.filter((a) => !a.hadir)
  return [
    `HASIL VOTING (${present} hadir, ${absent.length} absen${absent.length ? `: ${absent.map((a) => `${a.providerId} — ${a.alasan}`).join('; ')}` : ''}):`,
    ...result.tallies.map(
      (t) =>
        `${t.no}. ${proposals[t.no - 1]?.title ?? '?'} — setuju ${t.setuju}, tolak ${t.tolak}, abstain ${t.abstain}` +
        (t.rincian.some((r) => r.pilihan === 'tolak')
          ? ` (alasan tolak: ${t.rincian.filter((r) => r.pilihan === 'tolak').map((r) => r.alasan).filter(Boolean).slice(0, 2).join(' / ')})`
          : ''),
    ),
  ].join('\n')
}
