'use client'

/**
 * Papan skor tiga horizon.
 *
 * Tiga meter sejajar, bukan satu angka gabungan. Satu aset bisa lemah untuk
 * minggu ini dan kuat untuk tiga tahun ke depan, dan menggabungkannya jadi satu
 * angka membuang justru perbedaan yang paling berguna.
 *
 * Yang ditampilkan skor, bukan persen. Skor mentah baru berhak jadi peluang
 * setelah dikalibrasi ke hasil historis; sebelum itu ia hanya peringkat.
 * Menuliskan "62%" tanpa kalibrasi adalah kebohongan yang terlihat seperti
 * presisi, dan di produk keuangan itu jenis kesalahan yang paling merusak.
 */

import { useState } from 'react'
import { IconAlert, IconGauge } from './icons'

export interface DriverView {
  feature: string
  label: string
  contribution: number
  raw: number | null
  percentile: number | null
}

export interface HorizonView {
  horizon: 'pendek' | 'menengah' | 'panjang'
  score: number
  confidence: string
  missingWeight: number
  drivers: { supporting: DriverView[]; opposing: DriverView[] }
}

const LABEL: Record<string, { title: string; question: string }> = {
  // Sama dengan HORIZONS di lib/scoring/weights.ts: 5, 63, dan 252 hari bursa.
  pendek: { title: 'Pendek', question: '±1 minggu (5 hari bursa)' },
  menengah: { title: 'Menengah', question: '±1 kuartal (63 hari bursa)' },
  panjang: { title: 'Panjang', question: '±1 tahun (252 hari bursa)' },
}

export function ScorePanel({ horizons, asOf }: { horizons: HorizonView[]; asOf: string | null }) {
  const [active, setActive] = useState(horizons[0]?.horizon ?? 'pendek')
  const selected = horizons.find((h) => h.horizon === active) ?? horizons[0]

  if (horizons.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <IconGauge size={14} />
            Skor
          </span>
        </div>
        <div className="blank">
          <IconGauge size={22} />
          <div className="blank-title">Belum ada skor</div>
          <p className="blank-body">
            Jalankan <code>npm run job score-crypto</code> setelah fiturnya terhitung.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <IconGauge size={14} />
          Skor tiga horizon
        </span>
        <span className="panel-meta">{asOf ? `per ${asOf}` : ''}</span>
      </div>

      <div className="meters">
        {horizons.map((h) => (
          <button
            key={h.horizon}
            type="button"
            className="meter"
            aria-pressed={h.horizon === active}
            onClick={() => setActive(h.horizon)}
          >
            <span className="meter-label">{LABEL[h.horizon].title}</span>
            <span className="meter-question">{LABEL[h.horizon].question}</span>
            <span className={`meter-score ${tone(h.score)}`}>
              {h.score > 0 ? '+' : ''}
              {h.score.toFixed(1)}
            </span>
            <Diverging value={h.score} />
            <span className="meter-confidence">
              confidence {h.confidence}
              <span className="meter-missing">
                {Math.round(h.missingWeight * 100)}% bobot kosong
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="caveat">
        <IconAlert size={14} />
        <span>
          Skor ini peringkat, bukan peluang. Bobotnya diambil dari rancangan dan belum pernah
          dikalibrasi ke hasil historis, jadi belum ada rekam jejak yang bisa dipakai menilai
          seberapa sering ia benar.
        </span>
      </div>

      {selected && (
        <div className="drivers">
          <DriverColumn title="Mendukung" drivers={selected.drivers.supporting} sign="up" />
          <DriverColumn title="Menentang" drivers={selected.drivers.opposing} sign="down" />
        </div>
      )}
    </section>
  )
}

function DriverColumn({
  title,
  drivers,
  sign,
}: {
  title: string
  drivers: DriverView[]
  sign: 'up' | 'down'
}) {
  return (
    <div className="driver-col">
      <span className="driver-title">{title}</span>
      {drivers.length === 0 ? (
        <span className="driver-empty">tidak ada</span>
      ) : (
        drivers.map((d) => (
          <div key={d.feature} className="driver">
            <span className="driver-label">{d.label}</span>
            <span className={`driver-value ${sign}`}>
              {d.contribution > 0 ? '+' : ''}
              {d.contribution.toFixed(2)}
            </span>
            {d.percentile !== null && (
              <span className="driver-pct">persentil {Math.round(d.percentile * 100)}</span>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/**
 * Batang dua arah dari titik nol.
 *
 * Nol ada di tengah, bukan di kiri. Skor negatif dan positif adalah dua arah
 * dari satu titik acuan yang sama, dan batang yang tumbuh dari tepi kiri
 * membuat −2 terlihat seperti "sedikit", padahal artinya berlawanan dari +2.
 */
function Diverging({ value }: { value: number }) {
  const magnitude = Math.min(1, Math.abs(value) / 10)
  return (
    <span className="diverge" role="img" aria-label={`skor ${value.toFixed(1)} dari rentang -10 sampai 10`}>
      <span className="diverge-half left">
        {value < 0 && <span className="diverge-fill down" style={{ width: `${magnitude * 100}%` }} />}
      </span>
      <span className="diverge-axis" />
      <span className="diverge-half right">
        {value > 0 && <span className="diverge-fill up" style={{ width: `${magnitude * 100}%` }} />}
      </span>
    </span>
  )
}

function tone(score: number): string {
  if (score > 0.5) return 'up'
  if (score < -0.5) return 'down'
  return 'flat'
}
