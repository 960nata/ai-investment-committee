/**
 * GET /api/v1/ai/status
 *
 * Penyedia LLM mana yang benar-benar siap dipakai komite.
 *
 * Endpoint ini TIDAK memanggil penyedia mana pun. Yang dilaporkan adalah apa
 * yang bisa diketahui tanpa membakar kuota: berapa kunci terpungut dari env dan
 * berapa yang sedang beristirahat karena kena limit atau ditolak. Menguji kunci
 * dengan memanggil model setiap kali halaman dibuka akan menghabiskan kuota
 * yang justru sedang diukur.
 *
 * Kunci tidak pernah ikut keluar — hanya jumlah, indeks, dan sidik pendeknya.
 */

import { NextResponse } from 'next/server'
import { isLlmConfigured, llmStatus } from '@/lib/ai/registry'
import { cache } from '@/lib/cache/redis'
import { requireAdmin } from '@/lib/http/auth'
import { failure, unauthorized, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Isinya bukan rahasia — sidik kunci tidak bisa dikembalikan menjadi kuncinya.
  // Tetapi daftar penyedia yang dipakai, berapa kunci per penyedia, dan kunci
  // mana yang sedang kena limit adalah peta operasional, dan pengunjung anonim
  // tidak punya alasan memilikinya.
  if (!requireAdmin(request).ok) return unauthorized()

  try {
    const providers = await llmStatus()
    const ready = providers.filter((p) => p.available > 0)

    return NextResponse.json(
      {
        configured: isLlmConfigured(),
        // Tanpa Redis, pendinginan kunci tidak bertahan antar-invocation, jadi
        // angka "cooling" di produksi akan selalu nol dan menyesatkan.
        cooldownPersisted: cache.isAvailable(),
        summary:
          providers.length === 0
            ? 'Belum ada penyedia LLM terkonfigurasi. Isi minimal satu kunci.'
            : `${ready.length} dari ${providers.length} penyedia siap, ` +
              `${ready.reduce((n, p) => n + p.available, 0)} kunci tersedia.`,
        providers,
        generatedAt: new Date().toISOString(),
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    return failure('api/v1/ai/status', err)
  }
}
