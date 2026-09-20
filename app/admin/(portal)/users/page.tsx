import { getAppUsers } from '@/lib/db/news-queries'
import { IconUser } from '@/components/icons'
import { UsersClient } from './users-client'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await getAppUsers()

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconUser size={13} style={{ color: 'var(--blue)' }} />
            <span>MANAJEMEN TIM &amp; OTORISASI</span>
          </div>
          <h1 className="admin-page-headline">Manajemen Pengguna &amp; Hak Akses</h1>
          <p className="admin-page-standfirst">
            Pemisahan ketat hak akses antara Pengguna Biasa (analis read-only) dan Administrator Komite (akses penuh basis data, CMS, dan iklan).
          </p>
        </div>
      </div>

      <div suppressHydrationWarning>
        <UsersClient initialUsers={users} />
      </div>
    </div>
  )
}
