/**
 * Membaca transkrip sidang komite menjadi isi panggung sidang
 * (`CommitteeSessionStage`): satu kalimat per agen, blok fakta, dan putusan.
 *
 * Dipakai ruang sidang di dashboard dan bagian "Cara sidang berjalan" di
 * beranda, supaya keduanya membaca transkrip yang sama dengan cara yang sama.
 * Murni — tanpa React, tanpa database — jadi aman dipanggil di server maupun
 * di peramban.
 */

export type FactTone = 'positive' | 'negative' | 'neutral'

export interface StageFact {
  label: string
  value: string
  tone: FactTone
}

export interface TranscriptTurn {
  agent: string
  content: string
  latencyMs?: number | null
}

/** Isi panggung yang siap diputar. Semua field bisa diserialisasi ke JSON. */
export interface StageView {
  facts: StageFact[]
  analis?: string
  strateg?: string
  risiko?: string
  rationale?: string
  invalidation?: string
  latencyMs: Partial<Record<'analis' | 'strateg' | 'risiko' | 'ketua', number>>
}

/** Giliran ketua: JSON bila model patuh format, kalau tidak dibaca per baris. */
export function parseKetua(content: string | undefined): Record<string, unknown> | null {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    const res: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const parts = line.split(':')
      if (parts.length > 1) {
        const k = parts[0].toLowerCase().trim()
        const v = parts.slice(1).join(':').trim()
        if (k.includes('risiko') || k.includes('risk')) res.key_risk = v
        if (k.includes('batal') || k.includes('invalidation')) res.invalidation = v
        if (k.includes('alasan') || k.includes('rationale')) res.rationale = v
      }
    }
    return res
  }
}

export function toStageView(turns: TranscriptTurn[], sessionRationale: string | null): StageView {
  const ketua = parseKetua(turns.find((t) => t.agent === 'ketua')?.content)
  const turnAnalis = turns.find((t) => t.agent === 'analis')
  const turnStrateg = turns.find((t) => t.agent === 'strateg')
  const turnRisiko = turns.find((t) => t.agent === 'risiko')

  const facts = turnAnalis ? analisFacts(turnAnalis.content) : []
  const analis = turnAnalis
    ? facts.length > 0
      ? facts.map((f) => `${f.label} ${f.value}`).join(' · ') + '.'
      : firstSentences(turnAnalis.content)
    : undefined

  return {
    facts,
    analis,
    strateg: turnStrateg ? strategThesis(turnStrateg.content) : undefined,
    risiko:
      (ketua?.key_risk as string | undefined) || (turnRisiko ? risikoWorstCase(turnRisiko.content) : undefined),
    rationale: cleanRationale((ketua?.rationale as string | undefined) ?? sessionRationale),
    invalidation: (ketua?.invalidation as string | undefined) || undefined,
    latencyMs: Object.fromEntries(
      turns.filter((t) => t.latencyMs).map((t) => [t.agent, t.latencyMs as number]),
    ),
  }
}

/**
 * Alasan yang tersimpan di sesi sudah ditempeli "Risiko utama: …" dan
 * "Pembatalan: …" (lihat lib/agents/committee.ts). Keduanya punya tempat
 * sendiri di layar, jadi di sini dipotong supaya tidak terbaca dua kali.
 */
export function cleanRationale(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const cut = text.search(/\s(Risiko utama|Pembatalan|Main risk|Invalidation):/i)
  return (cut > 0 ? text.slice(0, cut) : text).trim() || undefined
}

export function strategThesis(raw: string): string | undefined {
  return findVal(parseLabeledSections(raw), ['tesis investasi utama', 'tesis investasi', 'tesis utama', 'tesis'])
}

export function risikoWorstCase(raw: string): string | undefined {
  const map = parseLabeledSections(raw)
  return (
    findVal(map, ['skenario kerugian maksimal', 'skenario rugi', 'skenario terburuk', 'worst case']) ??
    findVal(map, ['kelemahan utama', 'kelemahan'])
  )
}

/** Dua kalimat pertama, untuk agen yang tidak menulis dalam format berlabel. */
export function firstSentences(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim()
  const m = flat.match(/^(.+?[.!?])\s+(.+?[.!?])(\s|$)/)
  const text = m ? `${m[1]} ${m[2]}` : flat
  return text.length > 280 ? `${text.slice(0, 277)}…` : text
}

