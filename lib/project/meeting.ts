/**
 * Rapat project: tiga agen menilai kesehatan project dari angka basis data.
 *
 *   Pelapor     — menyusun laporan: capaian, masalah, keuangan.
 *   Peneliti    — menggali penyebab dari data galian dan merancang usulan
 *                 perbaikan baru: solusi, data/API yang dibutuhkan, biaya,
 *                 dan alternatif gratis. Juga menilai progres usulan lama.
 *   Pengkritik  — menyerang laporan dan usulan: yang diabaikan, yang dibaca
 *                 keliru, usulan yang hanya mengulang.
 *   Ketua rapat — memutuskan tindak lanjut dan membuang usulan yang lemah.
 *
 * Rapat punya ingatan: daftar usulan beserta keputusan owner (`proposals.ts`)
 * ikut dibaca, jadi yang ditolak tidak diusulkan ulang dan yang disetujui
 * dipantau sampai selesai.
 *
 * Sama dengan komite investasi: tiap peran didahulukan ke penyedia yang belum
 * bicara di rapat ini, karena tiga giliran dari satu model adalah satu
 * pendapat yang ditulis tiga kali. Angka hanya boleh dari blok DATA.
 *
 * Rapat tidak pernah gagal total. Bila semua kuota habis, laporan tetap
 * tersimpan berisi angka dan temuan otomatis, ditandai "tanpa-rapat".
 */

import { complete } from '@/lib/ai/registry'
import { LLM_ADAPTERS } from '@/lib/ai/adapters'
import type { LlmResponse } from '@/lib/ai/types'
import { collectProjectMetrics, detectIssues, type ProjectMetrics } from './metrics'
import { collectDeepDive, type DeepDive } from './deep-dive'
import { applyResearch, backlogForPrompt, listProposals, parseResearch, type ApplyResult, type Proposal } from './proposals'
import { holdVote, voteSummaryForPrompt, type VoteResult } from './voting'
import { parseDecision } from './decision'
import {
  MANUAL_PERIOD_DAYS,
  countManualReportsToday,
  previousScheduledWasQuiet,
  saveReport,
  scheduledReportExists,
  type MeetingMinute,
  type ProjectIssue,
  type ReportPeriod,
} from './store'

const WIB_MS = 7 * 3_600_000

const PROJECT_BRIEF =
  'PROJECT: AI Investdesk — terminal analisis investasi berbahasa Indonesia (saham IDX dan AS, kripto, emas, komoditas, obligasi). ' +
  'Fitur utama: komite investasi multi-agen AI dengan model gratisan dan cadangan antar penyedia, warta otomatis dari RSS media, ' +
  'skor dan backtest, simulator, Tanya Komite, watchlist/portofolio/alert, Premium berbayar lewat Tripay, donasi, dan iklan. ' +
  'ARSITEKTUR: Next.js di Vercel paket Hobby (satu cron harian; job per jam lewat QStash dan pemicu kunjungan), Postgres Supabase lewat ' +
  'pooler transaksi, Redis Upstash untuk cache/kuota, kolam kunci LLM gratis (Gemini, Groq, OpenRouter, Cerebras, Cloudflare, dll.). ' +
  'Data harga dari sumber tanpa kunci (Yahoo untuk IDX/AS/komoditas, Binance untuk kripto), makro dari FRED dan Bank Dunia, ' +
  'fundamental dari SEC EDGAR, kepemilikan dari KSEI. Pemilik project bekerja sendiri dengan anggaran kecil.'

const RULES = [
  'ATURAN:',
  '- ANGKA: hanya dari blok DATA. Bagian berisi "tidakTersedia" artinya datanya tidak terbaca — tulis "tidak tersedia", jangan anggap nol.',
  '- Jangan mengarang fitur, pengguna, atau kejadian yang tidak ada di DATA atau TEMUAN.',
  '- Uang dalam rupiah, tulis dengan pemisah ribuan titik.',
  '- BAHASA: Indonesia lugas, tanpa basa-basi.',
].join('\n')

interface MeetingRole {
  role: string
  title: string
  system: string
  maxOutputTokens: number
  temperature: number
  json?: boolean
}

