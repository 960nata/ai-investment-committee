import { IconMegaphone } from '@/components/icons'
import { countDismissals, listAnnouncements } from '@/lib/db/member-queries'
import { AnnouncementManager } from './announcement-manager'

export const dynamic = 'force-dynamic'

export default async function AdminAnnouncementsPage() {
  const [rows, dismissals] = await Promise.all([listAnnouncements(), countDismissals()])

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconMegaphone size={13} style={{ color: 'var(--signal)' }} />
            <span>KOMUNIKASI PENGGUNA</span>
          </div>
          <h1 className="admin-page-headline">Pengumuman Dashboard</h1>
          <p className="admin-page-standfirst">
            Kirim pengumuman yang muncul sebagai notifikasi di atas setiap halaman dashboard pengguna. Pengguna bisa
            menutupnya; yang sudah ditutup tidak muncul lagi untuk orang itu.
          </p>
        </div>
      </div>

      <AnnouncementManager
        initial={rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          tone: r.tone,
          linkUrl: r.linkUrl,
          linkLabel: r.linkLabel,
          isActive: r.isActive,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          dismissals: dismissals.get(r.id) ?? 0,
        }))}
      />
    </div>
  )
}
