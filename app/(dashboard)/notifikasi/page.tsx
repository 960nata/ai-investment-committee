import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/user-auth'
import { getUnifiedNotificationFeed } from '@/lib/notifications/feed'
import { NotificationCenterClient } from '@/components/notifications/notification-center-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pusat Notifikasi & Informasi | AI Investment Committee',
  description:
    'Pemberitahuan resmi dari admin komite, intelijen rilis warta pasar AI terbaru, dan sinyal alert pergerakan harga.',
}

export default async function NotifikasiPage() {
  const user = await requireUser('/notifikasi')
  const initialItems = await getUnifiedNotificationFeed(user.uid)

  return <NotificationCenterClient initialItems={initialItems} />
}
