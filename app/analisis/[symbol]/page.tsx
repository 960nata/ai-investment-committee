import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { ScoreCardSection } from '@/components/landing-sections'
import { CandlestickChart } from '@/components/candlestick-chart'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import {
  getCandles,
  getLatestScoredModelVersion,
  getLatestScoresForSymbol,
  listInstrumentQuotes,
} from '@/lib/db/queries'
import { listLatestVerdictByInstrument } from '@/lib/db/member-queries'
import { MODEL_VERSION } from '@/lib/scoring/weights'
import { formatPriceIn } from '@/lib/format/market'
import { verdictLabel } from '@/lib/format/verdict'
import { ASSET_CLASS_LABEL } from '@/lib/member/labels'
import { SITE_NAME } from '@/lib/brand'
import './analisis.css'

/**
 * Halaman analisis publik per instrumen — tanpa login.
 *
 * Sebelumnya semua yang bernilai ada di balik login, jadi tidak ada satu pun
 * halaman instrumen yang bisa ditemukan mesin pencari, dan pengunjung baru
 * diminta mendaftar sebelum melihat apa pun. Di sini mereka melihat grafik,
 * skor tiga horizon beserta penggeraknya, dan putusan komite terakhir. Alat
 * yang butuh akun (watchlist, alert, sidang komite) tetap di terminal.
 */

export const dynamic = 'force-dynamic'

const CHART_DAYS = 400

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Simbol datang terkode di URL (`%5EJKSE`, `GC%3DF`); di sini dikembalikan apa adanya. */
function decodeSymbol(raw: string): string {
  try {
    return decodeURIComponent(raw).toUpperCase()
  } catch {
    return raw.toUpperCase()
  }
}

const getQuotes = unstable_cache(() => listInstrumentQuotes(), ['analisis-quotes'], { revalidate: 300 })

const getDetail = unstable_cache(
  async (symbol: string) => {
    const quotes = await getQuotes()
    const quote = quotes.find((q) => q.symbol.toUpperCase() === symbol)
    if (!quote) return null

    const version = (await getLatestScoredModelVersion(MODEL_VERSION).catch(() => null)) ?? MODEL_VERSION
    const [scores, candles, verdicts] = await Promise.all([
      getLatestScoresForSymbol(quote.symbol, version).catch(() => null),
      getCandles(quote.id, isoDaysAgo(CHART_DAYS), isoDaysAgo(0)).catch(() => []),
      listLatestVerdictByInstrument([quote.id]).catch(() => new Map()),
    ])

    const related = quotes
      .filter((q) => q.market === quote.market && q.id !== quote.id && q.candleCount > 0)
      .slice(0, 12)
      .map((q) => ({ symbol: q.symbol, name: q.name }))

    return {
      quote,
      version,
      scores: scores?.scores ?? [],
      verdict: verdicts.get(quote.id) ?? null,
      related,
      candles: candles.map((c) => ({
        date: c.date,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      })),
    }
  },
  ['analisis-detail'],
  { revalidate: 300 },
)

export async function generateMetadata({ params }: PageProps<'/analisis/[symbol]'>): Promise<Metadata> {
  const symbol = decodeSymbol((await params).symbol)
  const detail = await getDetail(symbol).catch(() => null)
  if (!detail) return { title: 'Instrumen tidak ditemukan', robots: { index: false } }

  const { quote } = detail
  const display = displaySymbol(quote.symbol)
  return {
    title: `Analisis ${display} (${quote.name}) — skor & peluang`,
    description:
      `Skor probabilistik ${display} ${quote.name} untuk horizon pendek, menengah, dan panjang, ` +
      `beserta penggerak, putusan komite AI, dan grafik harga. Data, bukan anjuran.`,
    alternates: { canonical: `/analisis/${encodeURIComponent(quote.symbol)}` },
    openGraph: {
      title: `Analisis ${display} — ${SITE_NAME}`,
      description: `Skor tiga horizon dan putusan komite AI untuk ${quote.name}.`,
      type: 'article',
    },
  }
}

/** "BBCA.JK" → "BBCA": akhiran bursa Yahoo tidak dikenal pembaca. */
function displaySymbol(symbol: string): string {
  return symbol.replace(/\.JK$/, '')
}

