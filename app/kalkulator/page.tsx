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
    <div className="landing-shell">
      <LandingNav isAdmin={isAdmin} user={user} instruments={instruments} />
      <main className="calc-page">
        <header className="calc-hero">
          <p className="calc-eyebrow mono">ALAT GRATIS · TANPA DAFTAR</p>
          <h1 className="calc-title">Kalkulator Investasi</h1>
          <p className="calc-sub">
            Hitung berapa hasil investasi rutinmu, berapa yang perlu disisihkan untuk sebuah tujuan, berapa dana darurat yang
            ideal, dan alokasi yang cocok dengan profil risikomu. Lalu tanyakan hasilnya ke AI.
          </p>
        </header>
        <KalkulatorClient signedIn={Boolean(user)} />
      </main>
      <LandingFooter />
    </div>
  )
}
