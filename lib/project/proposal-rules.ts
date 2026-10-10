/**
 * Aturan usulan yang murni — tanpa basis data — supaya bisa dipakai komponen
 * peramban (papan ceklis) tanpa ikut menarik klien Postgres.
 */

import type { Proposal } from './proposals'

/** Ambang pengingat: usulan menunggu selama ini mulai diingatkan di setiap rapat. */
export const REMIND_AFTER_DAYS = 7
export const OVERDUE_AFTER_DAYS = 30

/** Berapa hari usulan menunggu keputusan owner (sejak dibuat, atau sejak dikembalikan). */
export function waitingDays(p: Pick<Proposal, 'status' | 'createdAt' | 'decidedAt'>, now = Date.now()): number {
  if (p.status !== 'menunggu') return 0
  const since = Date.parse(p.decidedAt ?? p.createdAt)
  return Math.max(0, Math.floor((now - since) / 86_400_000))
}

export interface ProposalVotes {
  setuju: number
  tolak: number
  abstain: number
  absen: number
  rincian: { providerId: string; pilihan: string; alasan: string }[]
}