export default async function AnalisisPage({ params }: PageProps<'/analisis/[symbol]'>) {
  const symbol = decodeSymbol((await params).symbol)
  const [detail, user, isAdmin] = await Promise.all([
    getDetail(symbol),
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
  ])
  if (!detail) notFound()

  const { quote, scores, verdict, candles, related, version } = detail
  const display = displaySymbol(quote.symbol)
  const signedIn = Boolean(user) || isAdmin
  const terminal = `/ringkasan?symbol=${encodeURIComponent(quote.symbol)}`
  const watchHref = signedIn ? terminal : `/daftar?next=${encodeURIComponent(terminal)}`
  const change = quote.changePct

  return (
    <div className="landing-shell">
      <LandingNav isAdmin={isAdmin} user={user} />

      <main>
        <section className="lp an-hero">
          <div className="lp-inner">
            <p className="lp-label">
              {ASSET_CLASS_LABEL[quote.assetClass] ?? quote.assetClass} · {quote.market}
            </p>
            <h1 className="an-title">
              {display} <span>{quote.name}</span>
            </h1>
            <div className="an-quote">
              <strong>{formatPriceIn(quote.lastClose, quote.currency)}</strong>
              {change !== null && Number.isFinite(change) && (
                <span className={change >= 0 ? 'pos' : 'neg'}>
                  {change >= 0 ? '+' : '−'}
                  {Math.abs(change).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%
                </span>
              )}
              {quote.lastDate && <span className="an-asof">penutupan {quote.lastDate}</span>}
            </div>

            {candles.length > 1 && (
              <div className="an-chart">
                <CandlestickChart data={candles} range="6M" />
              </div>
            )}

            <div className="an-cta">
              <div>
                <h2>Pantau {display} tanpa harus membuka situs ini</h2>
                <p>
                  Tambahkan ke watchlist dan terima email saat skornya berubah, harga menembus batas yang Anda pasang,
                  atau putusan komite berganti. Gratis.
                </p>
              </div>
              <Link href={watchHref} className="nextai-btn-white">
                {signedIn ? 'Buka di terminal' : 'Daftar gratis & pantau'}
              </Link>
            </div>
          </div>
        </section>

        {scores.length > 0 ? (
          <ScoreCardSection
            symbol={quote.symbol}
            name={quote.name}
            scores={scores}
            modelVersion={version}
            more={{ href: watchHref, label: `Pantau ${display} di terminal` }}
            head={{
              label: 'Skor probabilistik',
              title: `Bagaimana bukti tentang ${display} saat ini?`,
              sub: 'Skor merangkum indikator teknikal, fundamental, sentimen, dan arus dana. Positif berarti bukti condong naik; besarnya bukan ramalan harga.',
            }}
          />
        ) : (
          <section className="lp lp-alt">
            <div className="lp-inner">
              <p className="lp-sub">Skor {display} belum tersedia — datanya belum cukup panjang untuk dinilai dengan jujur.</p>
            </div>
          </section>
        )}

        {verdict && (
          <section className="lp">
            <div className="lp-inner an-verdict">
              <p className="lp-label">Komite AI</p>
              <h2 className="lp-title">
                Putusan terakhir: {verdictLabel(verdict.verdict)}
                {verdict.confidence !== null && <span> · keyakinan {verdict.confidence}/100</span>}
              </h2>
              <p className="lp-sub">
                Empat agen dengan model berbeda memperdebatkan data {display}; sidang terakhir selesai{' '}
                {verdict.finishedAt.slice(0, 10)}. Transkrip lengkap tiap agen ada di terminal.
              </p>
              <Link href={watchHref} className="lp-link">
                Baca transkrip sidang
              </Link>
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="lp lp-alt">
            <div className="lp-inner">
              <p className="lp-label">Instrumen lain di pasar yang sama</p>
              <ul className="an-related">
                {related.map((r) => (
                  <li key={r.symbol}>
                    <Link href={`/analisis/${encodeURIComponent(r.symbol)}`}>
                      <strong>{displaySymbol(r.symbol)}</strong>
                      <span>{r.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="lp">
          <div className="lp-inner">
            <p className="lp-note">
              {SITE_NAME} adalah alat analisis data, bukan penasihat investasi. Skor dan putusan komite berupa peluang
              berdasarkan data historis, bukan anjuran membeli atau menjual. Data harga harian dapat tertunda.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
