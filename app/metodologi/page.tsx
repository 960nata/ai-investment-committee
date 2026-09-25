import type { Metadata } from 'next'
import Link from 'next/link'
import { FEATURES, type FeatureGroup } from '@/lib/features/registry'
import {
  GROUP_LABELS,
  GROUP_WEIGHTS,
  GROUPS_WITHOUT_FEATURES,
  GROUPS_PARTIAL,
  HORIZONS,
  MODEL_VERSION,
  type ScoreGroup,
} from '@/lib/scoring/weights'
import { STALE_AFTER_MINUTES } from '@/lib/db/queries'
import { VERDICT_LABEL, VERDICT_MEANING, type VerdictValue } from '@/lib/format/verdict'
import { LandingDisclaimerFooter, WORKFLOW } from '@/components/landing-sections'

export const metadata: Metadata = {
  title: 'Metodologi',
  description:
    'Cara kerja sistem, rumus yang dipakai, sumber data beserta jedanya, dan apa yang belum bisa dilakukan.',
}

/*
 * Halaman metodologi.
 *
 * Di produk yang jualannya keterbukaan, ini halaman terpenting kedua setelah
 * terminal. Isinya dibaca langsung dari kode yang menghitung — daftar fitur,
 * bobot, horizon — bukan disalin ke sini dengan tangan. Salinan tangan
 * menyimpang dari kodenya dalam hitungan minggu, dan halaman metodologi yang
 * keliru lebih buruk daripada tidak ada.
 */

const FEATURE_GROUP_LABEL: Record<FeatureGroup, string> = {
  tren: 'Tren',
  momentum: 'Momentum',
  volatilitas: 'Volatilitas',
  volume: 'Volume',
  struktur: 'Struktur harga',
  relatif: 'Kekuatan relatif',
  valuasi: 'Valuasi',
  kualitas: 'Kualitas & pertumbuhan',
  kepemilikan: 'Kepemilikan (KSEI)',
}

const ROLE_LABEL = {
  score: 'masuk skor',
  modifier: 'pengubah keyakinan',
  display: 'hanya ditampilkan',
} as const

const DIRECTION_LABEL = (d: 1 | -1 | null) =>
  d === 1 ? 'lebih tinggi lebih baik' : d === -1 ? 'lebih rendah lebih baik' : 'arah belum ditetapkan'

const SOURCES = [
  {
    what: 'Harga kripto',
    source: 'Binance Spot (API publik)',
    cadence: 'Candle harian',
    note: 'Riwayat mulai dari tanggal koin terdaftar di Binance.',
  },
  {
    what: 'Saham IDX & AS, emas, komoditas, indeks',
    source: 'Yahoo Finance',
    cadence: 'Candle harian, harga tersesuaikan aksi korporasi',
    note: 'Bukan API resmi. Jeda 15 menit sampai beberapa jam, dan bentuk jawabannya bisa berubah tanpa pemberitahuan.',
  },
  {
    what: 'Laporan keuangan emiten AS',
    source: 'SEC EDGAR',
    cadence: 'Per kuartal dan tahunan',
    note: 'Emiten IDX belum punya sumber laporan keuangan, jadi kelompok valuasinya masih kosong.',
  },
  {
    what: 'Warta pasar',
    source: 'Diolah agen warta dari berita publik',
    cadence: 'Berkala',
    note: 'Diberi skor dampak 1–10 dan dikaitkan ke instrumen yang disebut.',
  },
]

const SCORE_GROUPS = Object.keys(GROUP_LABELS) as ScoreGroup[]