/** Angka pijakan dari giliran analis, hanya yang benar-benar ia tulis. */
export function analisFacts(raw: string): StageFact[] {
  const map: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) map[line.slice(0, i).toLowerCase().trim()] = line.slice(i + 1).trim()
  }
  const signed = (v: string): FactTone => (isPos(v) ? 'positive' : 'negative')
  const defs: { label: string; keys: string[]; tone: (v: string) => FactTone }[] = [
    { label: 'Return 90 hari', keys: ['imbal hasil 90 hari', 'return 90d', '90 hari'], tone: signed },
    { label: 'Return 1 tahun', keys: ['imbal hasil 365 hari', 'return 365d', '365 hari', '1 tahun'], tone: signed },
    { label: 'Drawdown maks', keys: ['penurunan terdalam', 'max drawdown', 'drawdown'], tone: () => 'negative' },
    { label: 'Volatilitas', keys: ['volatilitas disetahunkan', 'volatilitas'], tone: () => 'neutral' },
    { label: 'Rasio volume', keys: ['rasio volume', 'volume 20v100'], tone: () => 'neutral' },
  ]
  const facts: StageFact[] = []
  for (const d of defs) {
    const value = findVal(map, d.keys)
    if (value) facts.push({ label: d.label, value, tone: d.tone(value) })
  }
  return facts
}

/** Parser toleran format untuk teks terstruktur dari agen AI */
export function parseLabeledSections(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let currentKey: string | null = null
  let currentValParts: string[] = []

  const flush = () => {
    if (currentKey && currentValParts.length > 0) {
      map[currentKey] = currentValParts.join(' ')
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Deteksi jika baris memiliki pemisah titik dua pendek (contoh: "Posisi: Sedang", "Bukti 1: Imbal hasil...")
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 45) {
      flush()
      currentKey = line
        .slice(0, colonIdx)
        .toLowerCase()
        .trim()
        .replace(/^[\*✓✕\-•\d\.\)]+\s*/, '')
      currentValParts = [line.slice(colonIdx + 1).trim()]
      continue
    }

    // Deteksi jika baris adalah heading terisolasi tanpa titik dua
    const cleanLine = line.replace(/^[\*✓✕\-•\d\.\)]+\s*/, '').trim()
    const lower = cleanLine.toLowerCase()
    const isKnownHeader =
      lower.startsWith('tesis') ||
      lower.startsWith('bukti') ||
      lower.startsWith('kelemahan') ||
      lower.startsWith('data yang diabaikan') ||
      lower.startsWith('data diabaikan') ||
      lower.startsWith('validasi') ||
      lower.startsWith('risiko likuiditas') ||
      lower.startsWith('skenario') ||
      lower.startsWith('kondisi wajib') ||
      lower.startsWith('syarat pembatalan') ||
      lower.startsWith('cutloss') ||
      lower.startsWith('cut loss') ||
      lower.startsWith('posisi') ||
      lower.startsWith('horizon') ||
      lower.startsWith('catatan')

    if (isKnownHeader && cleanLine.length < 55) {
      flush()
      currentKey = lower
      currentValParts = []
      continue
    }

    // Baris kelanjutan teks
    currentValParts.push(line)
  }
  flush()

  return map
}

export function findVal(map: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (map[k]) return map[k]
  }
  for (const [mk, mv] of Object.entries(map)) {
    if (keys.some((k) => mk.includes(k))) return mv
  }
  return undefined
}

export function isPos(val: string): boolean {
  if (val.includes('-')) return false
  return true
}

/** Sidang terakhir yang dipajang di beranda, sudah siap diputar panggung. */
export interface LiveSession {
  id: number
  symbol: string
  verdict: string | null
  confidence: number
  finishedAt: string | null
  stage: StageView
}

export function toLiveSession(
  session: {
    id: number
    symbol: string
    verdict: string | null
    confidence: number | null
    rationale: string | null
    finishedAt: Date | null
  },
  turns: TranscriptTurn[],
): LiveSession {
  return {
    id: session.id,
    symbol: session.symbol,
    verdict: session.verdict,
    confidence: session.confidence ?? 0,
    finishedAt: session.finishedAt?.toISOString() ?? null,
    stage: toStageView(turns, session.rationale),
  }
}
