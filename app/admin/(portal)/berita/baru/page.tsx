import { NewsForm } from '../news-form'

export const dynamic = 'force-dynamic'

export default function AdminNewArticlePage() {
  return (
    <div>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow">CMS Redaksi Komite</p>
        <h1 className="headline" style={{ margin: '4px 0 0' }}>
          Tulis Warta Intelijen Baru
        </h1>
        <p className="standfirst">
          Publikasikan analisis peristiwa makroekonomi, geopolitik, atau aksi pasar. Unggah foto langsung ke Supabase Storage dan masukkan tautan video YouTube jika relevan.
        </p>
      </div>

      <NewsForm isEdit={false} />
    </div>
  )
}
