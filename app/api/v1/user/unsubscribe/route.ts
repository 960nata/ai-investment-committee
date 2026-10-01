/**
 * Berhenti menerima email, dari tautan di kaki tiap email.
 *
 * Tidak butuh sesi masuk — orang yang membaca email di ponsel tidak boleh
 * dipaksa masuk dulu hanya untuk berhenti. Yang membuktikan pemiliknya adalah
 * token HMAC di tautan (lihat lib/member/email.ts). POST juga diterima untuk
 * "satu klik" dari klien email lewat header List-Unsubscribe.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { setEmailOptOut, verifyUnsubscribeToken } from '@/lib/member/email'
import { NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest): Promise<NextResponse> {
  const userId = Number(req.nextUrl.searchParams.get('u'))
  const token = req.nextUrl.searchParams.get('t') ?? ''
  if (!Number.isInteger(userId) || userId <= 0 || !verifyUnsubscribeToken(userId, token)) {
    return new NextResponse('Tautan tidak sah.', { status: 400, headers: { ...NO_STORE, 'content-type': 'text/plain; charset=utf-8' } })
  }
  await setEmailOptOut(userId, true)
  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Berhenti berlangganan</title>' +
      '<body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;line-height:1.6">' +
      '<h1 style="font-size:20px">Anda tidak akan menerima email lagi.</h1>' +
      '<p>Alert tetap tercatat di kotak notifikasi akun Anda.</p><p><a href="/">Kembali ke beranda</a></p></body>',
    { headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8' } },
  )
}

export const GET = handle
export const POST = handle
