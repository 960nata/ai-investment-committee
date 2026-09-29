/**
 * GET /api/v1/committee/latest — sidang komite terakhir yang selesai.
 *
 * Publik, tanpa akun: dipakai bagian "Cara sidang berjalan" di beranda untuk
 * memutar sidang sungguhan dan memeriksa berkala apakah ada sidang baru.
 * Hanya membaca hasil yang sudah tersimpan — tidak pernah memanggil model —
 * dan yang dikirim hanya isi panggung (kalimat per agen, blok fakta, putusan),
 * tanpa siapa yang meminta sidangnya.
 */

import { NextResponse } from 'next/server'
import { getLatestCompletedAgentSession } from '@/lib/db/queries'
import { toLiveSession } from '@/lib/agents/session-view'
import { failure } from '@/lib/http/errors'

export async function GET() {
  try {
    const data = await getLatestCompletedAgentSession()
    return NextResponse.json(
      { session: data ? toLiveSession(data.session, data.turns) : null },
      // Beranda memeriksa tiap menit; CDN menahan jawaban 30 detik supaya
      // banyak pengunjung sekaligus tetap berarti satu kueri.
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    )
  } catch (err) {
    return failure('Committee latest GET', err)
  }
}
