/**
 * Regresi logika murni rapat project, kalender makro, arsip, dan rentang
 * analitik. Tanpa basis data dan tanpa jaringan.
 */

import assert from 'node:assert/strict'
import { periodWindow, parseDecision, nextScheduledAt } from '../lib/project/meeting'
import { parseResearch, titleSimilarity, SAME_PROPOSAL, waitingDays } from '../lib/project/proposals'
import { parseBallot, tally } from '../lib/project/voting'
import { detectIssues, type ProjectMetrics } from '../lib/project/metrics'
import { parseCalendar, upcomingHighImpact } from '../lib/macro/calendar'
import { countSources, extractSources } from '../lib/db/work-archive-queries'
import { trendUnit } from '../lib/db/visit-queries'
import { parseRange } from '../lib/analytics/ga4'
import { wibDate } from '../lib/project/store'

// --- Rentang periode (WIB) -------------------------------------------------
// Kamis 15 Oktober 2026 pukul 00.10 WIB = Rabu 14 Oktober 17.10 UTC.
const now = new Date('2026-10-14T17:10:00Z')
const daily = periodWindow('harian', 'jadwal', now)
assert.equal(daily.from.toISOString(), '2026-10-13T17:00:00.000Z') // 14 Okt 00.00 WIB
assert.equal(daily.to.toISOString(), '2026-10-14T17:00:00.000Z') // 15 Okt 00.00 WIB
const weekly = periodWindow('mingguan', 'jadwal', now)
assert.equal(weekly.from.toISOString(), '2026-10-04T17:00:00.000Z') // Senin 5 Okt WIB
assert.equal(weekly.to.toISOString(), '2026-10-11T17:00:00.000Z') // Senin 12 Okt WIB
const monthly = periodWindow('bulanan', 'jadwal', new Date('2026-10-31T17:30:00Z')) // 1 Nov WIB
assert.equal(monthly.from.toISOString(), '2026-09-30T17:00:00.000Z') // 1 Okt WIB
assert.equal(monthly.to.toISOString(), '2026-10-31T17:00:00.000Z') // 1 Nov WIB
const january = periodWindow('bulanan', 'jadwal', new Date('2027-01-01T03:00:00Z'))
assert.equal(january.from.toISOString(), '2026-11-30T17:00:00.000Z') // 1 Des 2026 WIB
const manual = periodWindow('mingguan', 'manual', now)
assert.equal(manual.to.getTime() - manual.from.getTime(), 7 * 86_400_000)
assert.equal(wibDate(new Date('2026-10-14T17:10:00Z')), '2026-10-15')

// --- Pendeteksi masalah ----------------------------------------------------
const base: ProjectMetrics = {
  rentang: { mulai: '', selesai: '', hari: 1 },
  pengunjung: { tayangan: 40, pengunjungUnik: 10, tayanganSebelumnya: 200, pengunjungSebelumnya: 50 },
  pengguna: { total: 10, baru: 1, aktifLogin: 3, premiumAktif: 0 },
  komite: { sidang: 10, selesai: 4, gagal: 6, abstain: 0, rataKeyakinan: 50, giliranDigantikan: 3, galatTeratas: ['6× semua penyedia gagal'] },
  ai: { panggilanTercatat: 0, token: 0, perPenyedia: [], penyediaGagalTerbanyak: [] },
  warta: { terbit: 0, belumLengkapTerjemahan: 0, dibaca: 0 },
  job: { total: 5, sukses: 3, sebagian: 0, gagal: 2, gagalPerJob: [{ job: 'ingest-idx-daily', gagal: 2, galat: 'HTTP 429' }] },
  data: {
    asetBasi: [{ pasar: 'IDX', basi: 60, total: 100, batasHari: 5 }, { pasar: 'US', basi: 1, total: 100, batasHari: 5 }],
    sumberBermasalah: [{ sumber: 'yahoo', status: 'dead', gagalBeruntun: 9, galat: 'HTTP 403' }],
    karantinaBaru: 0,
  },
  kunci: [{ penyedia: 'gemini', siap: 0, total: 2 }, { penyedia: 'groq', siap: 0, total: 1 }],
  keuangan: { masuk: 0, keluar: 100, saldoKeseluruhan: -100, rincian: [] },
  makro: { tidakTersedia: 'umpan mati' },
}
const issues = detectIssues(base)
const keys = new Map(issues.map((i) => [i.key, i.severity]))
assert.equal(keys.get('kunci:semua-istirahat'), 'mendesak')
assert.equal(keys.get('job-gagal:ingest-idx-daily'), 'mendesak')
assert.equal(keys.get('data-basi:IDX'), 'mendesak')
assert.equal(keys.has('data-basi:US'), false)
assert.equal(keys.get('sumber:yahoo'), 'mendesak')
assert.equal(keys.get('komite:gagal-tinggi'), 'mendesak')
assert.equal(keys.get('warta:kosong'), 'perhatian')
assert.equal(keys.get('pengunjung:anjlok'), 'perhatian')
assert.equal(keys.get('kas:minus'), 'mendesak')
assert.equal(keys.get('bagian-gagal:makro'), 'perhatian')
assert.equal(new Set(issues.map((i) => i.key)).size, issues.length, 'kunci peringatan harus unik')

