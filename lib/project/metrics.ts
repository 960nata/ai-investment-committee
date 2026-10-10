/**
 * Angka project untuk satu rentang waktu, dibaca langsung dari basis data.
 *
 * Inilah satu-satunya bahan rapat project. Agen rapat dilarang menyebut angka
 * yang tidak ada di sini — aturan yang sama dengan komite investasi — jadi
 * setiap bagian yang gagal dibaca ditulis "tidak tersedia", bukan nol: nol
 * berarti "tidak ada", dan itu klaim yang berbeda.
 *
 * Tiap bagian dibaca terpisah dan kegagalannya ditelan per bagian: satu tabel
 * yang belum ada di basis data tidak boleh menggagalkan seluruh laporan.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { llmStatus } from '@/lib/ai/registry'
import { STALE_LIMIT_DAYS } from '@/lib/agents/facts'
import { TRANSLATED_LOCALES } from '@/lib/i18n/locales'
import { getMacroCalendar, upcomingHighImpact } from '@/lib/macro/calendar'
import { ledgerTotals, syncPremiumIncome, type ProjectIssue } from './store'

export type Section<T> = T | { tidakTersedia: string }

export async function section<T>(read: () => Promise<T>): Promise<Section<T>> {
  try {
    return await read()
  } catch (err) {
    // Drizzle membungkus galat Postgres; pesan aslinya ada di `cause`, bukan di teks kueri.
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err
    return { tidakTersedia: cause instanceof Error ? cause.message.slice(0, 160) : String(cause) }
  }
}

export function isMissing<T>(s: Section<T>): s is { tidakTersedia: string } {
  return typeof s === 'object' && s !== null && 'tidakTersedia' in s
}

const n = (v: unknown) => Number(v ?? 0)

export interface ProjectMetrics {
  rentang: { mulai: string; selesai: string; hari: number }
  pengunjung: Section<{ tayangan: number; pengunjungUnik: number; tayanganSebelumnya: number; pengunjungSebelumnya: number }>
  pengguna: Section<{ total: number; baru: number; aktifLogin: number; premiumAktif: number }>
  komite: Section<{
    sidang: number
    selesai: number
    gagal: number
    abstain: number
    rataKeyakinan: number | null
    giliranDigantikan: number
    galatTeratas: string[]
  }>
  ai: Section<{
    panggilanTercatat: number
    token: number
    perPenyedia: { penyedia: string; panggilan: number; token: number }[]
    penyediaGagalTerbanyak: { penyedia: string; kali: number }[]
  }>
  warta: Section<{ terbit: number; belumLengkapTerjemahan: number; dibaca: number }>
  job: Section<{
    total: number
    sukses: number
    sebagian: number
    gagal: number
    gagalPerJob: { job: string; gagal: number; galat: string | null }[]
  }>
  data: Section<{
    /** `basi`: pernah terisi tapi tertinggal. `belumTerisi`: belum punya candle sama sekali (baru ditambahkan bila `baru`). */
    asetBasi: { pasar: string; basi: number; total: number; batasHari: number; belumTerisi: number; belumTerisiLama: number }[]
    sumberBermasalah: { sumber: string; status: string; gagalBeruntun: number; galat: string | null }[]
    karantinaBaru: number
  }>
  kunci: Section<{ penyedia: string; siap: number; total: number }[]>
  keuangan: Section<Awaited<ReturnType<typeof ledgerTotals>>>
  makro: Section<{ peristiwaPentingTigaHari: { judul: string; mataUang: string; waktu: string }[] }>
}

