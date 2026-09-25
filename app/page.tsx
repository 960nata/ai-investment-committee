import {
  listInstrumentQuotes,
  getCandles,
  getDataFreshness,
  getLatestScoresForSymbol,
  getLatestScoreConfidenceCounts,
  getLatestScoredModelVersion,
  describeAge,
  type InstrumentQuote,
} from '@/lib/db/queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { MODEL_VERSION } from '@/lib/scoring/weights'
import { LandingNav } from '@/components/landing-nav'
import { NextAiLanding } from '@/components/next-ai-landing'
import { LandingProtocol } from '@/components/landing-protocol'
import { LandingReveal } from '@/components/landing-reveal'
import type { PulseAsset } from '@/components/landing-pulse-grid'
import {
  AccessFaqSection,
  ClosingSection,
  CoverageSection,
  LandingDisclaimerFooter,
  LimitsSection,
  NewsSection,
  PulseSection,
  ScoreCardSection,
  WorkflowSection,
  type CoverageCounts,
} from '@/components/landing-sections'

export const dynamic = 'force-dynamic'

/** Instrumen yang kartu skornya dipajang di beranda. */
const SAMPLE_SYMBOL = 'BTCUSDT'

/** Rentang grafik lilin di seksi batas — sedikit lebih dari tiga bulan. */
const CHART_DAYS = 110

const CHART_SAMPLES = [
  { tab: 'Kripto', symbol: 'BTCUSDT' },
  { tab: 'Saham', symbol: 'BBCA.JK' },
  { tab: 'Emas', symbol: 'GC=F' },
  { tab: 'Indeks', symbol: '^JKSE' },
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Beranda.
 *
 * Tiap kueri di sini dipakai sesuatu di layar. Halaman ini dibuka paling sering
 * dan dirender ulang di tiap kunjungan; kueri yang hasilnya dibuang adalah
 * beban basis data yang dibayar tanpa mendapat apa-apa.
 */
export default async function LandingPage() {
  const scoredVersion =
    (await getLatestScoredModelVersion(MODEL_VERSION).catch(() => null)) ?? MODEL_VERSION

  const [instruments, latestNews, freshness, sample, confidence, isAdmin, session] =
    await Promise.all([
      listInstrumentQuotes().catch(() => []),
      getMarketNewsList({ limit: 6 }).catch(() => []),
      getDataFreshness().catch(() => null),
      getLatestScoresForSymbol(SAMPLE_SYMBOL, scoredVersion).catch(() => null),
      getLatestScoreConfidenceCounts(scoredVersion).catch(() => ({
        total: 0,
        byConfidence: {} as Record<string, number>,
      })),
      verifyAdminSession().catch(() => false),
      getCurrentUser(),
    ])

  // Cadangan pita harga di header ketika penenunan per kategori kosong.
  const navHighlights = [
    instruments.find((i) => i.symbol === 'BTCUSDT'),
    instruments.find((i) => i.symbol === 'ETHUSDT'),
    instruments.find((i) => i.symbol === 'SOLUSDT'),
    instruments.find((i) => i.symbol.startsWith('BBCA') || i.symbol.startsWith('BBRI')),
    instruments.find((i) => i.symbol === 'XAUUSD' || i.symbol === 'PAXGUSDT'),
    instruments.find((i) => i.symbol === 'BZ=F' || i.symbol === 'CL=F'),
  ].filter(Boolean) as InstrumentQuote[]

  // Grafik lilin di seksi batas: empat contoh, satu per kelas aset, dari candle
  // harian yang tersimpan. Contoh yang instrumennya tidak ada dilewati saja.
  const chartSamples = (
    await Promise.all(
      CHART_SAMPLES.map(async (sample) => {
        const inst = instruments.find((i) => i.symbol === sample.symbol)
        if (!inst) return null
        const rows = await getCandles(inst.id, isoDaysAgo(CHART_DAYS), isoDaysAgo(0)).catch(() => [])
        if (rows.length < 2) return null
        return {
          tab: sample.tab,
          symbol: inst.symbol,
          name: inst.name,
          currency: inst.currency,
          candles: rows.map((c) => ({
            date: c.date,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          })),
        }
      }),
    )
  ).filter((s) => s !== null)

  const pulsePool = buildPulsePool(instruments)
  const withData = instruments.filter((i) => i.candleCount > 0)
  const priced = withData.filter((i) => i.lastClose !== null)

  // Arah tiap instrumen pada candle terakhirnya. "Datar" diberi ambang kecil
  // supaya pembulatan harga tidak dihitung sebagai gerakan.
  const breadth = { up: 0, down: 0, flat: 0 }
  for (const i of priced) {
    if (i.changePct === null || !Number.isFinite(i.changePct)) continue
    if (i.changePct > 0.05) breadth.up++
    else if (i.changePct < -0.05) breadth.down++
    else breadth.flat++
  }

  // Terminal butuh akun. Pengunjung tanpa akun diarahkan ke pendaftaran, bukan
  // ke terminal yang akan memantulkannya balik ke halaman masuk.
  const signedIn = Boolean(session) || isAdmin
  const terminalHref = signedIn ? '/ringkasan' : '/daftar'
  const terminalLabel = signedIn ? 'Terminal' : 'Buka Terminal'

  const freshnessLabel = freshness?.freshness === 'fresh' ? 'DATA SEGAR · TERHUBUNG' : 'DATA TERCATAT'

  return (
    <div className="landing-shell">
      <LandingNav
        instruments={instruments}
        topAssets={navHighlights}
        latestNews={latestNews}
        freshnessLabel={freshnessLabel}
        isFresh={freshness?.freshness === 'fresh'}
        isAdmin={isAdmin}
        user={session}
      />

      <NextAiLanding
        terminalHref={terminalHref}
        terminalLabel={terminalLabel}
        loginHref="/login"
        registerHref="/daftar"
        hideNav={true}
      />

      <PulseSection
        pool={pulsePool}
        pricedCount={priced.length}
        ageLabel={describeAge(freshness?.ageMinutes ?? null)}
        breadth={breadth}
      />

      {sample && (
        <ScoreCardSection
          symbol={SAMPLE_SYMBOL}
          name={sample.name}
          scores={sample.scores}
          modelVersion={scoredVersion}
        />
      )}

      <WorkflowSection />
      <LandingProtocol />

      <LimitsSection
        insufficient={confidence.byConfidence['tidak memadai'] ?? 0}
        totalScores={confidence.total}
        chartSamples={chartSamples}
      />

      <CoverageSection counts={countByClass(withData)} />
      <NewsSection news={latestNews} />
      <AccessFaqSection />
      <ClosingSection terminalHref={terminalHref} terminalLabel={terminalLabel} />
      <LandingDisclaimerFooter />
      <LandingReveal />
    </div>
  )
}

/** Simbol yang selalu tampil lebih dulu, berapa pun isi basis datanya. */
const PULSE_ANCHORS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'PAXGUSDT',
  'XAUUSD',
  'BBCA.JK',
  'BBRI.JK',
  'TLKM.JK',
  'ASII.JK',
  'BZ=F',
  'CL=F',
]

