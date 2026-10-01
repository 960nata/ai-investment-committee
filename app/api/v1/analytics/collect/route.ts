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

import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clientIp,
  deviceClass,
  geoFromHeaders,
  hashVisitor,
  lookupGeo,
} from '@/lib/analytics/geo'
import { recordClicks, recordVisit } from '@/lib/db/visit-queries'
import { browserOf, osOf, referrerHost } from '@/lib/analytics/user-agent'
import { maybeRunAutoNews } from '@/lib/news/auto-tick'
import { maybePumpPipeline } from '@/lib/jobs/auto-pipeline'

export const dynamic = 'force-dynamic'
/**
 * Beacon ini juga memicu warta otomatis lewat `after()` (lihat
 * lib/news/auto-tick.ts), dan `after()` hanya boleh berjalan selama batas
 * waktu route-nya. Menulis satu warta butuh beberapa panggilan model.
 */
export const maxDuration = 300

// Hanya jalur relatif. Halaman yang mengaku beralamat di situs lain tidak
// menambah apa pun selain baris sampah di tabel.
const Path = z
  .string()
  .max(255)
  .refine((value) => value.startsWith('/') && !value.startsWith('//'), 'Jalur tidak sah')

/** Alamat rahasia formulir masuk admin (lihat proxy.ts) — tidak boleh tercatat. */
function isAdminLoginPath(path: string): boolean {
  const slug = process.env.ADMIN_LOGIN_SLUG?.trim().replace(/^\/+|\/+$/g, '')
  return !!slug && path === `/${slug}`
}

const Fraction = z.number().finite().min(0).max(1)

/** Klik dikirim berkelompok per halaman; lihat VisitBeacon. */
const ClickSchema = z.object({
  type: z.literal('click'),
  path: Path,
  clicks: z
    .array(
      z.object({
        x: Fraction,
        y: Fraction,
        label: z.string().max(200).nullable().optional(),
        href: z.string().max(500).nullable().optional(),
        tag: z.string().max(16).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
})

const BeaconSchema = z.object({
  type: z.literal('view').optional(),
  path: Path,
  referrer: z.string().max(1000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent')

  const clicks = ClickSchema.safeParse(body)
  if (clicks.success) {
    const device = deviceClass(userAgent)
    if (device === 'bot') return NextResponse.json({ ok: true, skipped: 'bot' })
    try {
      const visitorHash = hashVisitor(clientIp(req), userAgent)
      await recordClicks(
        clicks.data.clicks.map((c) => ({
          visitorHash,
          path: clicks.data.path.slice(0, 255),
          label: c.label?.trim().slice(0, 80) || null,
          // Hanya jalur atau host tujuan; kueri tautan tidak disimpan.
          href: c.href ? c.href.split(/[?#]/)[0].slice(0, 255) : null,
          tag: c.tag?.slice(0, 16) ?? null,
          xPct: c.x,
          yPct: c.y,
          deviceClass: device,
        })),
      )
    } catch (err) {
      console.error('[analytics/collect] klik', err)
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = BeaconSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Perayap mesin telusur bukan pengunjung yang sedang dianalisis, dan
  // memasukkannya membuat kota tempat pusat data Google berdiri tampak seperti
  // pasar terbesar situs ini.
  const device = deviceClass(userAgent)
  if (device === 'bot') {
    return NextResponse.json({ ok: true, skipped: 'bot' })
  }

  // Setelah jawaban terkirim: pengunjung tidak pernah menunggu warta ditulis.
  after(() =>
    maybeRunAutoNews().catch((err) =>
      console.error('[analytics/collect] warta otomatis:', err instanceof Error ? err.message : err),
    ),
  )
  // Pipeline harga, fitur, skor, dan alert — lihat lib/jobs/auto-pipeline.ts.
  after(() => maybePumpPipeline())

  // Halaman admin dipicu (di atas) tetapi tidak dicatat: kunjungan pengelola
  // sendiri bukan pengunjung, dan mencampurnya mengaburkan angka retensi.
  if (parsed.data.path === '/admin' || parsed.data.path.startsWith('/admin/') || isAdminLoginPath(parsed.data.path)) {
    return NextResponse.json({ ok: true, skipped: 'admin' })
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
      browser: browserOf(userAgent),
      os: osOf(userAgent),
      referrer: referrerHost(parsed.data.referrer, req.nextUrl.hostname),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Telemetri yang gagal tidak boleh terlihat oleh pengunjung sama sekali.
    // Dicatat di server, dijawab "baik" ke peramban.
    console.error('[analytics/collect]', err)
    return NextResponse.json({ ok: true })
  }
}
