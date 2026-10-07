import { requireAdmin } from '@/lib/auth/admin-auth'
import { getSimSettings } from '@/lib/db/simulator-queries'
import { IconActivity } from '@/components/icons'
import { SimulatorClient } from '@/components/simulator/simulator-client'
import { loadSimInstrumentOptions } from '@/components/simulator/load-options'
import { SimulatorSettingsClient } from './simulator-settings-client'

export const dynamic = 'force-dynamic'

export default async function AdminSimulatorPage() {
  await requireAdmin()
  const [settings, instruments] = await Promise.all([getSimSettings(), loadSimInstrumentOptions().catch(() => [])])

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconActivity size={13} style={{ color: 'var(--signal)' }} />
            <span>LAB TRADING</span>
          </div>
          <h1 className="admin-page-headline">Simulator Trading AI</h1>
          <p className="admin-page-standfirst">
            Harga realtime, dompet virtual $1.000 per mode (binary, harian, bulanan, tahunan) yang bisa direset, dan
            desk empat AI yang bersidang mencari sinyal serta jejak bandar lalu mengeksekusi trade. Dompet admin
            terpisah dari dompet pengguna.
          </p>
        </div>
      </div>

      <SimulatorSettingsClient initialEnabled={settings.premiumEnabled} />
      <SimulatorClient instruments={instruments} />
    </div>
  )
}