export default function MethodologyPage() {
  const byGroup = new Map<FeatureGroup, typeof FEATURES>()
  for (const f of FEATURES) {
    const list = byGroup.get(f.group)
    if (list) list.push(f)
    else byGroup.set(f.group, [f])
  }

  return (
    <div className="landing-shell">
      <header className="md-bar">
        <div className="md-bar-inner">
          <Link href="/" className="md-brand">
            Komite
          </Link>
          <nav aria-label="Navigasi metodologi">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#rumus">Rumus</a>
            <a href="#sumber-data">Sumber data</a>
            <a href="#batas">Batas</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp md-hero">
          <div className="lp-inner">
            <p className="lp-label">Metodologi</p>
            <h1 className="md-title">Dari candle mentah sampai penilaian tertulis</h1>
            <p className="md-lede">
              Semua yang dihitung sistem ini, dari mana datanya, dan apa yang belum bisa. Daftar
              fitur dan bobot di halaman ini dibaca langsung dari kode yang menghitungnya, jadi
              tidak bisa menyimpang darinya.
            </p>
            <p className="md-version">versi model {MODEL_VERSION}</p>
          </div>
        </section>

        <section className="lp" id="cara-kerja">
          <div className="lp-inner">
            <p className="lp-label">Cara kerja</p>
            <h2 className="lp-title">Empat tahap</h2>
            <ol className="lp-steps md-steps">
              {WORKFLOW.map((step, i) => (
                <li key={step.title}>
                  <span className="lp-step-no">{i + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                  <p className="lp-step-foot">{step.foot}</p>
                </li>
              ))}
            </ol>

            <h3 className="md-h3">Arti tiap penilaian</h3>
            <dl className="md-verdicts">
              {(Object.keys(VERDICT_LABEL) as VerdictValue[]).map((v) => (
                <div key={v}>
                  <dt>{VERDICT_LABEL[v]}</dt>
                  <dd>{VERDICT_MEANING[v]}</dd>
                </div>
              ))}
            </dl>
            <p className="lp-note">
              Penilaian ini laporan tentang arah bukti, bukan anjuran membeli atau menjual.
            </p>
          </div>
        </section>

        <section className="lp" id="rumus">
          <div className="lp-inner">
            <p className="lp-label">Rumus yang dipakai</p>
            <h2 className="lp-title">Bobot per horizon</h2>
            <p className="md-text">
              Tiap horizon punya bobot kelompok sendiri. Bobot ini{' '}
              <strong>belum dikalibrasi</strong>: ia titik awal dari rancangan, belum hasil
              pengukuran terhadap data historis. Kelompok tanpa fitur tetap dihitung sebagai lubang
              yang menurunkan keyakinan, bukan dihapus diam-diam.
            </p>

            <div className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr>
                    <th scope="col">Kelompok</th>
                    {HORIZONS.map((h) => (
                      <th key={h.id} scope="col" className="num">
                        {h.label}
                        <span>{h.days} hari bursa</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCORE_GROUPS.map((g) => (
                    <tr key={g}>
                      <th scope="row">
                        {GROUP_LABELS[g]}
                        {GROUPS_WITHOUT_FEATURES.includes(g) && (
                          <span className="md-flag">belum ada fitur</span>
                        )}
                        {GROUPS_PARTIAL[g] && (
                          <span className="md-flag" title={GROUPS_PARTIAL[g]}>
                            sebagian pasar
                          </span>
                        )}
                      </th>
                      {HORIZONS.map((h) => (
                        <td key={h.id} className="num">
                          {Math.round(GROUP_WEIGHTS[h.id][g] * 100)}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="md-h3">Normalisasi</h3>
            <p className="md-text">
              Fitur yang ditandai &ldquo;dinormalisasi&rdquo; disimpan juga sebagai robust z-score
              dan persentil terhadap riwayat dua tahun instrumen itu sendiri. Artinya
              &ldquo;persentil 99&rdquo; berarti nilai hari ini lebih tinggi dari 99% hari dalam
              dua tahun terakhir <em>untuk aset itu</em>, bukan dibandingkan aset lain.
            </p>

            <h3 className="md-h3">
              Daftar fitur <span className="md-count">{FEATURES.length}</span>
            </h3>
            {[...byGroup.entries()].map(([group, features]) => (
              <div key={group} className="md-feature-group">
                <h4>{FEATURE_GROUP_LABEL[group]}</h4>
                <ul>
                  {features.map((f) => (
                    <li key={f.name}>
                      <div className="md-feature-head">
                        <span className="md-feature-label">{f.label}</span>
                        <code>{f.name}</code>
                      </div>
                      <p>{f.rationale}</p>
                      <p className="md-feature-meta">
                        {ROLE_LABEL[f.role]}
                        {f.role === 'score' && ` · ${DIRECTION_LABEL(f.direction)}`}
                        {f.normalise && ' · dinormalisasi'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="lp" id="sumber-data">
          <div className="lp-inner">
            <p className="lp-label">Sumber data</p>
            <h2 className="lp-title">Dari mana tiap angka diambil</h2>
            <div className="md-table-wrap">
              <table className="md-table md-sources">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Sumber</th>
                    <th scope="col">Frekuensi</th>
                    <th scope="col">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.what}>
                      <th scope="row">{s.what}</th>
                      <td>{s.source}</td>
                      <td>{s.cadence}</td>
                      <td className="dim">{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="md-text">
              Tiap candle disimpan beserta waktu pengambilannya. Bila candle terbaru lebih tua dari{' '}
              {STALE_AFTER_MINUTES / 60} jam, data ditandai basi. Baris yang gagal validasi —
              misalnya lompatan harga yang mustahil — masuk karantina, tidak dipakai diam-diam.
            </p>
          </div>
        </section>

        <section className="lp" id="batas">
          <div className="lp-inner">
            <p className="lp-label">Batas &amp; keterbukaan</p>
            <h2 className="lp-title">Kenapa angka peluang belum ada</h2>
            <p className="md-text">
              Skor bisa mengurutkan mana yang lebih kuat, tapi belum berhak diterjemahkan jadi
              &ldquo;peluang naik sekian persen&rdquo;. Angka seperti itu butuh kalibrasi terhadap
              hasil historis. Uji historis sudah dijalankan, dan untuk sebagian horizon hasilnya
              belum lebih baik dari tebakan naif. Selama itu belum berubah, kolom peluang dibiarkan
              kosong.
            </p>
            <p className="md-text">
              Keterbatasan lain disebutkan di{' '}
              <Link href="/#batas" className="lp-link">
                beranda
              </Link>
            </p>
          </div>
        </section>
      </main>

      <LandingDisclaimerFooter />
    </div>
  )
}
