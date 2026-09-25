import Link from 'next/link'
import { LandingPulseGrid, type PulseAsset } from '@/components/landing-pulse-grid'
import type { LatestScore } from '@/lib/db/queries'
import type { MarketNewsRow } from '@/lib/db/schema'
import { FEATURES } from '@/lib/features/registry'
import { LandingMarketChart, type MarketSample } from '@/components/landing-market-chart'

/*
 * Seksi beranda di bawah hero.
 *
 * Satu aturan untuk semuanya: tiap seksi membuktikan sesuatu, bukan
 * mengklaimnya. Angka datang dari basis data saat halaman dirender; yang
 * tidak bisa dibuktikan dengan data ditulis sebagai batas, bukan sebagai
 * keunggulan. Tidak ada kata transaksi di mana pun — sistem ini melaporkan
 * apa kata datanya, bukan menyuruh orang membeli atau menjual.
 *
 * Tiap seksi punya bentuknya sendiri — batang proporsi, meter persentil, kartu
 * beranotasi — karena bentuk itulah yang membawa datanya. Seksi yang semuanya
 * berupa judul plus kotak berjajar terbaca sebagai templat, dan pembaca berhenti
 * membedakan mana yang penting.
 */

// ---------------------------------------------------------------------------
// Kerangka seksi
// ---------------------------------------------------------------------------

function SectionHead({
  label,
  title,
  sub,
}: {
  label: string
  title: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <header className="lp-head lp-reveal">
      <div>
        <p className="lp-label">{label}</p>
        <h2 className="lp-title">{title}</h2>
      </div>
      {sub && <p className="lp-sub">{sub}</p>}
    </header>
  )
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0
}

// ---------------------------------------------------------------------------
// 2 — Denyut pasar
// ---------------------------------------------------------------------------

export interface Breadth {
  up: number
  down: number
  flat: number
}

