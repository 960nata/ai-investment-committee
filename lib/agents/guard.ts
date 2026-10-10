/**
 * Pemeriksa putusan ketua
 *
 * Ketua adalah satu model gratisan yang menimbang tiga catatan lalu memukul
 * palu. Tanpa pemeriksaan, JSON yang sah langsung menjadi putusan — termasuk
 * yang angkanya dikarang atau keyakinannya melampaui buktinya. Di sini putusan
 * itu diperiksa dua lapis sebelum disimpan:
 *
 * 1. Aturan pasti, tanpa model. Tidak bisa kena limit dan tidak bisa dibujuk:
 *    batas keyakinan untuk riwayat pendek, angka yang tidak ada di blok FAKTA,
 *    dan kata transaksi yang dilarang.
 * 2. Pemeriksa dari keluarga model lain (lihat `PEMERIKSA` di roles.ts). Hasil
 *    lapis pertama ikut dikirim kepadanya sebagai bahan.
 *
 * Pemeriksa hanya boleh MENURUNKAN — keyakinan, atau putusan berarah menjadi
 * "tahan". Ia tidak pernah menaikkan keyakinan atau membalik arah: dua model
 * yang tidak sepakat berarti buktinya berimbang, bukan bahwa model kedua benar.
 *
 * Murni, tanpa I/O, supaya kebijakannya bisa diuji tanpa memanggil model.
 */

import { z } from 'zod'
import type { MarketFacts } from './facts'
import type { CommitteeVerdict } from './verdict'

/** Batas keyakinan saat pemeriksa model tidak bisa dijangkau (semua kuota habis). */
export const UNCHECKED_CONFIDENCE_CAP = 60
/** Batas keyakinan saat pemeriksa menilai bukti tidak mendukung putusan. */
export const DISPUTED_CONFIDENCE_CAP = 40
/** Aturan ketua: riwayat pendek → di bawah 40. */
export const SHORT_HISTORY_CONFIDENCE_CAP = 39

export const checkSchema = z.object({
  supported: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v),
    z.boolean(),
  ),
  max_confidence: z.preprocess(
    (v) => (typeof v === 'string' ? parseFloat(v) : v),
    z.number().min(0).max(100).transform(Math.round),
  ),
  issues: z.array(z.string()).optional().default([]),
})

export type VerdictCheck = z.infer<typeof checkSchema>

