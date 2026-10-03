import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { listInstrumentQuotes, getDataFreshness, type InstrumentQuote } from '@/lib/db/queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { HeroDust } from '@/components/hero-dust'
import { IconCalculator } from '@/components/icons'
import { KalkulatorClient } from './kalkulator-client'

/**
 * Kalkulator investasi publik — tanpa login.
 *
 * Hitungannya di peramban; hanya "Tanya AI" yang memanggil server, dan
 * panggilan itu dijaga Turnstile serta pagu anonim (lihat
 * app/api/v1/kalkulator/ask/route.ts).
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kalkulator Investasi',
  description:
    'Hitung investasi rutin, target dana, dana darurat, dan kenali profil risikomu — gratis, tanpa daftar. Tanya AI soal hasilnya.',
}

/** Kipas sinar radiant amber-emas di seksi hero. Didefinisikan lokal agar Server Component bebas ketergantungan Client Component. */
const CALC_BEAM_LAYERS = [
  { rot: 38, w: 190, blur: 46, peak: 0.55, len: 88, h: 620, dx: 0 },
  { rot: 47, w: 130, blur: 28, peak: 0.85, len: 94, h: 620, dx: 0 },
  { rot: 55, w: 150, blur: 15, peak: 1, len: 100, h: 620, dx: 0 },
  { rot: 62, w: 110, blur: 26, peak: 0.85, len: 92, h: 620, dx: 0 },
  { rot: 71, w: 170, blur: 42, peak: 0.5, len: 84, h: 620, dx: 0 },
  { rot: 48, w: 64, blur: 12, peak: 0.95, len: 100, h: 1180, dx: 62 },
]

export default async function KalkulatorPage() {
  const [user, isAdmin, instruments, latestNews, freshness] = await Promise.all([
    getCurrentUser().catch(() => null),
    verifyAdminSession().catch(() => false),
    listInstrumentQuotes().catch(() => []),
    getMarketNewsList({ limit: 6 }).catch(() => []),
    getDataFreshness().catch(() => null),
  ])

  const navHighlights = [
    instruments.find((i) => i.symbol === 'BTCUSDT'),
    instruments.find((i) => i.symbol === 'ETHUSDT'),
    instruments.find((i) => i.symbol === 'SOLUSDT'),
    instruments.find((i) => i.symbol?.startsWith('BBCA') || i.symbol?.startsWith('BBRI')),
    instruments.find((i) => i.symbol === 'XAUUSD' || i.symbol === 'PAXGUSDT'),
    instruments.find((i) => i.symbol === 'BZ=F' || i.symbol === 'CL=F'),
  ].filter(Boolean) as InstrumentQuote[]

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
        user={user}
      />

      <section className="calc-hero">
        {/* Dynamic Radiant Amber Aurora Beams & Volumetric Rays */}
        <div className="nextai-aurora-beam" aria-hidden="true" />
        <div className="nextai-aurora-glow" aria-hidden="true" />
        <div className="nextai-aurora-subtle" aria-hidden="true" />

        {/* Berkas cahaya amber/emas */}
        <div className="nextai-aurora-rays" aria-hidden="true">
          {CALC_BEAM_LAYERS.map((layer, idx) => (
            <span
              key={layer.rot}
              className="nextai-ray"
              style={
                {
                  '--ray-rot': `${layer.rot}deg`,
                  '--ray-h': `${layer.h}px`,
                  '--ray-dx': `${layer.dx}px`,
                  '--ray-w': `${layer.w}px`,
                  '--ray-blur': `${layer.blur}px`,
                  '--ray-peak': layer.peak,
                  '--ray-len': `${layer.len}%`,
                  animationDelay: `${idx * 0.75}s`,
                } as CSSProperties
              }
            >
              <i />
            </span>
          ))}
        </div>

        <HeroDust />

        <div className="calc-hero-content">
          {/* Pill Badge */}
          <div className="nextai-pill-wrap">
            <div className="nextai-pill">
              <span className="nextai-pill-dot" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <IconCalculator size={13} />
              </span>
              <span className="nextai-pill-text">
                ALAT GRATIS · TANPA DAFTAR <span className="nextai-pill-tag">Kalkulator Finansial</span>
              </span>
            </div>
          </div>

          <h1 className="calc-hero-title">
            Kalkulator <span className="calc-title-highlight">Investasi</span>
          </h1>

          <p className="calc-hero-desc">
            Hitung potensi imbal hasil investasi rutin, rencanakan target dana masa depan, tentukan batas aman dana darurat, dan petakan alokasi aset sesuai profil risikomu — lalu tanyakan analisisnya langsung ke AI.
          </p>
        </div>
      </section>

      <main className="lp calc-lp-main">
        <div className="lp-inner">
          <KalkulatorClient signedIn={Boolean(user)} />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