export function PulseSection({
  pool,
  pricedCount,
  ageLabel,
  breadth,
}: {
  pool: PulseAsset[]
  pricedCount: number
  ageLabel: string
  breadth: Breadth
}) {
  if (pool.length === 0) return null
  const total = breadth.up + breadth.down + breadth.flat

  return (
    <section className="lp" id="denyut">
      <div className="lp-inner">
        <SectionHead
          label="Denyut pasar"
          title={
            <>
              {pricedCount.toLocaleString('id-ID')} instrumen,
              <br />
              <span>diperbarui {ageLabel}</span>
            </>
          }
          sub="Kripto, saham IDX dan AS, emas, komoditas, dan indeks global. Harga harian disimpan apa adanya, lengkap dengan stempel waktu pengambilannya."
        />

        {total > 0 && (
          <div className="lp-breadth lp-reveal" aria-label="Sebaran arah harga pada candle terakhir">
            <div className="lp-breadth-bar">
              <span className="up" style={{ width: `${pct(breadth.up, total)}%` }} />
              <span className="flat" style={{ width: `${pct(breadth.flat, total)}%` }} />
              <span className="down" style={{ width: `${pct(breadth.down, total)}%` }} />
            </div>
            <p className="lp-breadth-legend">
              <span className="up">{breadth.up.toLocaleString('id-ID')} naik</span>
              <span className="flat">{breadth.flat.toLocaleString('id-ID')} datar</span>
              <span className="down">{breadth.down.toLocaleString('id-ID')} turun</span>
              <span className="note">pada candle terakhir tiap instrumen</span>
            </p>
          </div>
        )}

        <div className="lp-reveal">
          <LandingPulseGrid pool={pool} />
        </div>
        <p className="lp-note">
          Harga penutupan harian, bukan realtime. Sumber gratis punya jeda 15 menit sampai
          beberapa jam, dan itu disebutkan di sini supaya tidak ada yang salah kira.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3 — Contoh kartu skor, beranotasi
// ---------------------------------------------------------------------------

/** Rentang harus sama dengan `HORIZONS` di lib/scoring/weights.ts — itulah jarak yang diuji backtest. */
const HORIZON = {
  pendek: { title: 'Pendek', range: '±1 minggu' },
  menengah: { title: 'Menengah', range: '±1 kuartal' },
  panjang: { title: 'Panjang', range: '±1 tahun' },
} as const

/** Skala tampilan skor; sama dengan panel skor di terminal. */
const SCORE_SCALE = 10

interface Driver {
  label: string
  percentile: number | null
  contribution: number
}

function driversOf(score: LatestScore): { supporting: Driver[]; opposing: Driver[] } {
  const raw = score.drivers as { supporting?: Driver[]; opposing?: Driver[] }
  return { supporting: raw.supporting ?? [], opposing: raw.opposing ?? [] }
}

function formatScore(value: number): string {
  const text = Math.abs(value).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value >= 0 ? '+' : '−'}${text}`
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Penanda yang menautkan bagian kartu ke catatan di sebelahnya. */
function Marker({ n }: { n: number }) {
  return (
    <span className="lp-marker" aria-hidden="true">
      {n}
    </span>
  )
}

const SCORE_NOTES = [
  {
    title: 'Tiga horizon, tiga jawaban',
    body: 'Tiap horizon punya bobot sendiri. Skor pendek yang tinggi tidak berarti apa-apa untuk setahun ke depan.',
  },
  {
    title: 'Keyakinan mengukur datanya',
    body: 'Bukan seberapa menarik asetnya, melainkan seberapa lengkap data di balik skornya.',
  },
  {
    title: 'Penentang selalu ditampilkan',
    body: 'Yang cuma menunjukkan alasan setuju itu alat jualan, bukan alat analisis.',
  },
  {
    title: 'Peluang dibiarkan kosong',
    body: 'Skor belum dikalibrasi ke hasil historis, jadi belum berhak diterjemahkan jadi persen.',
  },
]

export function ScoreCardSection({
  symbol,
  name,
  scores,
  modelVersion,
}: {
  symbol: string
  name: string
  scores: LatestScore[]
  modelVersion: string
}) {
  if (scores.length === 0) return null

  const order = { pendek: 0, menengah: 1, panjang: 2 }
  const sorted = [...scores].sort((a, b) => order[a.horizon] - order[b.horizon])
  const asOf = sorted.reduce((latest, s) => (s.date > latest ? s.date : latest), sorted[0].date)
  // Pendukung dan penentang diambil dari horizon pendek: yang paling sering
  // dibaca, dan yang daftar penggeraknya paling lengkap.
  const { supporting, opposing } = driversOf(sorted[0])
  const calibrated = sorted.some((s) => s.probability !== null)

  return (
    <section className="lp lp-alt" id="contoh">
      <div className="lp-inner">
        <SectionHead
          label="Contoh keluaran"
          title="Beginilah bentuk penilaiannya"
          sub="Kartu di bawah adalah data sungguhan dari basis data, bukan tangkapan layar yang dirapikan."
        />

        <div className="lp-specimen">
          <article className="lp-score lp-reveal">
            <header className="lp-score-head">
              <div>
                <p className="lp-score-symbol">{symbol}</p>
                <p className="lp-score-name">{name}</p>
              </div>
              <p className="lp-score-asof">
                data per {formatDay(asOf)}
                <span>model {modelVersion}</span>
              </p>
            </header>

            <div className="lp-score-rows">
              <p className="lp-score-caption">
                <Marker n={1} /> Skor per horizon
                <span className="lp-score-caption-right">
                  <Marker n={2} /> keyakinan
                </span>
              </p>
              {sorted.map((s) => {
                const width = Math.min(1, Math.abs(s.score) / SCORE_SCALE) * 50
                return (
                  <div key={s.horizon} className="lp-score-row">
                    <div className="lp-score-hz">
                      <span>{HORIZON[s.horizon].title}</span>
                      <span className="dim">{HORIZON[s.horizon].range}</span>
                    </div>
                    <div className="lp-score-track" aria-hidden="true">
                      <span className="lp-score-zero" />
                      <span
                        className={`lp-score-fill ${s.score >= 0 ? 'pos' : 'neg'}`}
                        style={
                          s.score >= 0
                            ? { left: '50%', width: `${width}%` }
                            : { right: '50%', width: `${width}%` }
                        }
                      />
                    </div>
                    <span className={`lp-score-value ${s.score >= 0 ? 'pos' : 'neg'}`}>
                      {formatScore(s.score)}
                    </span>
                    <span className="lp-score-conf">{s.confidence}</span>
                  </div>
                )
              })}
            </div>

            <div className="lp-score-drivers">
              <DriverList title="Pendukung" drivers={supporting} tone="pos" />
              <DriverList title="Penentang" drivers={opposing} tone="neg" marker={3} />
            </div>

            <p className="lp-score-prob">
              <span>
                <Marker n={4} /> Peluang naik
              </span>
              {calibrated ? 'tersedia di terminal' : 'belum tersedia — belum dikalibrasi'}
            </p>
          </article>

          <ol className="lp-notes">
            {SCORE_NOTES.map((note, i) => (
              <li key={note.title} className="lp-reveal" style={{ '--d': i } as React.CSSProperties}>
                <Marker n={i + 1} />
                <div>
                  <h3>{note.title}</h3>
                  <p>{note.body}</p>
                </div>
              </li>
            ))}
            <li className="lp-notes-link lp-reveal">
              <Link href={`/ringkasan?symbol=${encodeURIComponent(symbol)}`} className="lp-link">
                Lihat {symbol} di terminal
              </Link>
            </li>
          </ol>
        </div>
      </div>
    </section>
  )
}

function DriverList({
  title,
  drivers,
  tone,
  marker,
}: {
  title: string
  drivers: Driver[]
  tone: 'pos' | 'neg'
  marker?: number
}) {
  return (
    <div className="lp-drivers">
      <p className="lp-drivers-title">
        {marker && <Marker n={marker} />} {title}
      </p>
      {drivers.length === 0 ? (
        <p className="lp-drivers-empty">Tidak ada yang menonjol</p>
      ) : (
        <ul>
          {drivers.slice(0, 3).map((d) => (
            <li key={d.label}>
              <span className="lp-drivers-label">{d.label}</span>
              {d.percentile !== null && (
                <span className="lp-meter" aria-label={`persentil ${Math.round(d.percentile * 100)}`}>
                  <span className="lp-meter-track">
                    <span
                      className={`lp-meter-fill ${tone}`}
                      style={{ width: `${Math.round(d.percentile * 100)}%` }}
                    />
                  </span>
                  <span className="lp-meter-value">p{Math.round(d.percentile * 100)}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4 — Cara kerja
// ---------------------------------------------------------------------------

export const WORKFLOW = [
  {
    title: 'Tarik data harga',
    desc: 'Candle harian ditarik dari Binance untuk kripto dan Yahoo Finance untuk saham, emas, komoditas, dan indeks, lalu disimpan apa adanya.',
    foot: 'Tiap candle berstempel waktu',
    chip: 'OHLCV + waktu ambil',
  },
  {
    title: 'Hitung fitur terukur',
    desc: 'Rasio volume, jarak ke SMA20/50/200, volatilitas, dan drawdown dihitung ulang tiap hari dari riwayat instrumen itu sendiri.',
    foot: 'Persentil terhadap riwayat 2 tahun',
    chip: `${FEATURES.length} fitur`,
  },
  {
    title: 'Gelar sidang komite',
    desc: 'Empat agen membaca fakta yang sama lalu berdebat: analis melapor, strateg menyusun tesis, pengawas risiko mencari celahnya.',
    foot: 'Transkrip tersimpan utuh',
    chip: '4 agen',
  },
  {
    title: 'Catat pembacaan',
    desc: 'Ketua menimbang perdebatan dan menuliskan pembacaan atas bukti. Fakta saat memutuskan ikut dibekukan, dan tidak pernah ditulis ulang.',
    foot: 'Rekam jejak tidak bisa dirapikan',
    chip: 'dibekukan',
  },
]

export function WorkflowSection() {
  return (
    <section className="lp" id="cara-kerja">
      <div className="lp-inner">
        <SectionHead
          label="Cara kerja"
          title="Empat tahap, semuanya bisa diperiksa"
          sub="Tidak ada langkah yang disembunyikan. Tiap angka di layar bisa ditelusuri mundur sampai candle mentahnya."
        />
        <ol className="lp-flow">
          {WORKFLOW.map((step, i) => (
            <li key={step.title} className="lp-reveal" style={{ '--d': i } as React.CSSProperties}>
              <div className="lp-flow-top">
                <span className="lp-flow-no">{String(i + 1).padStart(2, '0')}</span>
                <span className="lp-flow-chip">{step.chip}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
              <p className="lp-flow-foot">{step.foot}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 6 — Batas sistem
// ---------------------------------------------------------------------------

export function LimitsSection({
  insufficient,
  totalScores,
  chartSamples,
}: {
  insufficient: number
  totalScores: number
  chartSamples: MarketSample[]
}) {
  const items = [
    {
      title: 'Belum ada angka peluang',
      body: 'Skor bisa mengurutkan mana yang lebih kuat, tapi belum berhak bilang "peluang naik 62%". Angka itu butuh kalibrasi terhadap hasil historis.',
    },
    {
      title: 'Bobotnya belum dikalibrasi',
      body: 'Bobot antar kelompok fitur dipilih dari rancangan awal, belum dari hasil historis. Ini juga tertulis di tiap halaman skor.',
    },
    {
      title: 'Bukan untuk day trading',
      body: 'Datanya harian dan berjeda. Kalau butuh data detik-per-detik, platform ini bukan jawabannya.',
    },
  ]

  return (
    <section className="lp lp-limits" id="batas">
      <div className="lp-inner">
        <SectionHead
          label="Batas sistem"
          title="Yang belum bisa dilakukan sistem ini"
          sub="Ditulis di beranda, bukan disembunyikan di halaman syarat."
        />

        <div className="lp-limits-grid">
          <div className="lp-limits-left">
            {totalScores > 0 && (
              <div className="lp-limits-figure lp-reveal">
                <div className="lp-limits-top">
                  <p className="lp-limits-ratio">
                    <span className="big">{insufficient.toLocaleString('id-ID')}</span>
                    <span className="of">/ {totalScores.toLocaleString('id-ID')}</span>
                  </p>
                  <p className="lp-limits-caption">
                    skor terbaru berlabel <strong>&ldquo;tidak memadai&rdquo;</strong>
                  </p>
                </div>

                {/* Satu kotak per skor. Yang menyala adalah yang tidak memadai. */}
                <div
                  className="lp-waffle"
                  role="img"
                  aria-label={`${insufficient} dari ${totalScores} skor tidak memadai`}
                >
                  {Array.from({ length: totalScores }, (_, i) => (
                    <span
                      key={i}
                      className={i < insufficient ? 'on' : undefined}
                      style={i < insufficient ? ({ '--i': i } as React.CSSProperties) : undefined}
                    />
                  ))}
                </div>

                <p className="lp-waffle-legend">
                  <span className="on">tidak memadai</span>
                  <span>tinggi, sedang, atau rendah</span>
                </p>
                <p className="lp-limits-why">
                  Sebagian besar karena data laporan keuangan belum ditarik. Ditampilkan apa
                  adanya, bukan diisi angka asal.
                </p>
              </div>
            )}

            <ul className="lp-limit-list">
              {items.map((item, i) => (
                <li key={item.title} className="lp-reveal" style={{ '--d': i } as React.CSSProperties}>
                  <span className="lp-limit-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" />
                      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div>
                    <h3>
                      {item.title}
                      <span className="lp-limit-status">belum</span>
                    </h3>
                    <p>{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {chartSamples.length > 0 && <LandingMarketChart samples={chartSamples} />}
        </div>

        <p className="lp-limits-close lp-reveal">
          Semua ini akan berubah seiring sistemnya dibangun. Yang tidak akan berubah: halaman ini
          akan selalu menyebutkan apa yang belum bisa.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 7 — Cakupan
// ---------------------------------------------------------------------------

const ASSET_CLASSES = [
  { key: 'saham', tab: 'saham', label: 'Saham', desc: 'Emiten bursa Indonesia dan Amerika Serikat.' },
  { key: 'crypto', tab: 'crypto', label: 'Kripto', desc: 'Aset digital utama dan meme coin, harga spot 24 jam.' },
  { key: 'indeks', tab: 'indeks', label: 'Indeks', desc: 'Indeks acuan pasar global dan regional.' },
  { key: 'komoditi', tab: 'komoditi', label: 'Komoditas', desc: 'Minyak mentah, gas alam, dan komoditas energi global.' },
  { key: 'emas', tab: 'emas', label: 'Emas', desc: 'Emas spot dan kontrak berjangka logam mulia.' },
] as const

export type CoverageCounts = Record<(typeof ASSET_CLASSES)[number]['key'], number> & { total: number }

export function CoverageSection({ counts }: { counts: CoverageCounts }) {
  if (counts.total === 0) return null
  return (
    <section className="lp lp-alt" id="cakupan">
      <div className="lp-inner">
        <SectionHead
          label="Cakupan"
          title={`${counts.total.toLocaleString('id-ID')} instrumen, lima kelas aset`}
          sub="Hanya instrumen yang benar-benar punya riwayat harga tersimpan yang dihitung di sini."
        />

        <div className="lp-mix lp-reveal" aria-hidden="true">
          {ASSET_CLASSES.map((c, i) => (
            <span
              key={c.key}
              className={`lp-mix-seg s${i}`}
              style={{ flexGrow: counts[c.key] }}
              title={`${c.label}: ${counts[c.key]}`}
            />
          ))}
        </div>

        <ul className="lp-coverage">
          {ASSET_CLASSES.map((c, i) => (
            <li key={c.key} className="lp-reveal" style={{ '--d': i } as React.CSSProperties}>
              <Link href={`/ringkasan?tab=${c.tab}`}>
                <span className={`lp-coverage-swatch s${i}`} aria-hidden="true" />
                <span className="lp-coverage-count">{counts[c.key].toLocaleString('id-ID')}</span>
                <span className="lp-coverage-label">
                  {c.label}
                  <span className="lp-coverage-share">
                    {Math.round(pct(counts[c.key], counts.total))}%
                  </span>
                </span>
                <span className="lp-coverage-desc">{c.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="lp-note">
          Indeks, komoditas, dan emas tidak punya laporan keuangan, jadi penilaian jangka
          panjangnya memakai kerangka berbeda — bukan kekurangan yang akan diperbaiki, melainkan
          sifat asetnya.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 8 — Warta
// ---------------------------------------------------------------------------

export function NewsSection({ news }: { news: MarketNewsRow[] }) {
  if (news.length === 0) return null
  return (
    <section className="lp" id="warta">
      <div className="lp-inner">
        <SectionHead
          label="Warta pasar"
          title="Berita, dengan skor dampak dan kaitan ke emitennya"
          sub="Tiap berita diklasifikasi jenis peristiwanya dan dikaitkan ke instrumen yang terdampak."
        />
        <ul className="lp-news">
          {news.slice(0, 3).map((n, i) => (
            <li key={n.id} className="lp-reveal" style={{ '--d': i } as React.CSSProperties}>
              <Link href={`/warta/${n.slug}`}>
                <div className="lp-news-media">
                  {n.featuredImage?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.featuredImage.url} alt={n.featuredImage.alt ?? ''} loading="lazy" />
                  ) : (
                    <span className="lp-news-placeholder" aria-hidden="true" />
                  )}
                  <span className="lp-news-impact">
                    dampak <strong>{n.impactScore}</strong>/10
                  </span>
                </div>
                <div className="lp-news-body">
                  <p className="lp-news-meta">{n.category.replace(/-/g, ' ')}</p>
                  <h3>{n.title}</h3>
                  {n.mentionedSymbols.length > 0 && (
                    <p className="lp-news-symbols">
                      {n.mentionedSymbols.slice(0, 4).map((s) => (
                        <span key={s}>{s}</span>
                      ))}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="lp-note">
          <Link href="/warta" className="lp-link">
            Semua warta
          </Link>
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 9 — Akses & tanya jawab
// ---------------------------------------------------------------------------

const FAQ = [
  {
    q: 'Apakah ini memberi rekomendasi beli atau jual?',
    a: 'Tidak, dan itu bukan sekadar formalitas hukum. Sistem ini melaporkan apa kata datanya; keputusan transaksi butuh hal-hal yang tidak diketahui sistem — kondisi keuangan Anda, toleransi risiko, jangka waktu, dan pajak. Karena itu penilaiannya ditulis sebagai bukti positif, berimbang, negatif, atau tidak dinilai.',
  },
  {
    q: 'Seberapa sering penilaiannya benar?',
    a: 'Uji historis (backtest) sudah dijalankan, dan hasilnya ditampilkan apa adanya di halaman Backtest — termasuk horizon yang hasilnya belum lebih baik dari tebakan naif. Selama belum lebih baik, angka peluang tidak akan ditampilkan.',
  },
  {
    q: 'Dari mana datanya diambil?',
    a: 'Binance untuk kripto, Yahoo Finance untuk saham IDX dan AS, emas, komoditas, dan indeks. Tiap candle disimpan beserta waktu pengambilannya, jadi umur data selalu bisa diperiksa.',
  },
  {
    q: 'Kenapa sebagian aset "tidak dinilai"?',
    a: 'Karena normalisasinya memakai riwayat dua tahun instrumen itu sendiri. Instrumen yang riwayatnya masih pendek menghasilkan angka yang belum layak dipercaya, dan menampilkan skor yang belum teruji lebih berbahaya daripada tidak menampilkan apa pun.',
  },
  {
    q: 'Apakah penilaian lama diperbarui kalau harganya berubah?',
    a: 'Tidak pernah. Fakta yang dilihat komite saat menilai dibekukan bersama penilaiannya. Menilai ulang dengan harga hari ini akan membuat semua penilaian lama tampak keliru, padahal yang berubah hanyalah harganya.',
  },
  {
    q: 'Apa yang terjadi kalau sumber datanya bermasalah?',
    a: 'Data yang lewat batas umur ditandai "basi" terang-terangan, dan baris yang gagal validasi masuk karantina alih-alih diam-diam dipakai.',
  },
]

export function AccessFaqSection() {
  return (
    <section className="lp lp-alt" id="akses">
      <div className="lp-inner lp-faq-layout">
        <div>
          <SectionHead
            label="Akses"
            title="Gratis, tanpa paket berbayar"
            sub="Terminal, grafik, warta, dan transkrip sidang cukup dibuka dengan akun gratis."
          />
          <ul className="lp-access lp-reveal">
            <li>Tanpa kartu kredit</li>
            <li>Tanpa masa percobaan</li>
            <li>Tanpa fitur yang dikunci di balik pembayaran</li>
          </ul>
        </div>
        <div className="lp-faq lp-reveal">
          {FAQ.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 10 — Penutup & kaki halaman
// ---------------------------------------------------------------------------

export function ClosingSection({
  terminalHref,
  terminalLabel,
}: {
  terminalHref: string
  terminalLabel: string
}) {
  return (
    <section className="lp lp-closing">
      <div className="lp-closing-glow" aria-hidden="true" />
      <div className="lp-inner lp-reveal">
        <h2 className="lp-closing-title">Lihat sendiri datanya</h2>
        <p className="lp-closing-sub">Tanpa kartu kredit, tanpa masa percobaan.</p>
        <div className="lp-closing-actions">
          <Link href={terminalHref} className="nextai-btn-white">
            {terminalLabel}
          </Link>
          <Link href="/metodologi" className="nextai-btn-ghost">
            Baca Metodologi
          </Link>
        </div>
      </div>
    </section>
  )
}

export function LandingDisclaimerFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-inner">
        <div className="lp-footer-top">
          <p className="lp-footer-brand">Komite</p>
          <nav className="lp-footer-links" aria-label="Tautan kaki">
            <Link href="/ringkasan">Terminal</Link>
            <Link href="/instruments">Instrumen</Link>
            <Link href="/warta">Warta</Link>
            <Link href="/metodologi">Metodologi</Link>
            <Link href="/panduan">Panduan</Link>
          </nav>
        </div>
        <p className="lp-disclaimer">
          Seluruh data dan skor di platform ini disajikan untuk tujuan informasi dan edukasi. Ini
          bukan rekomendasi untuk membeli atau menjual efek apa pun. Kinerja masa lalu tidak
          menjamin hasil di masa depan. Investasi di pasar modal mengandung risiko kehilangan
          sebagian atau seluruh modal. Keputusan investasi sepenuhnya menjadi tanggung jawab Anda.
        </p>
        <p className="lp-copyright">© {new Date().getFullYear()} Komite Investasi AI</p>
      </div>
    </footer>
  )
}
