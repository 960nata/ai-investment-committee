import { getAppUsers } from '@/lib/db/news-queries'
import { UsersClient } from './users-client'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await getAppUsers()

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow">Manajemen Akses &amp; Tim</p>
        <h1 className="headline" style={{ margin: '4px 0 0' }}>
          Manajemen Pengguna &amp; Hak Akses
        </h1>
        <p className="standfirst">
          Pemisahan ketat hak akses antara User Biasa (analis read-only) dan Administrator Komite (akses CMS, Ads &amp; Storage).
        </p>
      </div>

      <UsersClient initialUsers={users} />
    </div>
  )
}
