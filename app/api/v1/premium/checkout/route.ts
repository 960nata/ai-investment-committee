/**
 * Buat tagihan Premium di Tripay.
 *
 * Peramban hanya mengirim kode paket dan kode kanal. Harga, durasi, dan nama
 * paket dibaca ulang dari pengaturan di server — nominal dari peramban tidak
 * pernah dipercaya.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import {
  attachTripayReference,
  countRecentUnpaid,
  createPendingOrder,
  getPublicPremiumSettings,
  markOrderFailed,
  newMerchantRef,
} from '@/lib/db/premium-queries'
import { createTransaction, isTripayConfigured, listChannels, TripayError } from '@/lib/payment/tripay'
import { badRequest, failure, NO_STORE, unauthorized } from '@/lib/http/errors'
import { readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  planId: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Paket tidak sah.'),
  method: z.string().regex(/^[A-Z0-9_]{2,32}$/, 'Metode pembayaran tidak sah.'),
})

/** Tagihan dibiarkan terbuka sehari; cukup untuk transfer VA dari ATM. */
const EXPIRES_IN_SECONDS = 24 * 3600

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = await readBody(request, Body)
  if (!body.ok) return body.response

  if (!isTripayConfigured()) {
    return NextResponse.json(
      { error: 'Pembayaran belum dibuka. Silakan coba lagi nanti.' },
      { status: 503, headers: NO_STORE },
    )
  }

  const settings = await getPublicPremiumSettings()
  if (!settings) return badRequest('Premium sedang tidak dijual.')

  const plan = settings.plans.find((p) => p.id === body.data.planId && p.isActive)
  if (!plan) return badRequest('Paket tidak ditemukan atau sudah tidak dijual.')

  let merchantRef: string | null = null
  try {
    const channels = await listChannels()
    const channel = channels.find((c) => c.code === body.data.method)
    if (!channel) return badRequest('Metode pembayaran tidak tersedia.')
    if ((channel.minAmount && plan.price < channel.minAmount) || (channel.maxAmount && plan.price > channel.maxAmount)) {
      return badRequest(`${channel.name} tidak menerima nominal ini. Pilih metode lain.`)
    }

    if ((await countRecentUnpaid(user.uid)) >= 5) {
      return badRequest('Terlalu banyak tagihan yang belum dibayar. Selesaikan atau tunggu satu jam.')
    }

    merchantRef = newMerchantRef(user.uid)
    await createPendingOrder({ merchantRef, userId: user.uid, plan, method: channel.code })

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? new URL(request.url).origin
    const tx = await createTransaction({
      method: channel.code,
      merchantRef,
      amount: plan.price,
      customerName: user.name || user.email,
      customerEmail: user.email,
      itemSku: `PREMIUM-${plan.id}`.toUpperCase(),
      itemName: `AI Investdesk Premium · ${plan.label}`,
      returnUrl: `${origin}/premium?ref=${encodeURIComponent(merchantRef)}`,
      callbackUrl: `${origin}/api/v1/payment/tripay/callback`,
      expiresInSeconds: EXPIRES_IN_SECONDS,
    })

    await attachTripayReference(merchantRef, tx.reference, tx.checkoutUrl)
    return NextResponse.json({ ok: true, checkoutUrl: tx.checkoutUrl, merchantRef }, { headers: NO_STORE })
  } catch (err) {
    if (merchantRef) await markOrderFailed(merchantRef).catch(() => undefined)
    if (err instanceof TripayError) {
      console.error('[premium/checkout] Tripay menolak:', err.message)
      return NextResponse.json(
        { error: 'Gerbang pembayaran menolak tagihan ini. Coba metode lain atau ulangi sebentar lagi.' },
        { status: 502, headers: NO_STORE },
      )
    }
    return failure('Premium checkout', err)
  }
}
