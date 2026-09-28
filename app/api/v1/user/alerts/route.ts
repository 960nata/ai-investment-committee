import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { getInstrumentById } from '@/lib/db/queries'
import {
  ALERT_KINDS,
  createAlert,
  listAlerts,
  listLatestVerdictByInstrument,
} from '@/lib/db/member-queries'
import { getEntitlement } from '@/lib/db/premium-queries'
import { badRequest, failure, notFound, NO_STORE, unauthorized } from '@/lib/http/errors'
import { InstrumentId, readBody } from '@/lib/member/http'

export const dynamic = 'force-dynamic'

const Body = z
  .object({
    instrumentId: InstrumentId,
    kind: z.enum(ALERT_KINDS),
    threshold: z.number().finite().nullable().optional(),
    horizon: z.enum(['pendek', 'menengah', 'panjang']).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'putusan_berubah') return
    if (v.threshold === null || v.threshold === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Ambang wajib diisi untuk alert harga dan skor.' })
      return
    }
    if (v.kind.startsWith('harga') && v.threshold <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Ambang harga harus lebih dari nol.' })
    }
    if (v.kind.startsWith('skor') && (v.threshold < -10 || v.threshold > 10)) {
      ctx.addIssue({ code: 'custom', message: 'Skor berada di rentang −10 sampai +10.' })
    }
  })

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  try {
    return NextResponse.json({ alerts: await listAlerts(user.uid) }, { headers: NO_STORE })
  } catch (err) {
    return failure('Alerts GET', err)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await readBody(request, Body)
  if (!body.ok) return body.response
  const input = body.data

  try {
    if (!(await getInstrumentById(input.instrumentId))) return notFound('Instrumen tidak ditemukan')

    // Alert putusan mulai dari putusan yang berlaku sekarang, supaya notifikasi
    // pertama benar-benar berarti "berubah", bukan "sudah ada putusan".
    let lastVerdict: string | null = null
    if (input.kind === 'putusan_berubah') {
      lastVerdict = (await listLatestVerdictByInstrument([input.instrumentId])).get(input.instrumentId)?.verdict ?? null
    }

    const { limits, isPremium, forSale } = await getEntitlement(user.uid)
    const result = await createAlert(user.uid, {
      instrumentId: input.instrumentId,
      kind: input.kind,
      threshold: input.kind === 'putusan_berubah' ? null : (input.threshold ?? null),
      horizon: input.kind.startsWith('skor') ? (input.horizon ?? 'menengah') : null,
      lastVerdict,
    }, limits.alerts)
    if (result === 'full') {
      return badRequest(
        `Alert maksimal ${limits.alerts} per akun${isPremium || !forSale ? '' : ' gratis. Premium membuka batas lebih besar'}.`,
      )
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return failure('Alerts POST', err)
  }
}
