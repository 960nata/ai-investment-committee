/**
 * Operasi detail thread Tanya Komite:
 * - GET: Ambil thread dan seluruh pesannya (hanya milik user).
 * - DELETE: Hapus thread beserta pesannya (cascade).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { unauthorized, notFound, NO_STORE, failure } from '@/lib/http/errors'
import { getUserChatThread, deleteUserChatThread } from '@/lib/db/committee-chat-queries'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { id } = await params
  const threadId = parseInt(id, 10)
  if (isNaN(threadId) || threadId <= 0) return notFound('Thread tidak valid.')

  try {
    const data = await getUserChatThread(user.uid, threadId)
    if (!data) return notFound('Thread percakapan tidak ditemukan.')

    return NextResponse.json(data, { headers: NO_STORE })
  } catch (err) {
    return failure('Get committee chat thread', err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { id } = await params
  const threadId = parseInt(id, 10)
  if (isNaN(threadId) || threadId <= 0) return notFound('Thread tidak valid.')

  try {
    const deleted = await deleteUserChatThread(user.uid, threadId)
    if (!deleted) return notFound('Thread tidak ditemukan atau bukan milik Anda.')

    return NextResponse.json({ ok: true, id: threadId }, { headers: NO_STORE })
  } catch (err) {
    return failure('Delete committee chat thread', err)
  }
}
