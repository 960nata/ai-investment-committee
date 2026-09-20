/**
 * Putusan ketua komite — skema dan penguraiannya
 *
 * Murni, tanpa I/O, karena di sinilah satu-satunya tempat keluaran model
 * berubah menjadi nilai yang masuk ke kolom database. Balasan yang rusak harus
 * gagal dengan jelas, bukan diam-diam menjadi rekomendasi.
 */

import { z } from 'zod'

/**
 * Divalidasi, bukan dipercaya: model yang diminta membalas JSON tetap sesekali
 * membalas prosa, dan `confidence: 140` bukan sesuatu yang layak disimpan.
 */
export const verdictSchema = z.object({
  verdict: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['beli', 'tahan', 'jual', 'abstain']),
  ),
  confidence: z.preprocess((val) => {
    if (typeof val === 'number') {
      const num = val > 0 && val <= 1 ? val * 100 : val
      return Math.round(num)
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace('%', '').trim())
      if (!isNaN(parsed)) {
        const num = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed
        return Math.round(num)
      }
    }
    return val
  }, z.number().int().min(0).max(100)),
  rationale: z.string().min(1),
  key_risk: z.string().optional().default(''),
  invalidation: z.string().optional().default(''),
})

export type CommitteeVerdict = z.infer<typeof verdictSchema>

/**
 * Urai JSON putusan.
 *
 * Pagar kode tetap dilucuti meski prompt melarangnya, dan kalimat pengantar
 * tetap dilewati: model yang diminta membalas JSON murni tetap sesekali
 * membungkusnya, dan membuang satu rapat penuh hanya karena tiga tanda petik
 * berarti membuang empat panggilan model yang isinya sudah benar.
 *
 * Koma menggantung (trailing comma) dan huruf besar/kecil juga ditoleransi.
 * Yang TIDAK dimaafkan adalah isinya — verdict di luar daftar, confidence di
 * luar 0–100, atau balasan tanpa objek JSON sama sekali menghasilkan null, dan
 * pemanggil mengubahnya menjadi abstain.
 */
export function parseVerdict(raw: string | null): CommitteeVerdict | null {
  if (!raw) return null

  let text = raw.trim()

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1].trim()

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) return null
  text = text.slice(firstBrace, lastBrace + 1)

  // Lucuti koma gantung sebelum kurung kurawal/siku penutup
  text = text.replace(/,\s*([}\]])/g, '$1')

  try {
    const result = verdictSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
