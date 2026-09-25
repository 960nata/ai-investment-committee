/**
 * Penerima ketukan kunjungan.
 *
 * Pencatatannya sengaja lewat permintaan terpisah dari peramban, bukan di dalam
 * `proxy.ts`. Proxy berjalan sebelum tiap permintaan, termasuk prefetch dan
 * berkas statis; menulis ke Postgres di sana berarti menambahkan satu perjalanan
 * ke basis data pada jalur kritis tiap muatan halaman, demi angka yang tidak
 * seorang pun menunggu.
 *
 * Yang dibaca dari permintaan ini cuma dua: lokasi menurut tepi jaringan, dan
 * jalur halaman yang dikirim peramban. Alamat IP-nya dipakai sekejap untuk
 * membuat sidik ber-garam, lalu dilupakan — lihat `lib/analytics/geo.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clientIp,
  deviceClass,
  geoFromHeaders,
  hashVisitor,
  lookupGeo,
} from '@/lib/analytics/geo'
import { recordVisit } from '@/lib/db/visit-queries'

export const dynamic = 'force-dynamic'

const BeaconSchema = z.object({
  // Hanya jalur relatif. Halaman yang mengaku beralamat di situs lain tidak
  // menambah apa pun selain baris sampah di tabel.
  path: z
    .string()
    .max(255)
    .refine((value) => value.startsWith('/') && !value.startsWith('//'), 'Jalur tidak sah'),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const parsed = BeaconSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent')

  // Perayap mesin telusur bukan pengunjung yang sedang dianalisis, dan
  // memasukkannya membuat kota tempat pusat data Google berdiri tampak seperti
  // pasar terbesar situs ini.
  const device = deviceClass(userAgent)
  if (device === 'bot') {
    return NextResponse.json({ ok: true, skipped: 'bot' })
  }

  try {
    const ip = clientIp(req)

    // Tepi jaringan lebih dulu; penelusuran luar hanya kalau tepi diam, dan itu
    // praktis cuma terjadi di luar Vercel.
    let geo = geoFromHeaders(req)
    if (geo.source === 'unknown' && ip) {
      geo = await lookupGeo(ip)
    }

    await recordVisit({
      visitorHash: hashVisitor(ip, userAgent),
      path: parsed.data.path.slice(0, 255),
      country: geo.country,
      region: geo.region,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      deviceClass: device,
      geoSource: geo.source,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Telemetri yang gagal tidak boleh terlihat oleh pengunjung sama sekali.
    // Dicatat di server, dijawab "baik" ke peramban.
    console.error('[analytics/collect]', err)
    return NextResponse.json({ ok: true })
  }
}
