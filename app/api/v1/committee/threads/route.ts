/**
 * API Riwayat Thread Tanya Komite:
 * - GET: Daftar riwayat thread milik pengguna yang sedang login.
 * - POST: Membuat thread baru secara manual jika diinginkan.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { unauthorized, NO_STORE, failure } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'
import { listUserChatThreads, createUserChatThread } from '@/lib/db/committee-chat-queries'
import { ASK_TOPICS } from '@/lib/member/ask-context'
import { SYMBOL_PATTERN } from '@/lib/format/market'

export const dynamic = 'force-dynamic'

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200).default('Percakapan Baru'),
  topic: z.enum(ASK_TOPICS).default('saham'),
  market: z.enum(['CRYPTO', 'IDX', 'US', 'GLOBAL']).optional(),
  symbol: z.string().regex(SYMBOL_PATTERN).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  try {
    const threads = await listUserChatThreads(user.uid, 50)
    return NextResponse.json({ threads }, { headers: NO_STORE })
  } catch (err) {
    return failure('List committee chat threads', err)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = await readBody(request, CreateBody)
  if (!body.ok) return body.response

  try {
    const thread = await createUserChatThread(user.uid, {
      title: body.data.title,
      topic: body.data.topic,
      symbol: body.data.symbol,
      market: body.data.market,
    })
    return NextResponse.json({ thread }, { headers: NO_STORE })
  } catch (err) {
    return failure('Create committee chat thread', err)
  }
}
