/**
 * Rapat project: tiga agen menilai kesehatan project dari angka basis data.
 *
 *   Pelapor     — menyusun laporan: capaian, masalah, keuangan.
 *   Pengkritik  — menyerang laporan itu: yang diabaikan, yang dibaca keliru,
 *                 lalu saran perbaikan yang konkret.
 *   Ketua rapat — memutuskan tindak lanjut dalam JSON yang bisa disimpan.
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
import {
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
  'skor dan backtest, simulator, Premium berbayar lewat Tripay, donasi, dan iklan. Data harga dari sumber tanpa kunci (Yahoo, Binance, FRED, Bank Dunia).'

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

const PENGKRITIK: MeetingRole = {
  role: 'pengkritik',
  title: 'Pengkritik & Penasihat',
  temperature: 0.4,
  maxOutputTokens: 700,
  system: [
    'Kamu pengkritik independen rapat project. Tugasmu MENYERANG laporan pelapor, bukan menyetujuinya, lalu memberi saran.',
    'Format "LABEL: isi", maksimum 14 baris:',
    'KRITIK: yang diabaikan, dibaca keliru, atau disimpulkan melebihi DATA (wajib mengutip angka).',
    'RISIKO: apa yang akan memburuk bila dibiarkan, dengan alasannya.',
    'SARAN: langkah perbaikan konkret (kode, operasional, konten, pemasaran, atau keuangan) — boleh beberapa baris, tiap baris satu langkah yang bisa dikerjakan.',
    'KEKURANGAN: kekurangan project yang terlihat dari DATA, misalnya bagian tanpa data atau fitur yang tidak dipakai.',
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
    '{"kesimpulan":"<2-3 kalimat>","tindakan":["<langkah konkret, urut prioritas, maks 6>"],"mendesak":["<hal yang harus dikerjakan hari ini, boleh kosong>"]}',
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
 * (kemarin, pekan Senin–Minggu lalu, bulan lalu). Manual: rentang bergulir yang
 * berakhir sekarang, supaya rapat dadakan membahas keadaan terkini.
 */
export function periodWindow(period: ReportPeriod, trigger: 'jadwal' | 'manual', now = new Date()): PeriodWindow {
  if (trigger === 'manual') {
    const days = period === 'harian' ? 1 : period === 'mingguan' ? 7 : 30
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
  const thisMonth = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_MS)
  const prevWib = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1))
  return { from: new Date(prevWib.getTime() - WIB_MS), to: thisMonth }
}

function dataBlock(period: ReportPeriod, metrics: ProjectMetrics, issues: ProjectIssue[]): string {
  return [
    PROJECT_BRIEF,
    `PERIODE: ${period}, ${metrics.rentang.mulai} sampai ${metrics.rentang.selesai} (${metrics.rentang.hari} hari).`,
    `DATA (satu-satunya sumber angka):\n${JSON.stringify(metrics)}`,
    issues.length
      ? `TEMUAN OTOMATIS (dari ambang tetap, bukan model):\n${issues.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join('\n')}`
      : 'TEMUAN OTOMATIS: tidak ada.',
  ].join('\n\n')
}

async function speak(
  role: MeetingRole,
  data: string,
  previous: MeetingMinute[],
  spoken: Set<string>,
): Promise<LlmResponse> {
  const notYet = LLM_ADAPTERS.map((a) => a.id).filter((id) => !spoken.has(id))
  const transcript = previous.map((m) => `[${m.title.toUpperCase()}]\n${m.content.slice(0, 2400)}`).join('\n\n')
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
    // Tiga giliran harus muat dalam satu function 60 detik saat rapat dibuka manual.
    timeoutMs: 18_000,
  })
}

export function parseDecision(raw: string): { kesimpulan: string; tindakan: string[]; mendesak: string[] } | null {
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    const obj = JSON.parse(raw.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [])
    if (typeof obj.kesimpulan !== 'string') return null
    return { kesimpulan: obj.kesimpulan, tindakan: list(obj.tindakan), mendesak: list(obj.mendesak) }
  } catch {
    return null
  }
}

export interface MeetingResult {
  reportId: number | null
  skipped?: string
  status?: 'selesai' | 'tanpa-rapat'
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

  const metrics = await collectProjectMetrics(window.from, window.to)
  const issues = detectIssues(metrics)
  const data = dataBlock(period, metrics, issues)

  const minutes: MeetingMinute[] = []
  const spoken = new Set<string>()
  let note: string | null = null
  let actionItems: string[] = []

  for (const role of [PELAPOR, PENGKRITIK, KETUA_RAPAT]) {
    try {
      const res = await speak(role, data, minutes, spoken)
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
      if (role === KETUA_RAPAT) {
        const decision = parseDecision(res.text)
        if (decision) {
          actionItems = [...decision.mendesak.map((m) => `[MENDESAK] ${m}`), ...decision.tindakan]
        } else {
          note = 'Keputusan ketua rapat tidak bisa diurai sebagai JSON; tindakan tidak tercatat.'
        }
      }
    } catch (err) {
      note = `Giliran ${role.title} gagal: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`
      break
    }
  }

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
  })
  return { reportId, status }
}

/**
 * Laporan terjadwal hari ini: harian selalu, mingguan tiap Senin, bulanan tiap
 * tanggal 1 (WIB). Dipanggil job `laporan-project`.
 */
export async function runScheduledMeetings(now = new Date()): Promise<{ period: ReportPeriod; result: MeetingResult }[]> {
  const wib = new Date(now.getTime() + WIB_MS)
  const periods: ReportPeriod[] = ['harian']
  if (wib.getUTCDay() === 1) periods.push('mingguan')
  if (wib.getUTCDate() === 1) periods.push('bulanan')

  const out: { period: ReportPeriod; result: MeetingResult }[] = []
  for (const period of periods) {
    out.push({ period, result: await runProjectMeeting(period, 'jadwal', now) })
  }
  return out
}
