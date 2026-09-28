/**
 * Alert (Beta) — aturan pengingat harga, skor, dan perubahan putusan komite,
 * beserta kotak masuk notifikasinya.
 */

import { BetaHead } from '@/components/member/page-head'
import { DatabaseNotice } from '@/components/ui'
import { AlertClient } from './alert-client'
import { requireUser } from '@/lib/auth/user-auth'
import { listAlerts, listNotifications } from '@/lib/db/member-queries'
import { getEntitlement } from '@/lib/db/premium-queries'
import { loadMarketView } from '@/lib/member/market-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alert' }

export default async function AlertPage() {
  const session = await requireUser('/alert')

  const { limits } = await getEntitlement(session.uid)

  let error: string | null = null
  let data: {
    alerts: Awaited<ReturnType<typeof listAlerts>>
    notifications: Awaited<ReturnType<typeof listNotifications>>
    market: Awaited<ReturnType<typeof loadMarketView>>
  } | null = null
  try {
    const [alerts, notifications, market] = await Promise.all([
      listAlerts(session.uid),
      listNotifications(session.uid, 50),
      loadMarketView(),
    ])
    data = { alerts, notifications, market }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <BetaHead
        eyebrow="Alat investor"
        title="Alert"
        lead="Dapat kabar saat harga menembus ambang, skor berbalik, atau putusan komite berubah. Notifikasi muncul di pita atas dashboard dan tercatat di sini."
        note="Alert dinilai terhadap penutupan harian terakhir, skor harian, dan rapat komite terbaru — diperiksa tiap jam dan saat Anda membuka dashboard. Alert harga dan skor mati sendiri setelah terpicu."
      />
      {error && <DatabaseNotice detail={error} />}
      {data && (
        <AlertClient
          alerts={data.alerts.map((a) => ({
            id: a.id,
            instrumentId: a.instrumentId,
            kind: a.kind,
            threshold: a.threshold === null ? null : Number(a.threshold),
            horizon: a.horizon,
            lastVerdict: a.lastVerdict,
            isActive: a.isActive,
            triggeredAt: a.triggeredAt?.toISOString() ?? null,
          }))}
          notifications={data.notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            linkUrl: n.linkUrl,
            readAt: n.readAt?.toISOString() ?? null,
            createdAt: n.createdAt.toISOString(),
          }))}
          market={data.market}
          limit={limits.alerts}
        />
      )}
    </>
  )
}
