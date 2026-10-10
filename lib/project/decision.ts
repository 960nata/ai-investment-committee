/**
 * Pengurai keputusan ketua rapat. Murni — dipakai mesin rapat di server dan
 * surat laporan di peramban.
 */

export function parseDecision(
  raw: string,
): { kesimpulan: string; tindakan: string[]; mendesak: string[]; dibuang: number[] } | null {
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    const obj = JSON.parse(raw.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [])
    if (typeof obj.kesimpulan !== 'string') return null
    const dropped = Array.isArray(obj.usulan_dibuang)
      ? obj.usulan_dibuang.map(Number).filter((x) => Number.isInteger(x) && x > 0)
      : []
    return { kesimpulan: obj.kesimpulan, tindakan: list(obj.tindakan), mendesak: list(obj.mendesak), dibuang: dropped }
  } catch {
    return null
  }
}
