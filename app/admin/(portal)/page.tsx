import Link from 'next/link'
import {
  IconNews,
  IconTarget,
  IconUser,
  IconPlus,
  IconEdit,
  IconImage,
  IconVideo,
  IconCheck,
  IconAlert,
  IconGauge,
  IconExternalLink,
  IconDatabase,
  IconLock,
  IconArrowRight,
} from '@/components/icons'
import { getMarketNewsList, getAdSettings, getAppUsers } from '@/lib/db/news-queries'
import { isSupabaseStorageConfigured } from '@/lib/storage/supabase-storage'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const [news, ads, users] = await Promise.all([
    getMarketNewsList({ limit: 10 }),
    getAdSettings(),
    getAppUsers(),
  ])

  const storageReady = isSupabaseStorageConfigured()
  const activeAdsCount = ads.filter((a) => a.isEnabled).length
  const adminUsersCount = users.filter((u) => u.role === 'admin').length
  const regularUsersCount = users.filter((u) => u.role === 'user').length

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      {/* 1. HEADER HALAMAN ADMIN */}
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span>PUSAT KENDALI SISTEM &amp; CMS</span>
          </div>
          <h1 className="admin-page-headline">Dashboard Administrator Komite</h1>
          <p className="admin-page-standfirst">
            Manajemen terpadu publikasi warta intelijen pasar, kurasi dampak geopolitik, pengaturan 4 slot sponsor/AdSense,
            dan kontrol hak akses tim.
          </p>
        </div>

        {/* Status System Chips */}
        <div className="admin-hero-chips mono" suppressHydrationWarning>
          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span>PostgreSQL: Aktif</span>
          </div>
          <div className="admin-hero-chip">
            <span className={`chip-indicator ${storageReady ? 'ok' : 'warn'}`} />
            <span>Storage: {storageReady ? 'Terhubung' : 'Belum Konfig'}</span>
          </div>
          <div className="admin-hero-chip">
            <span className="chip-indicator ok" />
            <span>Sesi: Super Admin</span>
          </div>
        </div>
      </div>

      {/* 2. STAT METRIC CARDS (4-GRID) */}
      <div className="admin-stats-grid" suppressHydrationWarning>
        {/* Stat 1: Warta */}
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">TOTAL WARTA TERBIT</span>
            <div className="admin-stat-icon-wrap" style={{ color: 'var(--signal)' }}>
              <IconNews size={16} />
            </div>
          </div>
          <div className="admin-stat-number mono">{news.length} Artikel</div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge">CMS Aktif</span>
            <span>Diperbarui berkala</span>
          </div>
        </div>

        {/* Stat 2: Slot Iklan */}
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">SLOT IKLAN SPONSOR</span>
            <div className="admin-stat-icon-wrap" style={{ color: activeAdsCount > 0 ? 'var(--green)' : 'var(--ink-mute)' }}>
              <IconTarget size={16} />
            </div>
          </div>
          <div className="admin-stat-number mono" style={{ color: activeAdsCount > 0 ? 'var(--green)' : 'var(--ink)' }}>
            {activeAdsCount} / {ads.length} Aktif
          </div>
          <div className="admin-stat-meta mono">
            <span className={`admin-stat-badge ${activeAdsCount === 0 ? 'safe' : 'active'}`}>
              {activeAdsCount === 0 ? 'Default Tersembunyi (Aman)' : 'Iklan Ditayangkan'}
            </span>
          </div>
        </div>

        {/* Stat 3: Pengguna */}
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">PENGGUNA &amp; TIM</span>
            <div className="admin-stat-icon-wrap" style={{ color: 'var(--blue)' }}>
              <IconUser size={16} />
            </div>
          </div>
          <div className="admin-stat-number mono">{users.length} Akun</div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge">{adminUsersCount} Admin</span>
            <span>{regularUsersCount} User Biasa</span>
          </div>
        </div>

        {/* Stat 4: Supabase Storage */}
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">SUPABASE STORAGE</span>
            <div className="admin-stat-icon-wrap" style={{ color: storageReady ? 'var(--green)' : 'var(--halted)' }}>
              <IconImage size={16} />
            </div>
          </div>
          <div className="admin-stat-number mono" style={{ color: storageReady ? 'var(--green)' : 'var(--halted)' }}>
            {storageReady ? 'Terhubung' : 'Offline'}
          </div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge">Bucket &quot;ai investasi&quot;</span>
            <span>{storageReady ? 'Upload CDN Aktif' : 'Periksa Kredensial'}</span>
          </div>
        </div>
      </div>

      {/* 3. PINTASAN AKSI UTAMA (COMMAND CARDS GRID) */}
      <div className="admin-section-header mono" suppressHydrationWarning>
        <span className="admin-section-title">PINTASAN KENDALI UTAMA</span>
        <span className="admin-section-line" />
      </div>

      <div className="admin-actions-grid" suppressHydrationWarning>
        {/* Aksi 1: Tulis Warta */}
        <Link href="/admin/berita/baru" className="admin-action-card">
          <div className="admin-action-icon-box" style={{ background: 'rgba(217, 119, 6, 0.12)', color: 'var(--signal)' }}>
            <IconPlus size={20} />
          </div>
          <div className="admin-action-text">
            <h3 className="admin-action-heading">Tulis Warta Baru</h3>
            <p className="admin-action-desc">
              Buat artikel analisis dengan upload gambar ke Supabase, sematkan video YouTube, dan hitung skor dampak.
            </p>
          </div>
          <div className="admin-action-arrow mono">
            <span>Buka Form</span>
            <IconArrowRight size={13} />
          </div>
        </Link>

        {/* Aksi 2: Kelola Slot Iklan */}
        <Link href="/admin/ads" className="admin-action-card">
          <div className="admin-action-icon-box" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue)' }}>
            <IconTarget size={20} />
          </div>
          <div className="admin-action-text">
            <h3 className="admin-action-heading">Kelola Slot Iklan</h3>
            <p className="admin-action-desc">
              Atur status tayang/sembunyi 4 slot AdSense (Header, Mid-Article, Sidebar, Footer) secara instan.
            </p>
          </div>
          <div className="admin-action-arrow mono">
            <span>Atur Slot</span>
            <IconArrowRight size={13} />
          </div>
        </Link>

        {/* Aksi 3: Manajemen Pengguna */}
        <Link href="/admin/users" className="admin-action-card">
          <div className="admin-action-icon-box" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)' }}>
            <IconUser size={20} />
          </div>
          <div className="admin-action-text">
            <h3 className="admin-action-heading">Manajemen Pengguna</h3>
            <p className="admin-action-desc">
              Pemisahan tegas role Administrator dan Pengguna biasa (read-only), serta kendali akun demo.
            </p>
          </div>
          <div className="admin-action-arrow mono">
            <span>Kelola Tim</span>
            <IconArrowRight size={13} />
          </div>
        </Link>

        {/* Aksi 4: Cek Dashboard User */}
        <Link href="/ringkasan" className="admin-action-card">
          <div className="admin-action-icon-box" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' }}>
            <IconGauge size={20} />
          </div>
          <div className="admin-action-text">
            <h3 className="admin-action-heading">Terminal Analisis User</h3>
            <p className="admin-action-desc">
              Lihat langsung tampilan terminal pengguna publik: grafik candlestick, putusan 4 AI, dan warta rilis.
            </p>
          </div>
          <div className="admin-action-arrow mono">
            <span>Uji Tampilan</span>
            <IconArrowRight size={13} />
          </div>
        </Link>
      </div>

      {/* 4. DIAGNOSTIK KESEHATAN SISTEM */}
      <div className="admin-health-panel" suppressHydrationWarning>
        <div className="admin-health-header mono">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconDatabase size={15} style={{ color: 'var(--signal)' }} />
            <span className="bold">STATUS INFRASTRUKTUR &amp; INTEGRASI</span>
          </div>
          <span className="tag mono" style={{ fontSize: '10px' }}>SYSTEM READY</span>
        </div>

        <div className="admin-health-grid mono">
          <div className="admin-health-item">
            <span className="health-name">Basis Data PostgreSQL</span>
            <span className="health-status ok">● TERHUBUNG (Drizzle)</span>
          </div>
          <div className="admin-health-item">
            <span className="health-name">Supabase Storage CDN</span>
            <span className={`health-status ${storageReady ? 'ok' : 'warn'}`}>
              {storageReady ? '● READY (ai investasi)' : '● BELUM KONFIG'}
            </span>
          </div>
          <div className="admin-health-item">
            <span className="health-name">YouTube Auto-Embed Engine</span>
            <span className="health-status ok">● AKTIF (Auto-Hide)</span>
          </div>
          <div className="admin-health-item">
            <span className="health-name">AdSense Switcher Engine</span>
            <span className="health-status ok">● 4 SLOT AMAN</span>
          </div>
        </div>
      </div>

      {/* 5. TABEL WARTA TERAKHIR DITERBITKAN */}
      <div className="admin-table-card" suppressHydrationWarning>
        <div className="admin-table-card-head">
          <div>
            <h2 className="admin-table-title">Publikasi Warta Terbaru</h2>
            <p className="admin-table-subtitle mono">
              10 artikel warta intelijen pasar terakhir yang tersimpan di database
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link href="/admin/berita" className="btn btn-quiet mono" style={{ fontSize: '11px', padding: '5px 10px' }}>
              <span>Kelola Semua ({news.length})</span>
              <IconArrowRight size={12} />
            </Link>
            <Link href="/admin/berita/baru" className="btn btn-primary mono" style={{ fontSize: '11px', padding: '5px 12px' }}>
              <IconPlus size={13} />
              <span>Tulis Baru</span>
            </Link>
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Judul &amp; Kategori</th>
                <th style={{ width: '15%' }}>Dampak Harga</th>
                <th style={{ width: '15%' }}>Status Media</th>
                <th style={{ width: '15%' }}>Rilis</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {news.map((item) => {
                const isHighImpact = item.impactScore >= 8
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-news-title-cell">
                        <Link href={`/admin/berita/${item.id}/edit`} className="admin-news-title-link">
                          {item.title}
                        </Link>
                        <div className="admin-news-tags mono">
                          <span className="tag-cat">{item.category}</span>
                          <span className={`tag-sentiment ${item.sentiment}`}>
                            {item.sentiment.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="admin-impact-cell mono">
                        <span className={`impact-score ${isHighImpact ? 'high' : 'normal'}`}>
                          {item.impactScore}/10
                        </span>
                        <div className="impact-bar-track">
                          <div
                            className={`impact-bar-fill ${isHighImpact ? 'high' : 'normal'}`}
                            style={{ width: `${item.impactScore * 10}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="admin-media-cell mono">
                        {item.youtubeVideo?.videoId ? (
                          <span className="media-pill yt">
                            <IconVideo size={11} />
                            <span>YouTube</span>
                          </span>
                        ) : (
                          <span className="media-pill none">
                            <span>Video (-)</span>
                          </span>
                        )}

                        {item.featuredImage?.url ? (
                          <span className="media-pill img">
                            <IconImage size={11} />
                            <span>Gambar</span>
                          </span>
                        ) : (
                          <span className="media-pill none">
                            <span>Gambar (-)</span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
                      {new Date(item.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-row-actions">
                        <Link
                          href={`/admin/berita/${item.id}/edit`}
                          className="btn btn-quiet mono"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          title="Edit Artikel Ini"
                        >
                          <IconEdit size={12} />
                          <span>Edit</span>
                        </Link>

                        <Link
                          href={`/berita/${item.slug}`}
                          target="_blank"
                          className="btn btn-quiet mono"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          title="Lihat Tampilan Publik Artikel"
                        >
                          <IconExternalLink size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {news.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-mute)' }}>
                    <IconNews size={24} style={{ margin: '0 auto 8px', color: 'var(--ink-faint)', display: 'block' }} />
                    <p className="mono" style={{ margin: 0 }}>Belum ada warta tersimpan di database.</p>
                    <Link
                      href="/admin/berita/baru"
                      className="btn btn-primary mono"
                      style={{ marginTop: '12px', display: 'inline-flex', fontSize: '12px' }}
                    >
                      <IconPlus size={13} />
                      <span>Buat Warta Pertama</span>
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