const PELAPOR: MeetingRole = {
  role: 'pelapor',
  title: 'Pelapor',
  temperature: 0.2,
  maxOutputTokens: 700,
  system: [
    'Kamu pelapor rapat project. Susun laporan periode ini dari DATA dan TEMUAN.',
    'Format "LABEL: isi", satu gagasan per baris, maksimum 16 baris:',
    'RINGKASAN: satu kalimat keadaan project.',
    'CAPAIAN: hal yang berjalan baik, dengan angkanya (boleh beberapa baris).',
    'MASALAH: urut dari yang paling mendesak, dengan angkanya (boleh beberapa baris).',
    'PENGUNJUNG: perbandingan dengan periode sebelumnya.',
    'AI: pemakaian dan penyedia yang paling sering gagal.',
    'KEUANGAN: pemasukan, pengeluaran, saldo, dan rinciannya.',
    'PERHATIAN: peristiwa makro penting yang akan datang bila ada.',
    RULES,
  ].join('\n'),
}

const PENELITI: MeetingRole = {
  role: 'peneliti',
  title: 'Peneliti & Arsitek Perbaikan',
  temperature: 0.5,
  maxOutputTokens: 1800,
  json: true,
  system: [
    'Kamu peneliti dan arsitek perbaikan project. Laporan pelapor sudah menyebut gejalanya; tugasmu MENGGALI PENYEBAB dari DATA GALIAN dan merancang perbaikan yang BELUM ADA.',
    'Larangan: jangan mengulang kalimat laporan ("perbaiki X") tanpa rancangan; jangan mengusulkan sesuatu yang sudah ada di DAFTAR USULAN (rujuk nomornya di "pembaruan"); jangan mengusulkan ulang usulan yang DITOLAK owner kecuali ada bukti baru, dan hormati catatan owner.',
    'Usulan yang baik: menyebut penyebab yang terbaca di data, perubahan konkret di bagian sistem mana, data apa yang perlu mulai dicatat, dan API/layanan apa yang dibutuhkan. Utamakan sumber gratis atau tanpa kunci. Bila ada biaya, WAJIB beri alternatif gratis yang realistis walau lebih lemah.',
    'Pikirkan juga di luar masalah hari ini: data baru yang membuat analisis lebih tajam, fitur yang terbukti dicari pengunjung (halaman teratas), atau cara menaikkan pemasukan.',
    'Untuk usulan berstatus "disetujui" di DAFTAR USULAN, nilai progresnya dari DATA: belum-digarap, sedang, tampak-selesai (gejalanya hilang di data), atau terhambat (sebut penghambatnya).',
    'Untuk usulan yang ditandai "BELUM DIPUTUSKAN OWNER N HARI", tulis pengingat untuk owner: kenapa usulan itu masih penting MENURUT DATA HARI INI, apa akibatnya bila terus ditunda (dengan angka), atau sarankan "tarik" bila datanya menunjukkan usulan itu sudah tidak relevan. Makin lama menunggu, makin tegas.',
    'Balas HANYA satu objek JSON, tanpa teks lain:',
    '{"usulan":[{"judul":"<maks 12 kata>","kategori":"perbaikan-sistem|data-baru|api-baru|fitur|operasional|pemasaran|keuangan","masalah":"<penyebab, bukan gejala>","bukti":"<angka dari DATA>","usulan":"<langkah konkret>","kebutuhan":{"data":["<data yang perlu dicatat/dikumpulkan>"],"api":["<API/layanan yang dibutuhkan>"]},"biaya":"<perkiraan, mis. gratis / Rp 150.000 per bulan>","biayaRupiahPerBulan":<angka atau null>,"alternatifGratis":"<cara tanpa biaya>","dampak":<1-5>,"usaha":"kecil|sedang|besar"}],',
    '"pembaruan":[{"id":<nomor usulan>,"status":"belum-digarap|sedang|tampak-selesai|terhambat","catatan":"<bukti dari DATA>"}],',
    '"pengingat":[{"id":<nomor usulan yang lama menunggu>,"alasan":"<kenapa penting / akibat bila ditunda, dengan angka>","saran":"putuskan|tarik"}]}',
    'Maksimal 4 usulan baru, urut dari dampak terbesar. Lebih baik 1 usulan tajam daripada 4 yang dangkal; boleh kosong bila tidak ada yang baru.',
    RULES,
  ].join('\n'),
}

const PENGKRITIK: MeetingRole = {
  role: 'pengkritik',
  title: 'Pengkritik & Penasihat',
  temperature: 0.4,
  maxOutputTokens: 800,
  system: [
    'Kamu pengkritik independen rapat project. Tugasmu MENYERANG laporan pelapor dan usulan peneliti, bukan menyetujuinya.',
    'Format "LABEL: isi", maksimum 16 baris:',
    'KRITIK: yang diabaikan, dibaca keliru, atau disimpulkan melebihi DATA (wajib mengutip angka).',
    'RISIKO: apa yang akan memburuk bila dibiarkan, dengan alasannya.',
    'USULAN: nilai tiap usulan baru peneliti berdasarkan nomor urutnya (1, 2, …): apakah benar perbaikan baru, apakah biaya dan alternatif gratisnya realistis. Untuk usulan yang lemah atau hanya mengulang, tulis "BUANG #n: alasan".',
    'SARAN: hal penting yang terlewat oleh peneliti, bila ada.',
    RULES,
  ].join('\n'),
}

