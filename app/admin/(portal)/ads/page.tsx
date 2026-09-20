import { getAdSettings } from '@/lib/db/news-queries'
import { AdsManagerClient } from './ads-manager-client'

export const dynamic = 'force-dynamic'

export default async function AdminAdsPage() {
  const slots = await getAdSettings()

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow">Monetisasi &amp; Sponsor</p>
        <h1 className="headline" style={{ margin: '4px 0 0' }}>
          Manajemen Slot Iklan &amp; AdSense
        </h1>
        <p className="standfirst">
          Atur penempatan sponsor pada 4 titik strategis di halaman warta. Secara bawaan, seluruh iklan disetel
          <strong> tersembunyi (HIDDEN)</strong> untuk menjaga integritas pembacaan instrumen.
        </p>
      </div>

      <AdsManagerClient initialSlots={slots} />
    </div>
  )
}
