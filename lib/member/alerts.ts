/**
 * Evaluator alert.
 *
 * Dijalankan dari dua tempat: job terjadwal `evaluasi-alert` (seluruh
 * pengguna, tiap jam) dan polling notifikasi di dashboard (hanya pengguna yang
 * sedang membuka aplikasi, dibatasi sekali per beberapa menit). Keduanya aman
 * berjalan bersamaan karena `fireAlert` hanya berhasil sekali per perubahan.
 *
 * Harga yang dibandingkan adalah penutupan harian terakhir yang tersimpan,
 * bukan harga live. Alert ini alat pengingat, bukan pemicu order; memakai
 * sumber yang sama dengan skor dan komite membuat semua angka di layar
 * saling cocok.
 */

import { listInstrumentQuotes, listLatestScores } from '@/lib/db/queries'
import {
  fireAlert,
  listActiveAlerts,
  listLatestVerdictByInstrument,
  primeAlertVerdict,
  type AlertKind,
} from '@/lib/db/member-queries'
import { resolveScoreVersion } from './market-view'
import { formatPriceIn } from '@/lib/format/market'
import { verdictLabel } from '@/lib/format/verdict'

export interface EvaluationReport {
  checked: number
  fired: number
  primed: number
}

export async function evaluateAlerts(userId?: number): Promise<EvaluationReport> {
  const alerts = await listActiveAlerts(userId)
  const report: EvaluationReport = { checked: alerts.length, fired: 0, primed: 0 }
  if (alerts.length === 0) return report

  const needsScores = alerts.some((a) => a.kind === 'skor_di_atas' || a.kind === 'skor_di_bawah')
  const verdictIds = [...new Set(alerts.filter((a) => a.kind === 'putusan_berubah').map((a) => a.instrumentId))]

  const [quotes, scores, verdicts] = await Promise.all([
    listInstrumentQuotes(),
    needsScores ? resolveScoreVersion().then(listLatestScores) : Promise.resolve([]),
    listLatestVerdictByInstrument(verdictIds),
  ])

  const quoteById = new Map(quotes.map((q) => [q.id, q]))
  const scoreByKey = new Map(scores.map((s) => [`${s.instrumentId}:${s.horizon}`, s.score]))

  for (const alert of alerts) {
    const quote = quoteById.get(alert.instrumentId)
    if (!quote) continue
    const kind = alert.kind as AlertKind
    const threshold = alert.threshold === null ? null : Number(alert.threshold)
    const link = `/ringkasan?symbol=${encodeURIComponent(quote.symbol)}`

    if (kind === 'harga_di_atas' || kind === 'harga_di_bawah') {
      const price = quote.lastClose
      if (price === null || threshold === null) continue
      const hit = kind === 'harga_di_atas' ? price >= threshold : price <= threshold
      if (!hit) continue
      const ok = await fireAlert(
        alert,
        {
          title: `${quote.symbol} ${kind === 'harga_di_atas' ? 'menembus ke atas' : 'turun ke bawah'} ${formatPriceIn(threshold, quote.currency)}`,
          body: `Penutupan terakhir ${formatPriceIn(price, quote.currency)} per ${quote.lastDate ?? '—'}. Alert ini sekarang nonaktif; hidupkan lagi di halaman Alert bila perlu.`,
          linkUrl: link,
        },
        { isActive: false },
      )
      if (ok) report.fired++
      continue
    }

    if (kind === 'skor_di_atas' || kind === 'skor_di_bawah') {
      const score = scoreByKey.get(`${alert.instrumentId}:${alert.horizon ?? 'menengah'}`)
      if (score === undefined || threshold === null) continue
      const hit = kind === 'skor_di_atas' ? score >= threshold : score <= threshold
      if (!hit) continue
      const ok = await fireAlert(
        alert,
        {
          title: `Skor ${alert.horizon ?? 'menengah'} ${quote.symbol} ${kind === 'skor_di_atas' ? 'naik ke' : 'turun ke'} ${score.toFixed(2)}`,
          body: `Ambang yang Anda pasang: ${threshold.toFixed(2)}. Skor adalah ringkasan bukti, bukan anjuran transaksi.`,
          linkUrl: link,
        },
        { isActive: false },
      )
      if (ok) report.fired++
      continue
    }

    if (kind === 'putusan_berubah') {
      const latest = verdicts.get(alert.instrumentId)
      if (!latest) continue
      if (alert.lastVerdict === null) {
        // Alert baru tanpa pembanding: catat putusan sekarang sebagai titik awal.
        await primeAlertVerdict(alert.id, latest.verdict)
        report.primed++
        continue
      }
      if (latest.verdict === alert.lastVerdict) continue
      const ok = await fireAlert(
        alert,
        {
          title: `Putusan komite ${quote.symbol} berubah: ${verdictLabel(alert.lastVerdict)} → ${verdictLabel(latest.verdict)}`,
          body: `Rapat terakhir selesai ${latest.finishedAt.slice(0, 16).replace('T', ' ')}${latest.confidence !== null ? `, keyakinan ${latest.confidence}/100` : ''}. Buka transkripnya untuk melihat alasan tiap agen.`,
          linkUrl: link,
        },
        { isActive: true, lastVerdict: latest.verdict },
      )
      if (ok) report.fired++
    }
  }

  return report
}

/**
 * Pembatas evaluasi per pengguna untuk jalur polling.
 *
 * Data harga hanya berubah beberapa kali sehari, jadi mengevaluasi di tiap
 * polling hanya membakar kueri. Disimpan di memori proses: di serverless
 * artinya kadang dievaluasi sedikit lebih sering, dan itu tidak apa-apa.
 */
const lastRun = new Map<number, number>()
const USER_EVAL_INTERVAL_MS = 5 * 60_000

export async function evaluateAlertsForUserThrottled(userId: number): Promise<void> {
  const now = Date.now()
  if (now - (lastRun.get(userId) ?? 0) < USER_EVAL_INTERVAL_MS) return
  lastRun.set(userId, now)
  try {
    await evaluateAlerts(userId)
  } catch (err) {
    console.warn('[Alert] evaluasi pengguna gagal:', err instanceof Error ? err.message : err)
  }
}
