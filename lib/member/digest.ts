/**
 * Ringkasan mingguan lewat email.
 *
 * Job `ringkasan-mingguan` dijadwalkan harian, tetapi tiap pengguna diklaim
 * secara atomik lewat `digest_sent_at` dengan jarak minimal enam hari — jadi
 * satu orang paling banyak menerima satu email seminggu, berapa kali pun job
 * ini terpicu, dan pengguna baru tidak perlu menunggu hari tertentu.
 *
 * Isinya watchlist pengguna: harga, perubahan seminggu, dan skor menengah.
 * Pengguna yang watchlist-nya masih kosong menerima instrumen dengan skor
 * tertinggi minggu ini beserta ajakan menyusun watchlist — justru merekalah
 * yang paling mungkin tidak pernah kembali.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { ensureMemberTables } from '@/lib/db/member-queries'
import { formatPriceIn } from '@/lib/format/market'
import { SITE_NAME } from '@/lib/brand'
import { loadMarketView, type MarketRow } from './market-view'
import { appUrl, emailDelivery, emailLayout, escapeHtml, sendEmail, type Delivery } from './email'

const MIN_GAP_DAYS = 6
const MAX_ROWS = 12
/** Batas per putaran supaya satu invocation tidak melewati batas waktu function. */
const MAX_PER_RUN = 200

export interface DigestReport {
  sent: number
  skipped: number
  failed: number
  errors: string[]
  delivery: Delivery
}

type Candidate = {
  id: number
  email: string
  name: string
}

export async function sendWeeklyDigests(): Promise<DigestReport> {
  const report: DigestReport = { sent: 0, skipped: 0, failed: 0, errors: [], delivery: emailDelivery() }
  if (report.delivery === 'off') return report

  await ensureMemberTables()

  const candidates = await db.execute<Candidate>(sql`
    select id, email, name from app_user
    where is_active and not email_opt_out
      and (digest_sent_at is null or digest_sent_at < now() - make_interval(days => ${MIN_GAP_DAYS}))
    order by id
    limit ${MAX_PER_RUN}
  `)
  if (candidates.length === 0) return report

  const [market, watchRows, weekAgo] = await Promise.all([
    loadMarketView(),
    db.execute<{ user_id: number; instrument_id: number }>(sql`select user_id, instrument_id from watchlist_item`),
    weekAgoCloses(),
  ])
  const byId = new Map(market.map((m) => [m.id, m]))
  const watch = new Map<number, number[]>()
  for (const r of watchRows) watch.set(r.user_id, [...(watch.get(r.user_id) ?? []), r.instrument_id])

  const topPicks = market
    .filter((m) => m.scores.menengah && m.lastClose !== null)
    .sort((a, b) => b.scores.menengah!.score - a.scores.menengah!.score)
    .slice(0, 5)

  for (const user of candidates) {
    // Klaim dulu, kirim kemudian: dua putaran yang berjalan bersamaan tidak
    // mengirim email yang sama dua kali.
    const claimed = await db.execute<{ id: number }>(sql`
      update app_user set digest_sent_at = now()
      where id = ${user.id}
        and (digest_sent_at is null or digest_sent_at < now() - make_interval(days => ${MIN_GAP_DAYS}))
      returning id
    `)
    if (claimed.length === 0) {
      report.skipped++
      continue
    }

    const ids = watch.get(user.id) ?? []
    const rows = ids.map((id) => byId.get(id)).filter((m): m is MarketRow => !!m).slice(0, MAX_ROWS)
    const hasWatchlist = rows.length > 0

    const subject = hasWatchlist
      ? `Watchlist Anda minggu ini — ${rows.length} instrumen`
      : `Skor tertinggi minggu ini di ${SITE_NAME}`
    const intro = hasWatchlist
      ? `Halo ${escapeHtml(firstName(user.name))}, ini pergerakan instrumen di watchlist Anda selama seminggu terakhir.`
      : `Halo ${escapeHtml(firstName(user.name))}, watchlist Anda masih kosong. Ini lima instrumen dengan skor menengah tertinggi minggu ini — tambahkan yang Anda pegang supaya ringkasan berikutnya tentang aset Anda sendiri.`

    const html = emailLayout(
      user.id,
      subject,
      `<p style="line-height:1.6;margin:0 0 16px">${intro}</p>
${table(hasWatchlist ? rows : topPicks, weekAgo)}
<a href="${appUrl()}${hasWatchlist ? '/watchlist' : '/ringkasan'}" style="display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${hasWatchlist ? 'Lihat watchlist' : 'Susun watchlist'}</a>`,
    )

    try {
      await sendEmail({ to: user.email, userId: user.id, subject, html })
      report.sent++
    } catch (err) {
      // Kembalikan klaimnya supaya pengguna ini dicoba lagi di putaran berikutnya.
      await db.execute(sql`update app_user set digest_sent_at = null where id = ${user.id}`).catch(() => {})
      report.failed++
      report.errors.push(`${user.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return report
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Investor'
}

/** Penutupan terakhir yang berumur minimal tujuh hari, per instrumen. */
async function weekAgoCloses(): Promise<Map<number, number>> {
  const rows = await db.execute<{ instrument_id: number; close: string }>(sql`
    select distinct on (instrument_id) instrument_id, close
    from candle_daily
    where date <= current_date - 7 and date > current_date - 21
    order by instrument_id, date desc
  `)
  return new Map(rows.map((r) => [Number(r.instrument_id), Number(r.close)]))
}

function table(rows: MarketRow[], weekAgo: Map<number, number>): string {
  const cell = 'padding:8px 6px;border-bottom:1px solid #eee;font-size:13px'
  const body = rows
    .map((m) => {
      const prev = weekAgo.get(m.id)
      const change = prev && m.lastClose !== null ? ((m.lastClose - prev) / prev) * 100 : null
      const color = change === null ? '#777' : change >= 0 ? '#0a7d3b' : '#b42318'
      const score = m.scores.menengah?.score
      return `<tr>
<td style="${cell}"><a href="${appUrl()}/saham/${encodeURIComponent(m.symbol)}" style="color:#111;font-weight:700;text-decoration:none">${escapeHtml(m.symbol)}</a><br><span style="color:#777;font-size:12px">${escapeHtml(m.name)}</span></td>
<td style="${cell};text-align:right">${m.lastClose === null ? '—' : formatPriceIn(m.lastClose, m.currency)}</td>
<td style="${cell};text-align:right;color:${color}">${change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}</td>
<td style="${cell};text-align:right">${score === undefined ? '—' : score.toFixed(2)}</td>
</tr>`
    })
    .join('')
  const head = 'padding:6px;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.04em'
  return `<table style="width:100%;border-collapse:collapse">
<tr><th style="${head};text-align:left">Instrumen</th><th style="${head};text-align:right">Harga</th><th style="${head};text-align:right">7 hari</th><th style="${head};text-align:right">Skor</th></tr>
${body}
</table>`
}
