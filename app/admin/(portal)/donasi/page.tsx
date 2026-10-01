import { requireAdmin } from '@/lib/auth/admin-auth'
import { getDonationSettings } from '@/lib/db/donation-queries'
import { IconHeart } from '@/components/icons'
import { DonationManagerClient } from './donation-manager-client'

export const dynamic = 'force-dynamic'

export default async function AdminDonationPage() {
  await requireAdmin()
  const settings = await getDonationSettings()

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconHeart size={13} style={{ color: 'var(--signal)' }} />
            <span>DUKUNGAN &amp; DONASI</span>
          </div>
          <h1 className="admin-page-headline">Halaman Donasi</h1>
          <p className="admin-page-standfirst">
            Atur metode donasi — Saweria, Trakteer, QRIS, Ko-fi, PayPal, dan lainnya. Secara bawaan halaman ini
            <strong> tersembunyi (HIDDEN)</strong> sampai Anda menyalakannya.
          </p>
        </div>
      </div>

      <DonationManagerClient
        initial={{
          isEnabled: settings.isEnabled,
          title: settings.title,
          message: settings.message,
          methods: settings.methods,
        }}
      />
    </div>
  )
}