export async function collectProjectMetrics(from: Date, to: Date): Promise<ProjectMetrics> {
  const f = from.toISOString()
  const t = to.toISOString()
  const length = to.getTime() - from.getTime()
  const pf = new Date(from.getTime() - length).toISOString()
  const publicOnly = sql`path NOT LIKE '/admin%' AND path NOT LIKE '/api/%'`

  const [pengunjung, pengguna, komite, ai, warta, job, data, kunci, keuangan, makro] = await Promise.all([
    section(async () => {
      const [r] = await db.execute<Record<string, number>>(sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${f}::timestamptz) AS views,
          COUNT(DISTINCT visitor_hash) FILTER (WHERE created_at >= ${f}::timestamptz) AS visitors,
          COUNT(*) FILTER (WHERE created_at < ${f}::timestamptz) AS prev_views,
          COUNT(DISTINCT visitor_hash) FILTER (WHERE created_at < ${f}::timestamptz) AS prev_visitors
        FROM visit_log
        WHERE created_at >= ${pf}::timestamptz AND created_at < ${t}::timestamptz AND ${publicOnly}
      `)
      return {
        tayangan: n(r.views),
        pengunjungUnik: n(r.visitors),
        tayanganSebelumnya: n(r.prev_views),
        pengunjungSebelumnya: n(r.prev_visitors),
      }
    }),

    section(async () => {
      const [r] = await db.execute<Record<string, number>>(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz) AS baru,
          COUNT(*) FILTER (WHERE last_login_at >= ${f}::timestamptz AND last_login_at < ${t}::timestamptz) AS aktif,
          COUNT(*) FILTER (WHERE premium_until > NOW()) AS premium
        FROM app_user WHERE is_active
      `)
      return { total: n(r.total), baru: n(r.baru), aktifLogin: n(r.aktif), premiumAktif: n(r.premium) }
    }),

    section(async () => {
      const [r] = await db.execute<Record<string, number | null>>(sql`
        SELECT
          COUNT(*) AS sidang,
          COUNT(*) FILTER (WHERE status = 'done') AS selesai,
          COUNT(*) FILTER (WHERE status = 'failed') AS gagal,
          COUNT(*) FILTER (WHERE verdict = 'abstain') AS abstain,
          ROUND(AVG(confidence) FILTER (WHERE verdict IS NOT NULL AND verdict <> 'abstain')) AS keyakinan
        FROM agent_session
        WHERE started_at >= ${f}::timestamptz AND started_at < ${t}::timestamptz
      `)
      const errors = await db.execute<{ error: string; n: number }>(sql`
        SELECT LEFT(error, 140) AS error, COUNT(*)::int AS n FROM agent_session
        WHERE status = 'failed' AND started_at >= ${f}::timestamptz AND started_at < ${t}::timestamptz
        GROUP BY 1 ORDER BY 2 DESC LIMIT 3
      `)
      const replaced = await db
        .execute<{ n: number }>(sql`
          SELECT COUNT(*)::int AS n FROM ai_work_trace
          WHERE kind = 'sidang' AND jsonb_array_length(failovers) > 0
            AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz
        `)
        .catch(() => [{ n: 0 }])
      return {
        sidang: n(r.sidang),
        selesai: n(r.selesai),
        gagal: n(r.gagal),
        abstain: n(r.abstain),
        rataKeyakinan: r.keyakinan === null ? null : n(r.keyakinan),
        giliranDigantikan: n(replaced[0]?.n),
        galatTeratas: errors.map((e) => `${e.n}× ${e.error}`),
      }
    }),

    section(async () => {
      // Giliran sidang (agent_message) dan langkah warta (ai_work_trace) — dua
      // jejak tahan lama. Telemetri Redis hanya menyimpan 100 panggilan terakhir.
      const providers = await db.execute<{ penyedia: string; panggilan: number; token: number }>(sql`
        SELECT penyedia, COUNT(*)::int AS panggilan, COALESCE(SUM(token), 0)::int AS token FROM (
          SELECT provider_id AS penyedia, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS token
          FROM agent_message WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz AND provider_id IS NOT NULL
          UNION ALL
          SELECT provider_id, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)
          FROM ai_work_trace WHERE kind = 'berita' AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz
        ) x GROUP BY 1 ORDER BY 2 DESC
      `).catch(async () =>
        db.execute<{ penyedia: string; panggilan: number; token: number }>(sql`
          SELECT provider_id AS penyedia, COUNT(*)::int AS panggilan,
                 COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::int AS token
          FROM agent_message WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz AND provider_id IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC
        `),
      )
      const failing = await db
        .execute<{ penyedia: string; kali: number }>(sql`
          SELECT fo->>'providerId' AS penyedia, COUNT(*)::int AS kali
          FROM ai_work_trace, jsonb_array_elements(failovers) fo
          WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz
          GROUP BY 1 ORDER BY 2 DESC LIMIT 5
        `)
        .catch(() => [])
      return {
        panggilanTercatat: providers.reduce((s, p) => s + n(p.panggilan), 0),
        token: providers.reduce((s, p) => s + n(p.token), 0),
        perPenyedia: providers.map((p) => ({ penyedia: p.penyedia, panggilan: n(p.panggilan), token: n(p.token) })),
        penyediaGagalTerbanyak: failing.map((p) => ({ penyedia: p.penyedia, kali: n(p.kali) })),
      }
    }),

    section(async () => {
      const [r] = await db.execute<Record<string, number>>(sql`
        SELECT
          COUNT(*) AS terbit,
          COALESCE(SUM(views_count), 0) AS dibaca,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM market_news_translation tr WHERE tr.news_id = m.id) < ${TRANSLATED_LOCALES.length}) AS kurang
        FROM market_news m
        WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz
      `)
      return { terbit: n(r.terbit), belumLengkapTerjemahan: n(r.kurang), dibaca: n(r.dibaca) }
    }),

    section(async () => {
      const [r] = await db.execute<Record<string, number>>(sql`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'success') AS sukses,
               COUNT(*) FILTER (WHERE status = 'partial') AS sebagian,
               COUNT(*) FILTER (WHERE status = 'failed') AS gagal
        FROM job_run WHERE started_at >= ${f}::timestamptz AND started_at < ${t}::timestamptz
      `)
      const perJob = await db.execute<{ job: string; gagal: number; galat: string | null }>(sql`
        SELECT job_name AS job, COUNT(*)::int AS gagal, LEFT(MAX(error), 160) AS galat
        FROM job_run
        WHERE status = 'failed' AND started_at >= ${f}::timestamptz AND started_at < ${t}::timestamptz
        GROUP BY 1 ORDER BY 2 DESC LIMIT 6
      `)
      return { total: n(r.total), sukses: n(r.sukses), sebagian: n(r.sebagian), gagal: n(r.gagal), gagalPerJob: perJob }
    }),

    section(async () => {
      const stale = await db.execute<{ market: string; total: number; basi: number; kosong: number; kosong_lama: number }>(sql`
        SELECT i.market::text AS market, COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE last.d IS NULL)::int AS kosong,
               -- Instrumen baru wajar belum punya candle sampai ingest berikutnya.
               COUNT(*) FILTER (WHERE last.d IS NULL AND i.created_at < NOW() - INTERVAL '3 days')::int AS kosong_lama,
               COUNT(*) FILTER (WHERE last.d IS NOT NULL AND last.d < (NOW() AT TIME ZONE 'UTC')::date - (
                 CASE i.market::text WHEN 'crypto' THEN ${STALE_LIMIT_DAYS.CRYPTO}::int ELSE ${STALE_LIMIT_DAYS.IDX}::int END
               ))::int AS basi
        FROM instrument i
        LEFT JOIN LATERAL (SELECT MAX(c.date) AS d FROM candle_daily c WHERE c.instrument_id = i.id) last ON TRUE
        WHERE i.is_active
        GROUP BY 1 ORDER BY 1
      `)
      const sources = await db.execute<{ sumber: string; status: string; gagal: number; galat: string | null }>(sql`
        SELECT source_id AS sumber, status::text AS status, consecutive_failures AS gagal, LEFT(last_error, 160) AS galat
        FROM data_source_health WHERE status <> 'healthy' ORDER BY consecutive_failures DESC
      `)
      const [q] = await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM ingest_quarantine
        WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz
      `)
      return {
        asetBasi: stale.map((s) => ({
          pasar: s.market.toUpperCase(),
          basi: n(s.basi),
          total: n(s.total),
          batasHari: s.market === 'crypto' ? STALE_LIMIT_DAYS.CRYPTO : STALE_LIMIT_DAYS.IDX,
          belumTerisi: n(s.kosong),
          belumTerisiLama: n(s.kosong_lama),
        })),
        sumberBermasalah: sources.map((s) => ({ sumber: s.sumber, status: s.status, gagalBeruntun: n(s.gagal), galat: s.galat })),
        karantinaBaru: n(q?.n),
      }
    }),

    section(async () => (await llmStatus()).map((p) => ({ penyedia: p.id, siap: p.available, total: p.total }))),

    section(async () => {
      await syncPremiumIncome()
      return ledgerTotals(from, to)
    }),

    section(async () => {
      const cal = await getMacroCalendar()
      return {
        peristiwaPentingTigaHari: upcomingHighImpact(cal.events, 72, to.getTime()).map((e) => ({
          judul: e.title,
          mataUang: e.country,
          waktu: e.date,
        })),
      }
    }),
  ])

  return {
    rentang: { mulai: f, selesai: t, hari: Math.round(length / 86_400_000) || 1 },
    pengunjung,
    pengguna,
    komite,
    ai,
    warta,
    job,
    data,
    kunci,
    keuangan,
    makro,
  }
}

/**
 * Masalah yang terbaca dari angka, tanpa model. Dipakai pemantau per jam (untuk
 * peringatan mendesak) dan rapat (sebagai temuan yang wajib dibahas).
 *
 * Ambangnya sengaja sederhana dan tertulis di sini, supaya setiap peringatan
 * bisa dijelaskan dengan satu kalimat: "muncul karena X melewati Y".
 */
export function detectIssues(m: ProjectMetrics): ProjectIssue[] {
  const issues: ProjectIssue[] = []
  const push = (key: string, severity: ProjectIssue['severity'], title: string, detail: string) =>
    issues.push({ key, severity, title, detail })

  for (const [name, s] of Object.entries(m)) {
    if (name !== 'rentang' && isMissing(s as Section<unknown>)) {
      push(`bagian-gagal:${name}`, 'perhatian', `Data "${name}" tidak bisa dibaca`, (s as { tidakTersedia: string }).tidakTersedia)
    }
  }

  if (!isMissing(m.kunci)) {
    const configured = m.kunci.filter((k) => k.total > 0)
    const ready = configured.filter((k) => k.siap > 0)
    if (configured.length === 0) {
      push('kunci:tidak-ada', 'mendesak', 'Tidak ada penyedia AI yang terkonfigurasi', 'Semua fitur AI berhenti sampai minimal satu kunci diisi.')
    } else if (ready.length === 0) {
      push('kunci:semua-istirahat', 'mendesak', 'Semua kunci AI sedang beristirahat', 'Setiap penyedia kena limit bersamaan; sidang dan warta akan gagal sampai ada yang pulih.')
    } else if (ready.length === 1 && configured.length > 1) {
      push('kunci:tinggal-satu', 'perhatian', 'Hanya satu penyedia AI yang siap', `Yang siap: ${ready[0].penyedia}. Cadangan antar keluarga model sedang tidak ada.`)
    }
    for (const k of configured.filter((k) => k.siap === 0)) {
      push(`kunci:habis:${k.penyedia}`, 'perhatian', `Kunci ${k.penyedia} habis semua`, `${k.total} kunci beristirahat.`)
    }
  }

  if (!isMissing(m.job)) {
    for (const j of m.job.gagalPerJob) {
      const urgent = j.job.startsWith('ingest-') && j.gagal >= 2
      push(`job-gagal:${j.job}`, urgent ? 'mendesak' : 'perhatian', `Job ${j.job} gagal ${j.gagal}×`, j.galat ?? 'tanpa pesan galat')
    }
  }

  if (!isMissing(m.data)) {
    for (const a of m.data.asetBasi) {
      if (a.total === 0) continue
      if (a.belumTerisiLama > 0) {
        push(`data-kosong:${a.pasar}`, 'perhatian', `${a.belumTerisiLama} aset ${a.pasar} belum pernah terisi`, `Sudah lebih dari 3 hari di katalog tanpa satu candle pun — simbolnya mungkin salah atau tidak dikenal sumber data.`)
      }
      // Yang belum pernah terisi tidak dihitung basi: aset baru menunggu ingest berikutnya.
      const filled = a.total - a.belumTerisi
      if (filled === 0) continue
      const share = a.basi / filled
      if (share >= 0.5) {
        push(`data-basi:${a.pasar}`, 'mendesak', `Harga ${a.pasar} basi`, `${a.basi} dari ${filled} aset belum diperbarui lebih dari ${a.batasHari} hari; komite akan abstain untuk aset itu.`)
      } else if (share >= 0.2) {
        push(`data-basi:${a.pasar}`, 'perhatian', `Sebagian harga ${a.pasar} basi`, `${a.basi} dari ${filled} aset melewati ${a.batasHari} hari.`)
      }
    }
    for (const s of m.data.sumberBermasalah) {
      push(`sumber:${s.sumber}`, s.status === 'dead' ? 'mendesak' : 'perhatian', `Sumber data ${s.sumber} ${s.status}`, `${s.gagalBeruntun} kegagalan beruntun. ${s.galat ?? ''}`.trim())
    }
  }

  if (!isMissing(m.komite) && m.komite.sidang >= 4) {
    const failRate = m.komite.gagal / m.komite.sidang
    if (failRate >= 0.5) {
      push('komite:gagal-tinggi', 'mendesak', 'Separuh sidang komite gagal', `${m.komite.gagal} dari ${m.komite.sidang} sidang gagal. ${m.komite.galatTeratas[0] ?? ''}`.trim())
    } else if (failRate >= 0.2) {
      push('komite:gagal', 'perhatian', 'Banyak sidang komite gagal', `${m.komite.gagal} dari ${m.komite.sidang} sidang gagal.`)
    }
  }

  if (!isMissing(m.warta) && m.rentang.hari >= 1 && m.warta.terbit === 0) {
    push('warta:kosong', 'perhatian', 'Tidak ada warta terbit', `Selama ${m.rentang.hari} hari terakhir tidak ada artikel baru.`)
  }

  if (!isMissing(m.pengunjung) && m.pengunjung.tayanganSebelumnya >= 50) {
    const drop = 1 - m.pengunjung.tayangan / m.pengunjung.tayanganSebelumnya
    if (drop >= 0.5) {
      push('pengunjung:anjlok', 'perhatian', 'Tayangan anjlok', `Turun ${Math.round(drop * 100)}% dari periode sebelumnya (${m.pengunjung.tayanganSebelumnya} → ${m.pengunjung.tayangan}).`)
    }
  }

  if (!isMissing(m.keuangan) && m.keuangan.saldoKeseluruhan < 0) {
    push('kas:minus', 'mendesak', 'Saldo kas minus', `Saldo buku kas Rp ${m.keuangan.saldoKeseluruhan.toLocaleString('id-ID')}.`)
  }

  return issues
}
