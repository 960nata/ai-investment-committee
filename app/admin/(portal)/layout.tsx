import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  IconPulse,
  IconGauge,
  IconNews,
  IconPlus,
  IconTarget,
  IconUser,
  IconExternalLink,
  IconLock,
} from '@/components/icons'
import { AdminNavLinks } from './admin-nav-links'
import { AdminLogoutButton } from './admin-logout-btn'

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

  return (
    <div className="admin-shell">
      {/* Topbar Admin */}
      <header className="admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href="/admin" className="landing-brand">
            <span className="mark-glyph">
              <IconPulse size={15} />
            </span>
            <span className="mark-name">Komite</span>
            <span className="mark-phase" style={{ background: 'var(--signal)', color: '#000' }}>
              ADMIN
            </span>
          </Link>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', marginLeft: '8px' }}>
            Terminal Manajemen &amp; Pengendali
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link
            href="/ringkasan"
            target="_blank"
            className="btn btn-quiet"
            style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
          >
            <span>Buka Dashboard User</span>
            <IconExternalLink size={12} />
          </Link>
          <AdminLogoutButton />
        </div>
      </header>

      {/* Body dengan Sidebar Khusus Admin */}
      <div className="admin-body">
        <aside className="admin-sidebar">
          <div style={{ padding: '0 var(--space-3) var(--space-2)' }}>
            <span
              className="mono"
              style={{ fontSize: '10px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}
            >
              Navigasi Admin
            </span>
          </div>

          <AdminNavLinks />

          <div
            style={{
              marginTop: 'auto',
              padding: 'var(--space-3)',
              borderTop: '1px solid var(--line)',
              fontSize: '11px',
              color: 'var(--ink-faint)',
            }}
          >
            <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <IconLock size={12} />
              <span>Sesi Terautentikasi</span>
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px' }}>Hak akses penuh basis data</div>
          </div>
        </aside>

        {/* Area Kerja Utama Admin */}
        <main className="admin-main">{children}</main>
      </div>
    </div>
  )
}
