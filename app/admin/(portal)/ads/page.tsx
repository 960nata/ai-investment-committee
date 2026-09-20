import { getAdSettings } from '@/lib/db/news-queries'
import { IconTarget } from '@/components/icons'
import { AdsManagerClient } from './ads-manager-client'

export const dynamic = 'force-dynamic'

export default async function AdminAdsPage() {
  const slots = await getAdSettings()

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconTarget size={13} style={{ color: 'var(--signal)' }} />
            <span>MONETISASI &amp; SPONSOR</span>
          </div>
          <h1 className="admin-page-headline">Manajemen Slot Iklan &amp; AdSense</h1>
          <p className="admin-page-standfirst">
            Kontrol penempatan sponsor pada 4 titik strategis di halaman warta. Secara bawaan sistem, seluruh iklan disetel
            <strong> tersembunyi (HIDDEN)</strong> demi menjaga integritas pembacaan data.
          </p>
        </div>
      </div>

      <div suppressHydrationWarning>
        <AdsManagerClient initialSlots={slots} />
      </div>
    </div>
  )
}
