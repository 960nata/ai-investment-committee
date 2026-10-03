import type { Metadata } from 'next'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { listInstrumentQuotes } from '@/lib/db/queries'
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
  const [user, isAdmin, instruments] = await Promise.all([
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
    listInstrumentQuotes().catch(() => []),
  ])

  return (
    <div className="landing-shell calc-landing-shell">
      <LandingNav isAdmin={isAdmin} user={user} instruments={instruments} />
      <main className="calc-page">
        {/* Ambient atmospheric sunburst glow matching the homepage */}
        <div className="calc-aurora-glow" aria-hidden="true" />
        <div className="calc-aurora-beam" aria-hidden="true" />

        <header className="calc-hero">
          <div className="calc-badge-wrap">
            <span className="calc-badge mono">
              <span className="calc-badge-dot" />
              ALAT GRATIS · TANPA DAFTAR
            </span>
          </div>
          <h1 className="calc-title">
            Kalkulator <span className="calc-title-highlight">Investasi</span>
          </h1>
          <p className="calc-sub">
            Hitung potensi imbal hasil investasi rutin, rencanakan target dana masa depan, tentukan batas aman dana darurat, dan petakan alokasi aset sesuai profil risikomu — lalu tanyakan analisisnya langsung ke AI.
          </p>
        </header>
        <KalkulatorClient signedIn={Boolean(user)} />
      </main>
      <LandingFooter />
    </div>
  )
}
