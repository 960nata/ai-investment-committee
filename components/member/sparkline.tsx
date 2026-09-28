/**
 * Garis kecil deret waktu, SVG murni tanpa pustaka grafik.
 * Dipakai untuk konteks arah, bukan untuk dibaca nilainya — nilai persisnya
 * selalu ditulis di sebelahnya.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <div className="spark" aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 100
  const h = 40
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2] as const)
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="spark-area" d={`${line} L${w},${h} L0,${h} Z`} />
      <path d={line} />
    </svg>
  )
}