const healthy = detectIssues({
  ...base,
  pengunjung: { tayangan: 200, pengunjungUnik: 50, tayanganSebelumnya: 200, pengunjungSebelumnya: 50 },
  komite: { ...(base.komite as Exclude<ProjectMetrics['komite'], { tidakTersedia: string }>), gagal: 0 },
  warta: { terbit: 3, belumLengkapTerjemahan: 0, dibaca: 10 },
  job: { total: 5, sukses: 5, sebagian: 0, gagal: 0, gagalPerJob: [] },
  data: { asetBasi: [], sumberBermasalah: [], karantinaBaru: 0 },
  kunci: [{ penyedia: 'gemini', siap: 2, total: 2 }, { penyedia: 'groq', siap: 1, total: 1 }],
  keuangan: { masuk: 100, keluar: 0, saldoKeseluruhan: 100, rincian: [] },
  makro: { peristiwaPentingTigaHari: [] },
})
assert.deepEqual(healthy, [])

// --- Keputusan ketua rapat -------------------------------------------------
assert.deepEqual(parseDecision('```json\n{"kesimpulan":"ok","tindakan":["a","b"],"mendesak":[],}\n```'), {
  kesimpulan: 'ok',
  tindakan: ['a', 'b'],
  mendesak: [],
  dibuang: [],
})
assert.equal(parseDecision('tanpa json'), null)
assert.equal(parseDecision('{"tindakan":[]}'), null)

// --- Kalender makro --------------------------------------------------------
const events = parseCalendar([
  { title: 'FOMC Meeting Minutes', country: 'USD', date: '2026-10-07T14:00:00-04:00', impact: 'High', forecast: '', previous: '' },
  { title: 'Rusak', country: 'USD', date: 'bukan tanggal', impact: 'High' },
  { title: 'CPI y/y', country: 'CNY', date: '2026-10-09T21:30:00-04:00', impact: 'Aneh', forecast: '0.3%', previous: '0.1%' },
])
assert.equal(events.length, 2)
assert.equal(events[0].date, '2026-10-07T18:00:00.000Z')
assert.equal(events[1].impact, 'Low')
assert.equal(parseCalendar({ bukan: 'larik' }).length, 0)
assert.equal(upcomingHighImpact(events, 72, Date.parse('2026-10-06T00:00:00Z')).length, 1)
assert.equal(upcomingHighImpact(events, 72, Date.parse('2026-10-08T00:00:00Z')).length, 0)

// --- Sumber warta ----------------------------------------------------------
const md = 'Isi.\n\n<hr />\n\n### Sumber\n\n- <a href="https://a.id/x?b=1&amp;c=2" target="_blank" rel="noopener nofollow">Judul &quot;A&quot;</a> — ANTARA\n- <a href="https://b.id" target="_blank">B</a> — CNBC'
assert.equal(countSources(md), 2)
assert.deepEqual(extractSources(md)[0], { href: 'https://a.id/x?b=1&c=2', title: 'Judul "A"', source: 'ANTARA' })
assert.equal(countSources('tanpa sumber'), 0)

// --- Rentang analitik ------------------------------------------------------
assert.equal(trendUnit(1), 'hour')
assert.equal(trendUnit(30), 'day')
assert.equal(trendUnit(90), 'day')
assert.equal(trendUnit(180), 'week')
assert.equal(trendUnit(730), 'month')
assert.equal(parseRange('730d'), '730d')
assert.equal(parseRange('99d'), '7d')
assert.equal(parseRange(undefined), '7d')

// --- Tahunan dan jadwal berikutnya ------------------------------------------
const yearly = periodWindow('tahunan', 'jadwal', new Date('2026-12-31T18:00:00Z')) // 1 Jan 2027 01.00 WIB
assert.equal(yearly.from.toISOString(), '2025-12-31T17:00:00.000Z') // 1 Jan 2026 WIB
assert.equal(yearly.to.toISOString(), '2026-12-31T17:00:00.000Z') // 1 Jan 2027 WIB
assert.equal(periodWindow('tahunan', 'manual', now).to.getTime() - periodWindow('tahunan', 'manual', now).from.getTime(), 365 * 86_400_000)
assert.equal(nextScheduledAt('harian', now).toISOString(), '2026-10-15T17:00:00.000Z') // Jumat 16 Okt WIB
assert.equal(nextScheduledAt('mingguan', now).toISOString(), '2026-10-18T17:00:00.000Z') // Senin 19 Okt WIB
assert.equal(nextScheduledAt('bulanan', now).toISOString(), '2026-10-31T17:00:00.000Z') // 1 Nov WIB
assert.equal(nextScheduledAt('tahunan', now).toISOString(), '2026-12-31T17:00:00.000Z') // 1 Jan 2027 WIB