const KETUA_RAPAT: MeetingRole = {
  role: 'ketua-rapat',
  title: 'Ketua Rapat',
  temperature: 0.2,
  maxOutputTokens: 500,
  json: true,
  system: [
    'Kamu ketua rapat project. Timbang laporan pelapor dan kritik, lalu putuskan tindak lanjut.',
    'Balas HANYA satu objek JSON, tanpa teks lain atau blok kode:',
    '{"kesimpulan":"<2-3 kalimat>","tindakan":["<langkah konkret, urut prioritas, maks 6>"],"mendesak":["<hal yang harus dikerjakan hari ini, boleh kosong>"],"usulan_dibuang":[<nomor urut usulan baru peneliti yang tidak layak masuk daftar>]}',
    'Pertimbangkan "BUANG" dari pengkritik dan HASIL VOTING anggota (usulan yang lebih banyak ditolak daripada disetujui sebaiknya dibuang), tapi putuskan sendiri. Anggota absen tidak dihitung. Usulan yang lolos akan diajukan ke owner untuk disetujui.',
    RULES,
  ].join('\n'),
}

export interface PeriodWindow {
  from: Date
  to: Date
}

/** Tengah malam WIB yang memuat `at`, sebagai instan UTC. */
function wibMidnight(at: Date): Date {
  const wib = new Date(at.getTime() + WIB_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_MS)
}

/**
 * Rentang yang dilaporkan. Terjadwal: periode kalender WIB yang baru selesai
 * (kemarin, pekan Senin–Minggu lalu, bulan lalu, tahun lalu). Manual: rentang bergulir yang
 * berakhir sekarang, supaya rapat dadakan membahas keadaan terkini.
 */
export function periodWindow(period: ReportPeriod, trigger: 'jadwal' | 'manual', now = new Date()): PeriodWindow {
  if (trigger === 'manual') {
    const days = MANUAL_PERIOD_DAYS[period]
    return { from: new Date(now.getTime() - days * 86_400_000), to: now }
  }
  const today = wibMidnight(now)
  if (period === 'harian') return { from: new Date(today.getTime() - 86_400_000), to: today }
  if (period === 'mingguan') {
    const weekday = new Date(today.getTime() + WIB_MS).getUTCDay() // 0 = Minggu
    const monday = new Date(today.getTime() - ((weekday + 6) % 7) * 86_400_000)
    return { from: new Date(monday.getTime() - 7 * 86_400_000), to: monday }
  }
  const wib = new Date(today.getTime() + WIB_MS)
  if (period === 'tahunan') {
    return {
      from: new Date(Date.UTC(wib.getUTCFullYear() - 1, 0, 1) - WIB_MS),
      to: new Date(Date.UTC(wib.getUTCFullYear(), 0, 1) - WIB_MS),
    }
  }
  const thisMonth = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_MS)
  const prevWib = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1))
  return { from: new Date(prevWib.getTime() - WIB_MS), to: thisMonth }
}

