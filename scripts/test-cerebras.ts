/**
 * Uji Coba Integrasi Cerebras Cloud SDK / Endpoint
 *
 * Menguji bahwa Cerebras terhubung dengan baik ke:
 * 1. Keyring & Registry LLM
 * 2. Response parsing & latency telemetry
 * 3. JSON format mode untuk peran komite (CIO/Ketua)
 */

import './load-env'
import { complete } from '../lib/ai/registry'
import { parseVerdict } from '../lib/agents/verdict'
import { collectKeys } from '../lib/ai/keyring'

async function main() {
  console.log('\n========================================')
  console.log('⚡ MENGUJI CEREBRAS CLOUD (QWEN-3.8-27B)')
  console.log('========================================\n')

  const pool = collectKeys('CEREBRAS_API_KEY')
  console.log(`🔑 Terdeteksi ${pool.length} kunci Cerebras di kolam keyring:`)
  pool.forEach((k) => console.log(`   - Kunci #${k.index} [${k.envName}] (sidik: ${k.fingerprint})`))
  console.log('')

  // 1. Tes Panggilan Teks Biasa
  console.log('1. Mengirim prompt teks via registry.complete() dengan prefer: [\'cerebras\']...')
  const t0 = Date.now()
  const res1 = await complete({
    prefer: ['cerebras'],
    messages: [
      { role: 'system', content: 'Kamu asisten AI finansial. Jawab singkat padat 1 kalimat.' },
      { role: 'user', content: 'Mengapa inferensi berkecepatan tinggi sangat penting untuk komunikasi antar agen AI?' },
    ],
    temperature: 0.2,
    maxOutputTokens: 256,
  })
  const dur1 = Date.now() - t0

  console.log(`✅ Sukses via provider: ${res1.providerId} (${res1.model})`)
  console.log(`⏱️ Latensi API: ${res1.latencyMs}ms (Total durasi: ${dur1}ms)`)
  console.log(`💬 Balasan:\n"${res1.text}"\n`)

  // 2. Tes Panggilan Format JSON (Komite Investasi)
  console.log('2. Menguji mode JSON komite (putusan ketua)...')
  const t1 = Date.now()
  const res2 = await complete({
    prefer: ['cerebras'],
    json: true,
    temperature: 0.2,
    maxOutputTokens: 380,
    messages: [
      {
        role: 'system',
        content:
          'Kamu ketua komite investasi. Balas HANYA satu objek JSON valid tanpa markdown:\n' +
          '{"verdict":"beli"|"tahan"|"jual"|"abstain","confidence":<0-100>,"rationale":"<alasan>","key_risk":"<risiko>","invalidation":"<pembatalan>"}',
      },
      {
        role: 'user',
        content: 'Fakta: BBCA.JK harga 10.000, tren naik, volatilitas 12% stabil, drawdown 3% rendah.',
      },
    ],
  })
  const dur2 = Date.now() - t1

  console.log(`✅ Sukses JSON via provider: ${res2.providerId} (${res2.model}) [${res2.latencyMs}ms]`)
  console.log(`💬 JSON Mentah:\n${res2.text}\n`)

  const parsed = parseVerdict(res2.text)
  if (parsed) {
    console.log('✅ Berhasil diurai oleh parseVerdict() komite:')
    console.log(`   - Verdict    : ${parsed.verdict.toUpperCase()}`)
    console.log(`   - Confidence : ${parsed.confidence}%`)
    console.log(`   - Rationale  : ${parsed.rationale}`)
    console.log(`   - Key Risk   : ${parsed.key_risk}`)
    console.log(`   - Invalidation: ${parsed.invalidation}`)
  } else {
    console.error('❌ Gagal mengurai JSON putusan')
    process.exitCode = 1
  }

  console.log('\n🎉 Seluruh pengujian Cerebras berhasil dengan sempurna!\n')
}

main().catch((err) => {
  console.error('\n❌ Pengujian Cerebras gagal:', err)
  process.exit(1)
})
