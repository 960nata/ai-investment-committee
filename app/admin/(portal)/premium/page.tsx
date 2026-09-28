import { getPremiumSettings, getPremiumStats, listRecentOrders } from '@/lib/db/premium-queries'
import { isTripayConfigured, tripayConfig } from '@/lib/payment/tripay'
import { IconCrown } from '@/components/icons'
import { PremiumManagerClient } from './premium-manager-client'

export const dynamic = 'force-dynamic'

export default async function AdminPremiumPage() {
  const [settings, orders, stats] = await Promise.all([
    getPremiumSettings(),
    listRecentOrders(),
    getPremiumStats(),
  ])
  const tripay = tripayConfig()

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconCrown size={13} style={{ color: 'var(--signal)' }} />
            <span>MONETISASI</span>
          </div>
          <h1 className="admin-page-headline">Premium &amp; Harga</h1>
          <p className="admin-page-standfirst">
            Atur paket, harga, dan batas akun gratis vs Premium. Pembayaran lewat Tripay. Secara bawaan halaman
            ini <strong>tersembunyi (HIDDEN)</strong> sampai Anda menyalakannya. Menyembunyikannya tidak mencabut
            Premium yang sudah dibeli.
          </p>
        </div>
      </div>

      <PremiumManagerClient
        initial={{
          isEnabled: settings.isEnabled,
          title: settings.title,
          message: settings.message,
          benefits: settings.benefits,
          plans: settings.plans,
          limits: settings.limits,
        }}
        orders={orders}
        stats={stats}
        tripay={{
          ready: isTripayConfigured(),
          mode: tripay?.isProduction ? 'production' : 'sandbox',
        }}
      />
    </div>
  )
}