function dataBlock(
  period: ReportPeriod,
  metrics: ProjectMetrics,
  issues: ProjectIssue[],
  deep: DeepDive | null,
  backlog: Proposal[],
): string {
  return [
    PROJECT_BRIEF,
    `PERIODE: ${period}, ${metrics.rentang.mulai} sampai ${metrics.rentang.selesai} (${metrics.rentang.hari} hari).`,
    `DATA (satu-satunya sumber angka):\n${JSON.stringify(metrics)}`,
    issues.length
      ? `TEMUAN OTOMATIS (dari ambang tetap, bukan model):\n${issues.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join('\n')}`
      : 'TEMUAN OTOMATIS: tidak ada.',
    deep ? `DATA GALIAN (penyebab, perilaku pengunjung, pemakaian fitur, integrasi terpasang):\n${JSON.stringify(deep)}` : '',
    deep ? backlogForPrompt(backlog) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function speak(
  role: MeetingRole,
  data: string,
  previous: MeetingMinute[],
  spoken: Set<string>,
): Promise<LlmResponse> {
  const notYet = LLM_ADAPTERS.map((a) => a.id).filter((id) => !spoken.has(id))
  const transcript = previous.map((m) => `[${m.title.toUpperCase()}]\n${m.content.slice(0, 4500)}`).join('\n\n')
  return complete({
    feature: `rapat-project-${role.role}`,
    messages: [
      { role: 'system', content: role.system },
      {
        role: 'user',
        content: [data, transcript, `[GILIRANMU: ${role.title.toUpperCase()}${role.json ? ' — BALAS HANYA OBJEK JSON' : ''}]`]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    temperature: role.temperature,
    maxOutputTokens: role.maxOutputTokens,
    json: role.json,
    prefer: notYet,
    // Peneliti menulis JSON panjang; empat giliran tetap muat di function 300 detik.
    timeoutMs: role.json && role.maxOutputTokens > 1000 ? 60_000 : 40_000,
  })
}

export { parseDecision } from './decision'

export interface MeetingResult {
  reportId: number | null
  skipped?: string
  status?: 'selesai' | 'tanpa-rapat'
  proposals?: ApplyResult
  /** Rapat harian dilewati karena tidak ada masalah dua hari berturut-turut. */
  quiet?: boolean
  /** Ditolak karena batas rapat dadakan harian tercapai. */
  limited?: boolean
}

/** Batas rapat dadakan per hari (WIB). Rapat terjadwal tidak dihitung. */
export function manualDailyLimit(): number {
  const raw = Number(process.env.PROJECT_MEETING_MANUAL_LIMIT)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6
}

export async function runProjectMeeting(
  period: ReportPeriod,
  trigger: 'jadwal' | 'manual',
  now = new Date(),
): Promise<MeetingResult> {
  const window = periodWindow(period, trigger, now)
  if (trigger === 'jadwal' && (await scheduledReportExists(period, window.from))) {
    return { reportId: null, skipped: `laporan ${period} untuk periode ini sudah ada` }
  }
  if (trigger === 'manual') {
    const used = await countManualReportsToday()
    if (used >= manualDailyLimit()) {
      return { reportId: null, skipped: `batas ${manualDailyLimit()} rapat dadakan per hari sudah tercapai`, limited: true }
    }
  }

  // Rapat harian terjadwal versi ringan: pelapor dan ketua saja, tanpa data
  // galian, peneliti, pengkritik, atau voting. Penggalian dan usulan cukup
  // mingguan ke atas — harian yang dibutuhkan hanyalah "ada apa kemarin".
  const light = trigger === 'jadwal' && period === 'harian'

  // Berurutan, bukan Promise.all: tiap pengumpul sudah menjalankan kuerinya
  // paralel, dan gabungannya melebihi kolam koneksi — antrean di pooler
  // transaksi Supabase bisa macet tanpa ujung (lihat lib/db/client.ts).
  const metrics = await collectProjectMetrics(window.from, window.to)
  const deep = light ? null : await collectDeepDive(window.from, window.to)
  const backlog = light ? [] : await listProposals(null, 60).catch(() => [] as Proposal[])
  const issues = detectIssues(metrics)

  // Hari tenang berturut-turut tidak perlu rapat: laporannya tetap tersimpan
  // berisi angka, tapi tidak ada satu pun panggilan model.
  if (light && issues.length === 0 && (await previousScheduledWasQuiet(period))) {
    const reportId = await saveReport({
      period,
      trigger,
      periodStart: window.from.toISOString(),
      periodEnd: window.to.toISOString(),
      status: 'tanpa-rapat',
      metrics: metrics as unknown as Record<string, unknown>,
      issues,
      minutes: [],
      actionItems: [],
      note: 'Tidak ada masalah hari ini maupun kemarin; rapat dilewati untuk menghemat kuota AI.',
      votes: null,
    })
    return { reportId, status: 'tanpa-rapat', quiet: true }
  }

  const data = dataBlock(period, metrics, issues, deep, backlog)

  const minutes: MeetingMinute[] = []
  const spoken = new Set<string>()
  const notes: string[] = []
  let actionItems: string[] = []
  let research: ReturnType<typeof parseResearch> = null
  let dropped: number[] = []

  let votes: VoteResult | null = null

  for (const role of light ? [PELAPOR, KETUA_RAPAT] : [PELAPOR, PENELITI, PENGKRITIK, KETUA_RAPAT]) {
    // Voting digelar tepat sebelum ketua bicara, supaya ketua menimbang suara
    // seluruh anggota — bukan hanya tiga rekan semejanya.
    let extra: MeetingMinute[] = []
    if (role === KETUA_RAPAT) {
      const proposalsNow = (research as ReturnType<typeof parseResearch>)?.usulan ?? []
      if (proposalsNow.length > 0) {
        const context = minutes
          .filter((m) => m.role === 'pelapor' || m.role === 'pengkritik')
          .map((m) => `[${m.title.toUpperCase()}]\n${m.content.slice(0, 1800)}`)
          .join('\n\n')
        votes = await holdVote(proposalsNow, context).catch((err) => {
          notes.push(`Voting gagal digelar: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`)
          return null
        })
        if (votes) {
          extra = [{ role: 'voting', title: 'Hasil voting', providerId: '', model: '', latencyMs: 0, failovers: [], content: voteSummaryForPrompt(votes, proposalsNow) }]
        }
      }
    }
    try {
      const res = await speak(role, data, [...minutes, ...extra], spoken)
      spoken.add(res.providerId)
      minutes.push({
        role: role.role,
        title: role.title,
        providerId: res.providerId,
        model: res.model,
        latencyMs: res.latencyMs,
        failovers: res.failovers ?? [],
        content: res.text.trim(),
      })
      if (role === PENELITI) {
        research = parseResearch(res.text)
        if (!research) notes.push('Usulan peneliti tidak bisa diurai sebagai JSON; tidak ada usulan yang tercatat.')
      }
      if (role === KETUA_RAPAT) {
        const decision = parseDecision(res.text)
        if (decision) {
          actionItems = [...decision.mendesak.map((m) => `[MENDESAK] ${m}`), ...decision.tindakan]
          dropped = decision.dibuang
        } else {
          notes.push('Keputusan ketua rapat tidak bisa diurai sebagai JSON; tindakan tidak tercatat.')
        }
      }
    } catch (err) {
      // Peneliti yang gagal tidak menghentikan rapat: laporan dan kritik tetap berharga.
      notes.push(`Giliran ${role.title} gagal: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`)
      if (role !== PENELITI) break
    }
  }
  const note = notes.length ? notes.join(' ') : null

  const status = minutes.length > 0 ? 'selesai' : 'tanpa-rapat'
  const reportId = await saveReport({
    period,
    trigger,
    periodStart: window.from.toISOString(),
    periodEnd: window.to.toISOString(),
    status,
    metrics: metrics as unknown as Record<string, unknown>,
    issues,
    minutes,
    actionItems,
    note,
    votes,
  })

  let proposals: ApplyResult | undefined
  if (research) {
    const parsed = research
    const discard = new Set(dropped)
    const finalVotes = votes as VoteResult | null
    const absent = finalVotes?.attendance.filter((a) => !a.hadir).length ?? 0
    const votesFor = (index: number) => {
      const t = finalVotes?.tallies.find((x) => x.no === index + 1)
      return t ? { setuju: t.setuju, tolak: t.tolak, abstain: t.abstain, absen: absent, rincian: t.rincian } : null
    }
    proposals = await applyResearch(parsed, (index) => !discard.has(index + 1), reportId, votesFor).catch((err) => {
      console.warn('[Rapat] usulan gagal disimpan:', err instanceof Error ? err.message : err)
      return undefined
    })
  }
  return { reportId, status, proposals }
}

/**
 * Laporan terjadwal hari ini: harian selalu, mingguan tiap Senin, bulanan tiap
 * tanggal 1, tahunan tiap 1 Januari (WIB). Dipanggil job `laporan-project`.
 */
export async function runScheduledMeetings(now = new Date()): Promise<{ period: ReportPeriod; result: MeetingResult }[]> {
  const wib = new Date(now.getTime() + WIB_MS)
  const periods: ReportPeriod[] = ['harian']
  if (wib.getUTCDay() === 1) periods.push('mingguan')
  if (wib.getUTCDate() === 1) periods.push('bulanan')
  if (wib.getUTCDate() === 1 && wib.getUTCMonth() === 0) periods.push('tahunan')

  const out: { period: ReportPeriod; result: MeetingResult }[] = []
  for (const period of periods) {
    out.push({ period, result: await runProjectMeeting(period, 'jadwal', now) })
  }
  return out
}

/** Kapan rapat terjadwal periode ini digelar berikutnya (tengah malam WIB). */
export function nextScheduledAt(period: ReportPeriod, now = new Date()): Date {
  const day = 86_400_000
  let at = new Date(wibMidnight(now).getTime() + day)
  for (let i = 0; i < 400; i++) {
    const wib = new Date(at.getTime() + WIB_MS)
    const due =
      period === 'harian' ||
      (period === 'mingguan' && wib.getUTCDay() === 1) ||
      (period === 'bulanan' && wib.getUTCDate() === 1) ||
      (period === 'tahunan' && wib.getUTCDate() === 1 && wib.getUTCMonth() === 0)
    if (due) return at
    at = new Date(at.getTime() + day)
  }
  return at
}
