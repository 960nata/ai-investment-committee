import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { uploadImageFile, isSupabaseStorageConfigured } from '@/lib/storage/supabase-storage'

export const dynamic = 'force-dynamic'

/**
 * Endpoint unggah berkas gambar berita ke Supabase Storage khusus Admin.
 */
export async function POST(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json(
      { ok: false, error: 'Akses ditolak. Diperlukan sesi Admin.' },
      { status: 403 },
    )
  }

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Supabase Storage belum dikonfigurasi di environment variable.' },
      { status: 500 },
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const slugPrefix = (formData.get('prefix') as string) || 'news'

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { ok: false, error: 'Berkas gambar tidak ditemukan di formulir permintaan.' },
        { status: 400 },
      )
    }

    // Validasi tipe berkas gambar
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { ok: false, error: 'Format berkas harus berupa gambar (JPG, PNG, WebP, GIF, SVG).' },
        { status: 400 },
      )
    }

    // Batas ukuran 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'Ukuran berkas melebihi batas 10MB.' },
        { status: 400 },
      )
    }

    const uploadResult = await uploadImageFile(file, slugPrefix)

    if (!uploadResult.ok || !uploadResult.publicUrl) {
      return NextResponse.json(
        { ok: false, error: uploadResult.error || 'Gagal mengunggah berkas ke Supabase Storage.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      publicUrl: uploadResult.publicUrl,
      filename: file.name,
      size: file.size,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
