import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getAppUsers, updateUserRole, deleteAppUser, upsertAppUser } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

/**
 * Ambil daftar seluruh user Komite.
 */
export async function GET(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const users = await getAppUsers()
    return NextResponse.json({ ok: true, data: users })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Tambah user baru secara manual oleh Admin.
 */
export async function POST(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { email, name, role } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Alamat email valid wajib diisi.' }, { status: 400 })
    }

    const created = await upsertAppUser({
      email: email.trim().toLowerCase(),
      name: name?.trim() || 'Analis Komite',
      role: role === 'admin' ? 'admin' : 'user',
      isActive: true,
    })

    return NextResponse.json({ ok: true, data: created })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Perbarui peran (admin / user) atau status aktif user.
 */
export async function PATCH(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, role, isActive } = body

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ ok: false, error: 'ID user numerik wajib diisi.' }, { status: 400 })
    }

    const updated = await updateUserRole(
      id,
      role === 'admin' ? 'admin' : 'user',
      typeof isActive === 'boolean' ? isActive : undefined,
    )

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'User tidak ditemukan.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Hapus user.
 */
export async function DELETE(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const searchParams = req.nextUrl.searchParams
    const id = parseInt(searchParams.get('id') || '', 10)

    if (isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'ID user tidak valid.' }, { status: 400 })
    }

    const success = await deleteAppUser(id)
    if (!success) {
      return NextResponse.json({ ok: false, error: 'User gagal dihapus atau tidak ditemukan.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, message: 'User berhasil dihapus.' })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
