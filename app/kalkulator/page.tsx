import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { listInstrumentQuotes, getDataFreshness, type InstrumentQuote } from '@/lib/db/queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { BEAM_LAYERS } from '@/components/next-ai-landing'
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

export default async function KalkulatorPage() {
  const [user, isAdmin, instruments, latestNews, freshness] = await Promise.all([
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
    listInstrumentQuotes().catch(() => []),
    getMarketNewsList({ limit: 6 }).catch(() => []),
    getDataFreshness().catch(() => null),
  ])

  const navHighlights = [
    instruments.find((i) => i.symbol === 'BTCUSDT'),
    instruments.find((i) => i.symbol === 'ETHUSDT'),
    instruments.find((i) => i.symbol === 'SOLUSDT'),
    instruments.find((i) => i.symbol.startsWith('BBCA') || i.symbol.startsWith('BBRI')),
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

      <div className="nextai-root">
        <section className="nextai-hero calc-hero-section">
          {/* Dynamic Radiant Amber Aurora Beams & Volumetric Rays */}
          <div className="nextai-aurora-beam" aria-hidden="true" />
          <div className="nextai-aurora-glow" aria-hidden="true" />
          <div className="nextai-aurora-subtle" aria-hidden="true" />

          {/* Berkas cahaya amber/emas */}
          <div className="nextai-aurora-rays" aria-hidden="true">
            {BEAM_LAYERS.map((layer, idx) => (
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

          <div className="nextai-hero-container calc-hero-container">
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

            <h1 className="nextai-hero-title calc-main-title">
              Kalkulator <span className="calc-title-highlight">Investasi</span>
            </h1>

            <p className="nextai-hero-desc calc-main-desc">
              Hitung potensi imbal hasil investasi rutin, rencanakan target dana masa depan, tentukan batas aman dana darurat, dan petakan alokasi aset sesuai profil risikomu — lalu tanyakan analisisnya langsung ke AI.
            </p>
          </div>
        </section>
      </div>

      <main className="lp calc-lp-main">
        <div className="lp-inner">
          <KalkulatorClient signedIn={Boolean(user)} />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

