/**
 * Impor klasifikasi sektor IDX-IC dari berkas yang diunduh manual.
 *
 *   npx tsx scripts/import-sectors.ts <berkas.csv> [--dry-run]
 *
 * Kenapa manual: endpoint profil emiten IDX diblokir Cloudflare untuk akses
 * otomatis (HTTP 403 "Attention Required", diuji 24 September 2026), sementara
 * halaman yang sama terbuka untuk manusia di peramban. Cara mengambilnya:
 *
 *   idx.co.id -> Data Pasar -> Data Saham -> Daftar Saham -> unduh,
 *   lalu simpan sebagai CSV.
 *
 * Kolom dicari menurut namanya — "Kode"/"Kode Saham"/"Code" dan
 * "Sektor"/"Sector" — jadi urutan kolom berkas tidak penting. Pemisah koma,
 * titik koma, atau tab dikenali sendiri.
 *
 * Nama sektor WAJIB salah satu dari sebelas sektor IDX-IC. Nama lain ditolak,
 * bukan disimpan apa adanya: sektor adalah kunci pengelompokan pembanding, dan
 * satu salah ketik ("Keuangan " dengan spasi, "Financial" tanpa s) akan diam-diam
 * membentuk kelompok pembanding baru berisi satu emiten.
 */

import './load-env'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

/** Sebelas sektor IDX-IC. Kunci: bentuk yang dikenali (huruf kecil); nilai: label baku. */
const IDX_IC: Record<string, string> = {}
const SECTORS: [string, string[]][] = [
  ['Energi', ['energy', 'energi']],
  ['Barang Baku', ['basic materials', 'barang baku']],
  ['Perindustrian', ['industrials', 'perindustrian']],
  ['Barang Konsumen Primer', ['consumer non-cyclicals', 'barang konsumen primer', 'consumer non cyclicals']],
  ['Barang Konsumen Non-Primer', ['consumer cyclicals', 'barang konsumen non-primer', 'barang konsumen non primer']],
  ['Kesehatan', ['healthcare', 'kesehatan', 'health care']],
  ['Keuangan', ['financials', 'keuangan', 'financial']],
  ['Properti & Real Estat', ['properties & real estate', 'properti & real estat', 'property & real estate', 'properti dan real estat']],
  ['Teknologi', ['technology', 'teknologi']],
  ['Infrastruktur', ['infrastructures', 'infrastruktur', 'infrastructure']],
  ['Transportasi & Logistik', ['transportation & logistic', 'transportasi & logistik', 'transportation & logistics', 'transportasi dan logistik']],
]
for (const [label, aliases] of SECTORS) for (const a of aliases) IDX_IC[a] = label

/** "G. Financials" atau "G - Keuangan" -> "financials"/"keuangan". */
function normaliseSector(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[A-K]\s*[.\-)]\s*/i, '').replace(/\s+/g, ' ').toLowerCase()
  return IDX_IC[cleaned] ?? null
}

function splitLine(line: string, sep: string): string[] {
  // CSV sederhana dengan tanda kutip ganda — cukup untuk ekspor Excel.
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === sep && !quoted) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

async function main() {
  const file = process.argv[2]
  const dry = process.argv.includes('--dry-run')
  if (!file) {
    console.error('Pakai: npx tsx scripts/import-sectors.ts <berkas.csv> [--dry-run]')
    process.exit(1)
  }

  const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s)) ?? ','
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase())
  const cKode = header.findIndex((h) => ['kode', 'kode saham', 'code', 'stock code', 'ticker'].includes(h))
  const cSektor = header.findIndex((h) => ['sektor', 'sector', 'sektor idx-ic', 'idx-ic sector'].includes(h))
  if (cKode < 0 || cSektor < 0) {
    console.error(`Kolom kode/sektor tidak ditemukan. Header berkas: ${header.join(' | ')}`)
    process.exit(1)
  }

  const sql = postgres(process.env.DIRECT_URL!, { max: 1 })
  const tracked = new Map(
    (await sql<{ id: number; symbol: string }[]>`select id, symbol from instrument where market='idx'`).map((r) => [
      r.symbol.replace(/\.JK$/i, '').toUpperCase(),
      r.id,
    ]),
  )

  const updates: { id: number; kode: string; sector: string }[] = []
  const rejected: string[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const kode = cells[cKode]?.toUpperCase()
    if (!kode || !tracked.has(kode)) continue
    const sector = normaliseSector(cells[cSektor] ?? '')
    if (!sector) {
      rejected.push(`${kode}: "${cells[cSektor]}"`)
      continue
    }
    updates.push({ id: tracked.get(kode)!, kode, sector })
  }

  const missing = [...tracked.keys()].filter((k) => !updates.some((u) => u.kode === k))
  console.log(`\n${updates.length} dari ${tracked.size} saham dipantau punya sektor sah`)
  if (rejected.length) console.log(`${rejected.length} ditolak (nama sektor tidak dikenal):\n  ${rejected.slice(0, 15).join('\n  ')}`)
  if (missing.length) console.log(`${missing.length} tidak ada di berkas: ${missing.join(', ')}`)

  const bySector = new Map<string, number>()
  for (const u of updates) bySector.set(u.sector, (bySector.get(u.sector) ?? 0) + 1)
  console.log('\nSebaran:', Object.fromEntries([...bySector].sort((a, b) => b[1] - a[1])))

  if (dry) {
    console.log('\n--dry-run: tidak ada yang ditulis.\n')
  } else {
    for (const u of updates) await sql`update instrument set sector = ${u.sector} where id = ${u.id}`
    console.log(`\n${updates.length} baris instrument diperbarui.`)
    console.log('Jalankan ulang: npm run job normalise-cross-section — pembanding kini per sektor.\n')
  }
  await sql.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
