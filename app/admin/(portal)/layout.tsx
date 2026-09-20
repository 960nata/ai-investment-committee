import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { redirect } from 'next/navigation'
import { AdminLayoutClient } from './admin-layout-client'

export const dynamic = 'force-dynamic'

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthed = await verifyAdminSession()
  if (!isAuthed) {
    redirect('/admin/login')
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
