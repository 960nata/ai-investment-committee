/**
 * Callback pembayaran Tripay.
 *
 * Satu-satunya pintu yang bisa mengaktifkan Premium berbayar, jadi satu-satunya
 * yang dipercaya adalah tanda tangan HMAC atas badan mentah. Tanpa sesi, tanpa
 * cookie — yang memanggil adalah server Tripay.
 *
 * Tripay menganggap callback gagal bila jawabannya bukan `{ success: true }`
 * dan akan mengulanginya. Karena itu pesanan yang tidak dikenal atau sudah
 * diproses tetap dijawab sukses: mengulanginya tidak akan mengubah apa pun,
 * dan hanya membanjiri log.
 */

import { NextResponse } from 'next/server'
import { applyTripayCallback } from '@/lib/db/premium-queries'
import { verifyCallbackSignature, type TripayCallback } from '@/lib/payment/tripay'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const raw = await request.text()

  if (!verifyCallbackSignature(raw, request.headers.get('x-callback-signature'))) {
    console.warn('[tripay/callback] tanda tangan tidak cocok')
    return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
  }

  if (request.headers.get('x-callback-event') !== 'payment_status') {
    return NextResponse.json({ success: true })
  }

  let payload: TripayCallback
  try {
    payload = JSON.parse(raw) as TripayCallback
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof payload.merchant_ref !== 'string' || typeof payload.status !== 'string') {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 })
  }

  try {
    const outcome = await applyTripayCallback(payload)
    console.log(`[tripay/callback] ${payload.merchant_ref} ${payload.status} -> ${outcome}`)
    if (outcome === 'amount_mismatch') {
      console.error(`[tripay/callback] nominal ${payload.total_amount} kurang dari harga pesanan ${payload.merchant_ref}`)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    // Galat basis data: jawab gagal supaya Tripay mengulang nanti.
    console.error('[tripay/callback] gagal menerapkan:', err)
    return NextResponse.json({ success: false, message: 'Temporary failure' }, { status: 500 })
  }
}
