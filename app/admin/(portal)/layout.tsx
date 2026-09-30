import type { Metadata } from 'next'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { notFound } from 'next/navigation'
import { AdminLayoutClient } from './admin-layout-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthed = await verifyAdminSession()
  // 404, bukan dialihkan ke halaman masuk: pengalihan memberi tahu pengunjung
  // bahwa di balik alamat ini ada portal, dan di mana pintunya.
  if (!isAuthed) {
    notFound()
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