/** Urai balasan pemeriksa. Null bila rusak — diperlakukan sama dengan tidak terjangkau. */
export function parseCheck(raw: string | null): VerdictCheck | null {
  if (!raw) return null
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    const result = checkSchema.safeParse(JSON.parse(text.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1')))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// --- Lapis 1: aturan pasti -------------------------------------------------

const BANNED = /\b(beli|membeli|jual|menjual|akumulasi|cut loss|target harga|profit|rekomendasi)\b/gi

/** Kata transaksi yang dilarang muncul di teks putusan publik. */
export function bannedWords(text: string): string[] {
  return [...new Set((text.match(BANNED) ?? []).map((w) => w.toLowerCase()))]
}

/**
 * Bilangan yang dikutip: yang memakai pemisah desimal/ribuan atau diikuti "%".
 * Bilangan bulat polos ("3 kategori", "SMA200", "2026") terlalu sering bukan
 * kutipan angka pasar untuk diperiksa.
 */
const CITED = /(?<![\p{L}\d.,])-?\d+(?:[.,]\d+)+%?|(?<![\p{L}\d.,])-?\d+%/gu
const ANY_NUMBER = /-?\d+(?:[.,]\d+)*/g

/** Semua tafsiran yang mungkin: "1.234" bisa seribu dua ratus atau satu koma dua. */
function readings(token: string): { value: number; decimals: number }[] {
  const t = token.replace('%', '')
  const out: { value: number; decimals: number }[] = []
  const push = (s: string) => {
    const value = Number(s)
    if (Number.isFinite(value)) out.push({ value, decimals: s.split('.')[1]?.length ?? 0 })
  }
  const hasDot = t.includes('.')
  const hasComma = t.includes(',')
  if (hasDot && hasComma) {
    push(t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  } else if (hasComma) {
    if ((t.match(/,/g) ?? []).length === 1) push(t.replace(',', '.'))
    push(t.replace(/,/g, ''))
  } else if (hasDot) {
    if ((t.match(/\./g) ?? []).length === 1) push(t)
    push(t.replace(/\./g, ''))
  } else {
    push(t)
  }
  return out
}

/**
 * Angka di teks putusan yang tidak bisa dilacak ke blok FAKTA.
 *
 * Toleran terhadap pembulatan: "12,3%" cocok dengan 12,34 di fakta. Hasilnya
 * sinyal untuk pemeriksa, bukan vonis — ketua sah mengutip perkiraan pengawas
 * risiko yang memang tidak ada di fakta.
 */
export function untracedNumbers(text: string, factsText: string): string[] {
  const known = (factsText.match(ANY_NUMBER) ?? []).flatMap((t) => readings(t).map((r) => r.value))
  const misses: string[] = []
  for (const token of text.match(CITED) ?? []) {
    const traced = readings(token).some(({ value, decimals }) =>
      known.some((k) => {
        const factor = 10 ** decimals
        return (
          Math.round(k * factor) / factor === value ||
          Math.round(Math.abs(k) * factor) / factor === Math.abs(value) ||
          Math.abs(k - value) <= Math.abs(value) * 0.005
        )
      }),
    )
    if (!traced) misses.push(token)
  }
  return [...new Set(misses)]
}

export interface RuleFindings {
  bannedWords: string[]
  untracedNumbers: string[]
  shortHistory: boolean
}

export function ruleFindings(verdict: CommitteeVerdict, facts: MarketFacts, factsText: string): RuleFindings {
  const text = [verdict.rationale, verdict.key_risk, verdict.invalidation].join('\n')
  return {
    bannedWords: bannedWords(text),
    untracedNumbers: untracedNumbers(text, factsText),
    shortHistory: facts.historyYears < 1,
  }
}

// --- Gabungan --------------------------------------------------------------

export interface GuardedVerdict {
  verdict: CommitteeVerdict['verdict']
  confidence: number
  /** Kalimat untuk pembaca bila putusan diubah; kosong bila tidak ada yang berubah. */
  note: string
}

/**
 * Putusan akhir setelah dua lapis pemeriksaan. `check` null berarti pemeriksa
 * model tidak terjangkau atau balasannya rusak: putusan tetap berlaku, tapi
 * keyakinannya dibatasi karena hanya satu model yang menimbangnya.
 */
export function applyGuard(
  ketua: CommitteeVerdict,
  rules: RuleFindings,
  check: VerdictCheck | null,
  checkerName?: string,
): GuardedVerdict {
  let { verdict, confidence } = ketua
  const notes: string[] = []

  const cap = (limit: number, reason: string) => {
    if (confidence > limit) {
      confidence = limit
      notes.push(reason)
    }
  }

  if (verdict === 'abstain') return { verdict, confidence, note: '' }

  if (rules.shortHistory) {
    cap(SHORT_HISTORY_CONFIDENCE_CAP, `riwayat kurang dari 1 tahun, keyakinan dibatasi ${SHORT_HISTORY_CONFIDENCE_CAP}`)
  }

  const by = checkerName ? ` (${checkerName})` : ''
  if (!check) {
    cap(UNCHECKED_CONFIDENCE_CAP, `belum diperiksa model kedua, keyakinan dibatasi ${UNCHECKED_CONFIDENCE_CAP}`)
  } else if (!check.supported) {
    const reason = check.issues[0] ? `: ${check.issues[0]}` : ''
    if (verdict === 'beli' || verdict === 'jual') {
      notes.push(`pemeriksa independen${by} menilai bukti belum mendukung arah putusan${reason}, jadi dibaca sebagai bukti berimbang`)
      verdict = 'tahan'
      confidence = Math.min(confidence, DISPUTED_CONFIDENCE_CAP)
    } else {
      cap(DISPUTED_CONFIDENCE_CAP, `pemeriksa independen${by} tidak sepakat${reason}`)
    }
  } else {
    cap(check.max_confidence, `pemeriksa independen${by} menilai keyakinan maksimal ${check.max_confidence}`)
  }

  const note = notes.length ? `Pemeriksaan: ${notes.join('; ')}.` : ''
  return { verdict, confidence, note }
}

/**
 * Catatan pemeriksa yang disimpan di transkrip, berformat "LABEL: isi" seperti
 * agen lain supaya ruang sidang bisa menampilkannya tanpa perender khusus.
 */
export function formatCheckTurn(rules: RuleFindings, check: VerdictCheck): string {
  return [
    `HASIL: ${check.supported ? 'putusan didukung bukti' : 'putusan tidak didukung bukti'}`,
    `KEYAKINAN MAKS: ${check.max_confidence}`,
    ...check.issues.slice(0, 5).map((issue) => `MASALAH: ${issue}`),
    rules.untracedNumbers.length ? `ANGKA TAK TERLACAK: ${rules.untracedNumbers.join(', ')}` : '',
    rules.bannedWords.length ? `KATA TERLARANG: ${rules.bannedWords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Kebalikan `formatCheckTurn`, untuk rapat yang dilanjutkan setelah giliran pemeriksa tercatat. */
export function parseCheckTurn(content: string): VerdictCheck | null {
  const hasil = content.match(/^HASIL:\s*(.+)$/m)?.[1]
  const maks = content.match(/^KEYAKINAN MAKS:\s*(\d+)/m)?.[1]
  if (!hasil || !maks) return null
  return {
    supported: !/tidak didukung/i.test(hasil),
    max_confidence: Math.min(100, Number(maks)),
    issues: [...content.matchAll(/^MASALAH:\s*(.+)$/gm)].map((m) => m[1]),
  }
}
