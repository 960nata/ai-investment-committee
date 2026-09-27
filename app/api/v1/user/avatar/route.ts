import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from '@/lib/auth/session'
import { updateUserAvatar } from '@/lib/db/news-queries'
import { uploadBufferToSupabase } from '@/lib/storage/supabase-storage'

export const dynamic = 'force-dynamic'

/**
 * Endpoint unggah foto profil (terkompresi WebP).
 *
 * Menerima berkas WebP yang sudah dikompresi di sisi browser.
 * Berkas diunggah ke Supabase Storage bucket 'avatars/' atau disimpan
 * sebagai data URL jika penyimpanan cloud belum diatur.
 * Cookie sesi langsung diperbarui agar foto profil langsung tampil di header.
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentUser()
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Sesi tidak sah. Silakan masuk terlebih dahulu.' },
      { status: 401 },
    )
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let buffer: Buffer | null = null
    let mimeType = 'image/webp'

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('avatar') as File | null

      if (!file) {
        return NextResponse.json(
          { ok: false, error: 'Berkas avatar tidak ditemukan dalam formulir.' },
          { status: 400 },
        )
      }

      // Validasi ukuran: maksimal 5MB (foto WebP biasanya hanya 20-80 KB)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: 'Ukuran berkas terlalu besar (maksimal 5 MB).' },
          { status: 400 },
        )
      }

      mimeType = file.type || 'image/webp'
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else if (contentType.includes('application/json')) {
      const body = await req.json()
      const dataUrl = body?.avatarDataUrl as string | undefined

      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return NextResponse.json(
          { ok: false, error: 'Format data avatar tidak sah.' },
          { status: 400 },
        )
      }

      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        return NextResponse.json(
          { ok: false, error: 'Format base64 avatar tidak valid.' },
          { status: 400 },
        )
      }

      mimeType = match[1]
      buffer = Buffer.from(match[2], 'base64')
    } else {
      return NextResponse.json(
        { ok: false, error: 'Content-Type harus multipart/form-data atau application/json.' },
        { status: 400 },
      )
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Data gambar kosong.' },
        { status: 400 },
      )
    }

    // 1. Coba simpan ke Supabase Storage
    const timestamp = Date.now()
    const storagePath = `avatars/avatar-${session.uid}-${timestamp}.webp`
    let avatarUrl: string | null = null

    const uploadRes = await uploadBufferToSupabase(buffer, storagePath, 'image/webp')

    if (uploadRes.ok && uploadRes.publicUrl) {
      avatarUrl = uploadRes.publicUrl
    } else {
      // Fallback: Jika Supabase credentials belum diisi di dev environment,
      // simpan sebagai data URL base64 agar upload tetap berjalan lancar tanpa error
      console.warn(
        `[avatar] Supabase upload gagal (${uploadRes.error}). Menggunakan fallback base64 data URL.`,
      )
      avatarUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
    }

    // 2. Simpan URL avatar baru ke basis data Postgres (app_user)
    const updatedUser = await updateUserAvatar(session.uid, avatarUrl)
    if (!updatedUser) {
      return NextResponse.json(
        { ok: false, error: 'Gagal memperbarui catatan pengguna di basis data.' },
        { status: 500 },
      )
    }

    // 3. Perbarui cookie sesi (komite_user_session) secara instan
    const response = NextResponse.json({
      ok: true,
      avatarUrl,
      message: 'Foto profil WebP berhasil diperbarui.',
    })

    response.cookies.set({
      name: USER_SESSION_COOKIE,
      value: createSessionToken({
        uid: session.uid,
        email: session.email,
        name: updatedUser.name || session.name,
        role: session.role,
        avatarUrl,
      }),
      ...sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    })

    return response
  } catch (err) {
    console.error('[avatar/upload]', err)
    return NextResponse.json(
      { ok: false, error: 'Gagal memproses unggahan foto profil. Coba lagi.' },
      { status: 500 },
    )
  }
}
