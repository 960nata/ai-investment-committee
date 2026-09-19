/**
 * Smoke test lapisan agen — jalankan: npx tsx scripts/smoke-agents.ts
 *
 * Hanya menguji fungsi murni: tidak menyentuh database dan tidak memanggil
 * satu pun penyedia LLM, jadi tidak butuh DATABASE_URL maupun kunci apa pun.
 * Yang diuji justru bagian yang paling sunyi saat salah — aritmetika metrik dan
 * penguraian putusan ketua. Keduanya tidak melempar galat ketika keliru, mereka
 * hanya menghasilkan angka dan putusan yang sedikit berbeda dari seharusnya.
 */

import assert from 'node:assert/strict'
import { buildFacts, type PricePoint } from '../lib/agents/facts'
import { parseVerdict } from '../lib/agents/verdict'
import { collectKeys, fingerprint } from '../lib/ai/keyring'
import type { InstrumentView } from '../lib/db/queries'

let passed = 0
function check(label: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ok   ${label}`)
  } catch (err) {
    console.error(`  GAGAL ${label}`)
    console.error(`       ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

const instrument: InstrumentView = {
  id: 1,
  symbol: 'TEST',
  name: 'Uji',
  market: 'US',
  assetClass: 'saham',
  region: 'Amerika Serikat',
  currency: 'USD',
  sector: null,
  isActive: true,
  listedAt: null,
  delistedAt: null,
}

/** Deret naik 0,1% per hari — imbal hasil, tren, dan drawdown-nya bisa dihitung tangan. */
function risingSeries(days: number, endDate: Date): PricePoint[] {
  const out: PricePoint[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(endDate)
    d.setUTCDate(d.getUTCDate() - (days - 1 - i))
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 100 * 1.001 ** i,
      volume: 1_000,
    })
  }
  return out
}

console.log('\nbuildFacts — deret naik 250 hari')
{
  const now = new Date('2026-09-19T00:00:00Z')
  const facts = buildFacts(instrument, risingSeries(250, now), now)

  check('data segar, tanpa peringatan', () => {
    assert.equal(facts.staleDays, 0)
    assert.deepEqual(facts.warnings, [])
  })

  check('imbal hasil 30 hari = 3.04% (1.001^30)', () => {
    assert.equal(facts.returns.d30, 3.04)
  })

  check('riwayat 250 hari belum cukup 365 hari', () => {
    assert.equal(facts.returns.d365, null)
  })

  check('tren naik', () => assert.equal(facts.trend, 'naik'))

  check('deret monoton naik tidak punya drawdown', () => {
    assert.equal(facts.maxDrawdown, 0)
  })

  check('imbal hasil harian konstan -> volatilitas nol', () => {
    assert.equal(facts.annualisedVolatility, 0)
  })

  check('SMA200 terisi saat riwayat >= 200 hari', () => {
    assert.notEqual(facts.sma.s200, null)
  })
}

console.log('\nbuildFacts — riwayat pendek dan data basi')
{
  const now = new Date('2026-09-19T00:00:00Z')
  const end = new Date('2026-09-01T00:00:00Z')
  const facts = buildFacts(instrument, risingSeries(60, end), now)

  check('umur data dihitung dari candle terakhir', () => {
    assert.equal(facts.staleDays, 18)
  })

  check('data basi memunculkan peringatan', () => {
    assert.ok(facts.warnings.some((w) => w.includes('di atas ambang')))
  })

  check('riwayat 60 hari memberi peringatan SMA200', () => {
    assert.ok(facts.warnings.some((w) => w.includes('SMA200')))
    assert.equal(facts.sma.s200, null)
  })

  check('metrik yang belum bisa dihitung bernilai null, bukan nol', () => {
    assert.equal(facts.returns.d90, null)
    assert.equal(facts.volumeRatio20v100, null)
  })
}

console.log('\nparseVerdict')
{
  const valid = '{"verdict":"tahan","confidence":45,"rationale":"Bukti tipis."}'

  check('JSON polos', () => {
    assert.equal(parseVerdict(valid)?.verdict, 'tahan')
    assert.equal(parseVerdict(valid)?.confidence, 45)
  })

  check('field opsional diberi nilai bawaan', () => {
    assert.equal(parseVerdict(valid)?.key_risk, '')
  })

  check('dibungkus pagar kode', () => {
    assert.equal(parseVerdict('```json\n' + valid + '\n```')?.verdict, 'tahan')
  })

  check('didahului kalimat pengantar', () => {
    assert.equal(parseVerdict('Berikut putusan saya:\n' + valid)?.verdict, 'tahan')
  })

  check('verdict di luar daftar ditolak', () => {
    assert.equal(parseVerdict('{"verdict":"beli kuat","confidence":90,"rationale":"x"}'), null)
  })

  check('confidence di luar 0-100 ditolak', () => {
    assert.equal(parseVerdict('{"verdict":"beli","confidence":140,"rationale":"x"}'), null)
  })

  check('prosa tanpa JSON ditolak, bukan dianggap tahan', () => {
    assert.equal(parseVerdict('Saya kira sebaiknya ditahan dulu.'), null)
  })

  check('balasan kosong ditolak', () => {
    assert.equal(parseVerdict(null), null)
    assert.equal(parseVerdict(''), null)
  })
}

console.log('\ncollectKeys')
{
  process.env.SMOKE_KEY = 'satu'
  process.env.SMOKE_KEY_2 = 'dua'
  // Nomor 3 sengaja dikosongkan.
  process.env.SMOKE_KEY_4 = 'empat'
  process.env.SMOKE_KEY_5 = 'satu' // duplikat
  process.env.SMOKE_KEY_6 = '<isi-di-sini>' // placeholder
  process.env.SMOKE_KEY_7 = '   ' // spasi saja

  const pool = collectKeys('SMOKE_KEY')

  check('nomor yang bolong dilewati, bukan menghentikan pemindaian', () => {
    assert.equal(pool.length, 3)
    assert.deepEqual(pool.map((k) => k.value), ['satu', 'dua', 'empat'])
  })

  check('indeks berurutan rapat 0..n', () => {
    assert.deepEqual(pool.map((k) => k.index), [0, 1, 2])
  })

  check('env asal ikut tercatat', () => {
    assert.deepEqual(pool.map((k) => k.envName), ['SMOKE_KEY', 'SMOKE_KEY_2', 'SMOKE_KEY_4'])
  })

  check('sidik jari 8 hex dan tidak memuat kuncinya', () => {
    const fp = fingerprint('rahasia')
    assert.match(fp, /^[0-9a-f]{8}$/)
    assert.ok(!fp.includes('rahasia'))
  })

  check('prefix tanpa kunci menghasilkan kolam kosong', () => {
    assert.equal(collectKeys('SMOKE_TIDAK_ADA').length, 0)
  })
}

console.log(`\n${passed} pemeriksaan lolos${process.exitCode ? ', ADA YANG GAGAL' : '.'}\n`)
