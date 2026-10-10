/**
 * Data galian untuk peneliti rapat project.
 *
 * Angka di `metrics.ts` menjawab "berapa"; bahan di sini menjawab "kenapa" dan
 * "apa yang belum ada": alasan baris dikarantina, alasan komite abstain,
 * halaman yang dibaca orang, fitur yang dipakai atau dibiarkan, dan layanan
 * mana yang sudah terpasang. Tanpa bahan ini peneliti hanya bisa mengusulkan
 * hal yang sudah tertulis di laporan.
 *
 * Status integrasi hanya ya/tidak dari keberadaan variabel lingkungan —
 * nilainya tidak pernah dibaca ke sini, apalagi dikirim ke model.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { section, type Section } from './metrics'

const n = (v: unknown) => Number(v ?? 0)
const has = (...names: string[]) => names.every((k) => !!process.env[k]?.trim())

export interface DeepDive {
  alasanKarantina: Section<{ sumber: string; alasan: string; jumlah: number }[]>
  alasanAbstain: Section<{ alasan: string; jumlah: number }[]>
  halamanTeratas: Section<{ halaman: string; tayangan: number; pengunjung: number }[]>
  rujukanTeratas: Section<{ rujukan: string; tayangan: number }[]>
  wartaPerKategori: Section<{ kategori: string; terbit: number; rataDibaca: number }[]>
  pemakaianFitur: Section<Record<string, number | string>>
  integrasi: Record<string, boolean>
}

export async function collectDeepDive(from: Date, to: Date): Promise<DeepDive> {
  const f = from.toISOString()
  const t = to.toISOString()
  const inWindow = (col: string) => sql`${sql.raw(col)} >= ${f}::timestamptz AND ${sql.raw(col)} < ${t}::timestamptz`

  const [alasanKarantina, alasanAbstain, halamanTeratas, rujukanTeratas, wartaPerKategori, pemakaianFitur] = await Promise.all([
    section(async () =>
      (
        await db.execute<{ sumber: string; alasan: string; jumlah: number }>(sql`
          SELECT source_id AS sumber, LEFT(regexp_replace(reason, '[0-9.]+', '#', 'g'), 120) AS alasan, COUNT(*)::int AS jumlah
          FROM ingest_quarantine WHERE ${inWindow('created_at')}
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 6
        `)
      ).map((r) => ({ ...r, jumlah: n(r.jumlah) })),
    ),
    section(async () =>
      (
        await db.execute<{ alasan: string; jumlah: number }>(sql`
          SELECT LEFT(regexp_replace(rationale, '[0-9.,]+', '#', 'g'), 140) AS alasan, COUNT(*)::int AS jumlah
          FROM agent_session WHERE verdict = 'abstain' AND rationale IS NOT NULL AND ${inWindow('started_at')}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 5
        `)
      ).map((r) => ({ ...r, jumlah: n(r.jumlah) })),
    ),
    section(async () =>
      (
        await db.execute<{ halaman: string; tayangan: number; pengunjung: number }>(sql`
          SELECT path AS halaman, COUNT(*)::int AS tayangan, COUNT(DISTINCT visitor_hash)::int AS pengunjung
          FROM visit_log WHERE ${inWindow('created_at')} AND path NOT LIKE '/admin%'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 10
        `)
      ).map((r) => ({ ...r, tayangan: n(r.tayangan), pengunjung: n(r.pengunjung) })),
    ),
    section(async () =>
      (
        await db.execute<{ rujukan: string; tayangan: number }>(sql`
          SELECT COALESCE(NULLIF(referrer, ''), '(langsung)') AS rujukan, COUNT(*)::int AS tayangan
          FROM visit_log WHERE ${inWindow('created_at')} AND path NOT LIKE '/admin%'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 6
        `)
      ).map((r) => ({ ...r, tayangan: n(r.tayangan) })),
    ),
    section(async () =>
      (
        await db.execute<{ kategori: string; terbit: number; rata: number }>(sql`
          SELECT category AS kategori, COUNT(*)::int AS terbit, ROUND(AVG(views_count))::int AS rata
          FROM market_news WHERE created_at >= (${t}::timestamptz - INTERVAL '30 days') AND created_at < ${t}::timestamptz
          GROUP BY 1 ORDER BY 3 DESC
        `)
      ).map((r) => ({ kategori: r.kategori, terbit: n(r.terbit), rataDibaca: n(r.rata) })),
    ),
    section(async () => {
      // Tiap tabel dibaca terpisah: fitur Beta yang belum pernah dipakai bisa
      // belum punya tabelnya sama sekali.
      const count = async (label: string, q: ReturnType<typeof sql>) => {
        try {
          const [r] = await db.execute<{ n: number }>(q)
          return [label, n(r?.n)] as const
        } catch {
          return [label, 'tabel belum ada'] as const
        }
      }
      // Berurutan: bagian lain sedang memakai kolam koneksi bersamaan.
      const out: Record<string, number | string> = {}
      for (const [label, q] of [
        ['watchlistBaru', sql`SELECT COUNT(*)::int AS n FROM watchlist_item WHERE ${inWindow('created_at')}`],
        ['posisiPortofolioBaru', sql`SELECT COUNT(*)::int AS n FROM portfolio_position WHERE ${inWindow('created_at')}`],
        ['alertHargaBaru', sql`SELECT COUNT(*)::int AS n FROM price_alert WHERE ${inWindow('created_at')}`],
        ['pesanTanyaKomite', sql`SELECT COUNT(*)::int AS n FROM committee_chat_message WHERE ${inWindow('created_at')}`],
        ['putaranSimulator', sql`SELECT COUNT(*)::int AS n FROM sim_desk_run WHERE ${inWindow('created_at')}`],
        ['pesananPremium', sql`SELECT COUNT(*)::int AS n FROM premium_order WHERE ${inWindow('created_at')}`],
        ['backtest', sql`SELECT COUNT(*)::int AS n FROM backtest_run`],
      ] as const) {
        const [k, v] = await count(label, q)
        out[k] = v
      }
      return out
    }),
  ])

  return {
    alasanKarantina,
    alasanAbstain,
    halamanTeratas,
    rujukanTeratas,
    wartaPerKategori,
    pemakaianFitur,
    integrasi: {
      redisCache: has('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'),
      antrianQStash: has('QSTASH_TOKEN'),
      emailResend: has('RESEND_API_KEY'),
      pembayaranTripay: has('TRIPAY_API_KEY', 'TRIPAY_PRIVATE_KEY', 'TRIPAY_MERCHANT_CODE'),
      googleAnalytics4Api: has('GA4_PROPERTY_ID'),
      fotoPexels: has('PEXELS_API_KEY'),
      fotoUnsplash: has('UNSPLASH_ACCESS_KEY'),
      videoYoutube: has('YOUTUBE_API_KEY'),
      captchaTurnstile: has('TURNSTILE_SECRET_KEY'),
      iklanAdsense: has('NEXT_PUBLIC_ADSENSE_CLIENT'),
      llmPremiumBerbayar: has('PREMIUM_LLM_MODEL'),
      // Sumber harga dan makro yang dipakai tanpa kunci — dicatat supaya
      // peneliti tahu apa yang sudah ada sebelum mengusulkan pengganti.
      hargaYahooTanpaKunci: true,
      kriptoBinanceTanpaKunci: true,
      makroFredBankDunia: true,
      kalenderForexFactory: true,
      fundamentalSecEdgar: true,
      kepemilikanKsei: true,
      beritaRss: true,
    },
  }
}
