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
  IconEyeOff,
  IconAlert,
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

  return (
    <div>
      <header className="masthead" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow">Pusat Kendali Administrasi</p>
        <h1 className="headline">Panel Administrator Komite</h1>
        <p className="standfirst">
          Kelola warta intelijen pasar, unggah aset gambar ke Supabase Storage, kontrol player YouTube per artikel,
          dan atur status 4 slot iklan strategis.
        </p>
      </header>

      {/* Grid Kartu Metrik Ringkasan */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: 'var(--space-4)',
        }}
      >
        {/* Metrik 1: Berita */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
              Total Warta Diterbitkan
            </span>
            <IconNews size={16} style={{ color: 'var(--signal)' }} />
          </div>
          <div className="mono bold" style={{ fontSize: '24px' }}>
            {news.length} Artikel
          </div>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', margin: '4px 0 0' }}>
            Diperbarui berkala oleh Agen &amp; Analis
          </p>
        </div>

        {/* Metrik 2: Slot Iklan */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
              Status Slot Iklan
            </span>
            <IconTarget size={16} style={{ color: activeAdsCount > 0 ? 'var(--green)' : 'var(--ink-mute)' }} />
          </div>
          <div className="mono bold" style={{ fontSize: '24px', color: activeAdsCount > 0 ? 'var(--green)' : 'var(--ink-soft)' }}>
            {activeAdsCount} Aktif / {ads.length} Slot
          </div>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', margin: '4px 0 0' }}>
            {activeAdsCount === 0 ? 'Seluruh iklan disembunyikan (Default Aman)' : 'Sebagian slot iklan aktif'}
          </p>
        </div>

        {/* Metrik 3: Pengguna */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
              Pengguna Terdaftar
            </span>
            <IconUser size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div className="mono bold" style={{ fontSize: '24px' }}>
            {users.length} Akun
          </div>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', margin: '4px 0 0' }}>
            Role Admin vs User terpisah
          </p>
        </div>

        {/* Metrik 4: Supabase Storage */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
              Supabase Storage
            </span>
            <IconImage size={16} style={{ color: storageReady ? 'var(--green)' : 'var(--halted)' }} />
          </div>
          <div className="mono bold" style={{ fontSize: '24px', color: storageReady ? 'var(--green)' : 'var(--halted)' }}>
            {storageReady ? 'Terhubung' : 'Belum Konfig'}
          </div>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', margin: '4px 0 0' }}>
            Bucket: &quot;ai investasi&quot;
          </p>
        </div>
      </div>

      {/* Aksi Cepat */}
      <div className="admin-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className="mono bold" style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
          Aksi Cepat:
        </span>
        <Link href="/admin/berita/baru" className="btn btn-primary" style={{ fontSize: '12px' }}>
          <IconPlus size={14} />
          Tulis Warta Berita Baru
        </Link>
        <Link href="/admin/ads" className="btn btn-quiet" style={{ fontSize: '12px', border: '1px solid var(--line)' }}>
          <IconTarget size={14} />
          Kelola Slot Iklan
        </Link>
        <Link href="/admin/users" className="btn btn-quiet" style={{ fontSize: '12px', border: '1px solid var(--line)' }}>
          <IconUser size={14} />
          Kelola Pengguna
        </Link>
      </div>

      {/* Tabel Warta Terkini dengan Link Edit */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Warta Intelijen Terkini</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              10 publikasi terbaru di database
            </p>
          </div>
          <Link href="/admin/berita" className="mono" style={{ fontSize: '12px', color: 'var(--signal)', textDecoration: 'none' }}>
            Lihat Semua &rarr;
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Judul Artikel</th>
                <th>Kategori</th>
                <th>Dampak</th>
                <th>Video YT</th>
                <th>Tanggal Rilis</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {news.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500, maxWidth: '300px' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </div>
                  </td>
                  <td>
                    <span className="tag mono" style={{ fontSize: '10px' }}>
                      {item.category}
                    </span>
                  </td>
                  <td className="mono">
                    <span style={{ color: item.impactScore >= 7 ? 'var(--signal)' : 'var(--ink-soft)' }}>
                      {item.impactScore}/10
                    </span>
                  </td>
                  <td>
                    {item.youtubeVideo?.videoId ? (
                      <span className="tag mono" style={{ color: 'var(--green)', fontSize: '10px' }}>
                        Ada Video
                      </span>
                    ) : (
                      <span className="tag mono" style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                        Tersembunyi
                      </span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
                    {new Date(item.publishedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    <Link
                      href={`/admin/berita/${item.id}/edit`}
                      className="btn btn-quiet"
                      style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--line)' }}
                    >
                      <IconEdit size={12} />
                      <span>Edit</span>
                    </Link>
                  </td>
                </tr>
              ))}

              {news.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-mute)' }}>
                    Belum ada warta tersimpan. Klik &quot;Tulis Warta Berita Baru&quot; di atas.
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