/**
 * Susun cadangan aset untuk kisi denyut pasar.
 *
 * Dua aturan, dan urutannya penting.
 *
 * Pertama, aset jangkar didahulukan — sepuluh kartu pembuka harus memuat nama
 * yang dikenali orang begitu halaman terbuka. Kisi yang dibuka dengan sepuluh
 * emiten lapis ketiga tidak memberi tahu siapa pun bahwa situs ini mengukur
 * pasar yang mereka pedulikan.
 *
 * Kedua, sisanya diambil bergiliran antar kelas aset, bukan berurutan. Basis
 * data ini berisi tiga ratus lebih saham dan tiga emas; mengambil apa adanya
 * berarti setelah putaran pertama seluruh kisi berubah jadi papan saham.
 *
 * Aset tanpa harga dibuang di awal. Kartu bertuliskan "—" bukan informasi.
 */
function buildPulsePool(instruments: InstrumentQuote[]): PulseAsset[] {
  const priced = instruments.filter(
    (i) => i.lastClose !== null && i.changePct !== null && Number.isFinite(i.changePct),
  )

  // Hanya empat bidang yang dibawa ke peramban; sisanya ditinggal di server.
  const slim = (i: InstrumentQuote): PulseAsset => ({
    symbol: i.symbol,
    assetClass: i.assetClass,
    lastClose: i.lastClose,
    changePct: i.changePct,
  })

  const bySymbol = new Map(priced.map((i) => [i.symbol, i]))
  const taken = new Set<string>()
  const pool: PulseAsset[] = []

  for (const symbol of PULSE_ANCHORS) {
    const asset = bySymbol.get(symbol)
    if (asset && !taken.has(symbol)) {
      pool.push(slim(asset))
      taken.add(symbol)
    }
  }

  // Sisanya dikelompokkan per kelas, lalu diambil satu-satu berputar.
  const byClass = new Map<string, InstrumentQuote[]>()
  for (const asset of priced) {
    if (taken.has(asset.symbol)) continue
    const bucket = byClass.get(asset.assetClass)
    if (bucket) bucket.push(asset)
    else byClass.set(asset.assetClass, [asset])
  }

  // Yang bergerak paling jauh didahulukan di tiap kelas: kalau kartunya cuma
  // sempat dilihat sekejap, yang layak muncul adalah yang paling ada kabarnya.
  for (const bucket of byClass.values()) {
    bucket.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
  }

  const buckets = [...byClass.values()]
  for (let round = 0; pool.length < PULSE_POOL_SIZE; round++) {
    let addedThisRound = false

    for (const bucket of buckets) {
      if (pool.length >= PULSE_POOL_SIZE) break
      const asset = bucket[round]
      if (!asset) continue
      pool.push(slim(asset))
      addedThisRound = true
    }

    if (!addedThisRound) break
  }

  return pool
}

/** Cukup untuk perputaran yang tidak cepat berulang, tanpa membengkakkan HTML. */
const PULSE_POOL_SIZE = 32

function countByClass(instruments: InstrumentQuote[]): CoverageCounts {
  const count = (...classes: string[]) =>
    instruments.filter((i) => classes.includes(i.assetClass)).length
  return {
    total: instruments.length,
    crypto: count('crypto', 'memecoin'),
    saham: count('saham'),
    emas: count('emas'),
    komoditi: count('komoditi'),
    indeks: count('indeks'),
  }
}