// --- Usulan peneliti -------------------------------------------------------
const research = parseResearch(`\`\`\`json
{"usulan":[
  {"judul":"Ganti sumber harga Yahoo dengan cadangan Stooq","kategori":"api-baru","masalah":"timeout","bukti":"4 gagal","usulan":"Tambah adaptor Stooq","kebutuhan":{"data":["log galat"],"api":["Stooq CSV"]},"biaya":"gratis","biayaRupiahPerBulan":0,"alternatifGratis":"-","dampak":9,"usaha":"aneh"},
  {"judul":"","usulan":"tanpa judul dibuang"},
  {"judul":"Tanpa isi"}
],
"pembaruan":[{"id":3,"status":"tampak-selesai","catatan":"gejala hilang"},{"id":"x","status":"sedang"},{"id":4,"status":"ngawur"}],}
\`\`\``)
assert.ok(research)
assert.equal(research.usulan.length, 1)
assert.equal(research.usulan[0].impact, 5)
assert.equal(research.usulan[0].effort, 'sedang')
assert.equal(research.usulan[0].costIdr, 0)
assert.deepEqual(research.usulan[0].needs, { data: ['log galat'], api: ['Stooq CSV'] })
assert.deepEqual(research.pembaruan, [{ id: 3, aiStatus: 'tampak-selesai', catatan: 'gejala hilang' }])
assert.equal(parseResearch('bukan json'), null)
assert.ok(titleSimilarity('Ganti sumber harga Yahoo dengan Stooq', 'Ganti sumber harga Yahoo ke Stooq') >= SAME_PROPOSAL)
assert.ok(titleSimilarity('Ganti sumber harga Yahoo', 'Tambah halaman blog edukasi') < SAME_PROPOSAL)
assert.deepEqual(parseDecision('{"kesimpulan":"x","tindakan":[],"mendesak":[],"usulan_dibuang":[2,"3",0,-1]}')?.dibuang, [2, 3])

const reminders = parseResearch('{"usulan":[],"pengingat":[{"id":7,"alasan":"Yahoo masih mati 9 hari","saran":"putuskan"},{"id":8,"alasan":"sudah tidak relevan","saran":"tarik"},{"id":9,"alasan":""}]}')
assert.deepEqual(reminders?.pengingat, [
  { id: 7, alasan: 'Yahoo masih mati 9 hari', saran: 'putuskan' },
  { id: 8, alasan: 'sudah tidak relevan', saran: 'tarik' },
])
const created = '2026-10-01T00:00:00.000Z'
assert.equal(waitingDays({ status: 'menunggu', createdAt: created, decidedAt: null }, Date.parse('2026-10-09T01:00:00Z')), 8)
assert.equal(waitingDays({ status: 'disetujui', createdAt: created, decidedAt: null }, Date.parse('2026-10-09T01:00:00Z')), 0)
// Dikembalikan ke "menunggu": hitungan mulai dari keputusan terakhir, bukan dari awal.
assert.equal(waitingDays({ status: 'menunggu', createdAt: created, decidedAt: '2026-10-08T00:00:00Z' }, Date.parse('2026-10-09T01:00:00Z')), 1)

// --- Voting ----------------------------------------------------------------
assert.deepEqual(parseBallot('{"suara":[{"no":1,"pilihan":"Setuju","alasan":"ok"},{"no":1,"pilihan":"tolak"},{"no":3,"pilihan":"setuju"},{"no":2,"pilihan":"mungkin"}]}', 2), [
  { no: 1, pilihan: 'setuju', alasan: 'ok' },
])
assert.equal(parseBallot('tidak ada json', 2), null)
const tallies = tally(2, [
  { no: 1, providerId: 'gemini', pilihan: 'setuju', alasan: '' },
  { no: 1, providerId: 'groq', pilihan: 'tolak', alasan: 'mahal' },
  { no: 1, providerId: 'cerebras', pilihan: 'setuju', alasan: '' },
])
assert.deepEqual(
  tallies.map((t) => [t.no, t.setuju, t.tolak, t.abstain]),
  [[1, 2, 1, 0], [2, 0, 0, 0]],
)

console.log('Project meeting, monitor thresholds, macro calendar, archive, and analytics range regressions passed.')
