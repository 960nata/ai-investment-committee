import { IconNews } from '@/components/icons'
import { NewsForm } from '../news-form'

export const dynamic = 'force-dynamic'

export default function AdminNewArticlePage() {
  return (
    <div className="admin-page-content" suppressHydrationWarning>
      <div className="admin-page-hero" suppressHydrationWarning>
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconNews size={13} style={{ color: 'var(--signal)' }} />
            <span>CMS REDAKSI KOMITE</span>
          </div>
          <h1 className="admin-page-headline">Tulis Warta Intelijen Baru</h1>
          <p className="admin-page-standfirst">
            Publikasikan analisis peristiwa makroekonomi, geopolitik, atau aksi pasar. Unggah foto langsung ke Supabase Storage dan masukkan tautan video YouTube jika relevan.
          </p>
        </div>
      </div>

      <div suppressHydrationWarning>
        <NewsForm isEdit={false} />
      </div>
    </div>
  )
}
