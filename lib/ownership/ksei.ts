/**
 * KSEI — komposisi kepemilikan efek per akhir bulan.
 *
 * Satu berkas zip per bulan di web.ksei.co.id, bernama BalanceposEfek<YYYYMMDD>.zip,
 * gratis dan resmi, tersedia sejak 2015. Isinya satu berkas teks berpembatas `|`:
 * satu baris per efek, dengan jumlah lembar milik investor lokal dan asing yang
 * dipecah ke sembilan jenis (asuransi, korporasi, dana pensiun, bank, individu,
 * reksa dana, perusahaan efek, yayasan, lainnya).
 *
 * Tanggal di nama berkas adalah hari kerja terakhir bulan itu, bukan tanggal 30
 * atau 31: posisi Agustus 2025 bernama 20250829 karena 30 dan 31 jatuh di akhir
 * pekan. Karena itu pencariannya mundur dari akhir bulan sampai ketemu, bukan
 * menebak satu tanggal.
 *
 * Zip dibuka dengan zlib bawaan Node, bukan pustaka zip. Berkasnya selalu satu
 * entri dengan kompresi deflate biasa; membaca direktori pusatnya cukup
 * belasan baris, sementara satu dependensi tambahan adalah satu permukaan rantai
 * pasok tambahan untuk pekerjaan sesederhana itu.
 */

import { inflateRawSync } from 'node:zlib'
import { fetchWithTimeout } from '@/lib/http/fetch'
import { KSEI_INVESTOR_TYPES } from '@/lib/db/schema'

const KSEI_URL = 'https://web.ksei.co.id/Download'

/**
 * Jeda dari tanggal posisi sampai berkasnya dianggap sudah bisa diketahui.
 *
 * Berkas posisi 31 Agustus 2026 bertanggal unggah 1 September 06.00. Lima hari
 * sengaja lebih longgar dari itu: berkas yang terlambat terbit sehari dua hari
 * tidak boleh membuat backtest memakainya sebelum benar-benar ada. Terlalu
 * hati-hati hanya menggeser sinyal beberapa hari; terlalu longgar berarti
 * melihat masa depan.
 */
export const KSEI_AVAILABILITY_LAG_DAYS = 5

export interface KseiRow {
  code: string
  asOf: string
  sharesListed: number
  price: number | null
  local: number[]
  foreign: number[]
  localTotal: number
  foreignTotal: number
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/**
 * "31-AUG-2026" atau "31-Jan-2017" -> "YYYY-MM-DD".
 *
 * Tidak peka huruf besar-kecil. Berkas lama menulis nama bulan dengan huruf
 * kecil ("31-Jan-2017"), dan pencocokan yang hanya menerima huruf besar membuang
 * seluruh isi bulan itu tanpa satu pun galat — Januari 2017 sempat hilang begitu.
 */
function parseKseiDate(raw: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim())
  const mon = m ? MONTHS[m[2].toUpperCase()] : undefined
  if (!m || !mon) return null
  return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`
}

function toInt(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Buka zip satu entri lewat direktori pusatnya.
 *
 * Ukuran dibaca dari direktori pusat, bukan dari header lokal: zip yang ditulis
 * secara streaming boleh mengisi ukuran di header lokal dengan nol lalu
 * menaruh angka sebenarnya di belakang data.
 */
export function unzipSingleEntry(buf: Buffer): Buffer {
  const EOCD = 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('bukan berkas zip (EOCD tidak ditemukan)')

  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('direktori pusat zip rusak')

  const method = buf.readUInt16LE(cdOffset + 10)
  const compressedSize = buf.readUInt32LE(cdOffset + 20)
  const localOffset = buf.readUInt32LE(cdOffset + 42)
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('header lokal zip rusak')

  const nameLen = buf.readUInt16LE(localOffset + 26)
  const extraLen = buf.readUInt16LE(localOffset + 28)
  const start = localOffset + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + compressedSize)

  if (method === 0) return Buffer.from(data)
  if (method === 8) return inflateRawSync(data)
  throw new Error(`metode kompresi zip ${method} tidak didukung`)
}

/**
 * Urai isi berkas teks KSEI. Hanya saham (Type = EQUITY) yang diambil;
 * obligasi, reksa dana, dan waran ikut ada di berkas yang sama.
 */
export function parseKsei(text: string): KseiRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []

  const header = lines[0].split('|').map((h) => h.trim())
  // Kolom dicari menurut namanya, bukan posisinya. Kalau KSEI suatu hari
  // menyisipkan kolom, urutan yang dikunci akan diam-diam membaca angka yang
  // salah — dan angka yang salah tidak pernah melempar galat.
  const idx = (name: string, from = 0) => header.indexOf(name, from)
  const cDate = idx('Date')
  const cCode = idx('Code')
  const cType = idx('Type')
  const cShares = idx('Sec. Num')
  const cPrice = idx('Price')
  const localStart = idx(`Local ${KSEI_INVESTOR_TYPES[0]}`)
  const foreignStart = idx(`Foreign ${KSEI_INVESTOR_TYPES[0]}`)

  if ([cDate, cCode, cType, cShares, localStart, foreignStart].some((c) => c < 0)) {
    throw new Error(`kolom KSEI tidak dikenali: ${header.slice(0, 8).join('|')}…`)
  }
  for (let k = 0; k < KSEI_INVESTOR_TYPES.length; k++) {
    if (header[localStart + k] !== `Local ${KSEI_INVESTOR_TYPES[k]}`) {
      throw new Error(`urutan kolom lokal berubah di posisi ${k}: ${header[localStart + k]}`)
    }
    if (header[foreignStart + k] !== `Foreign ${KSEI_INVESTOR_TYPES[k]}`) {
      throw new Error(`urutan kolom asing berubah di posisi ${k}: ${header[foreignStart + k]}`)
    }
  }
  const localTotalCol = localStart + KSEI_INVESTOR_TYPES.length
  const foreignTotalCol = foreignStart + KSEI_INVESTOR_TYPES.length

  const out: KseiRow[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split('|')
    if (cells[cType]?.trim() !== 'EQUITY') continue

    const asOf = parseKseiDate(cells[cDate] ?? '')
    const shares = toInt(cells[cShares])
    if (!asOf || shares === null || shares <= 0) continue

    const local = KSEI_INVESTOR_TYPES.map((_, k) => toInt(cells[localStart + k]) ?? 0)
    const foreign = KSEI_INVESTOR_TYPES.map((_, k) => toInt(cells[foreignStart + k]) ?? 0)

    out.push({
      code: cells[cCode].trim(),
      asOf,
      sharesListed: shares,
      price: toInt(cells[cPrice]),
      local,
      foreign,
      localTotal: toInt(cells[localTotalCol]) ?? local.reduce((a, b) => a + b, 0),
      foreignTotal: toInt(cells[foreignTotalCol]) ?? foreign.reduce((a, b) => a + b, 0),
    })
  }
  return out
}

/** Hari terakhir bulan, sebagai YYYYMMDD. */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0))
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

/**
 * Ambil berkas satu bulan. Mencoba hari kerja mundur dari akhir bulan sampai
 * ketemu, paling jauh empat belas hari.
 *
 * Delapan hari sempat dipakai dan tidak cukup: libur Idul Fitri 2017 plus cuti
 * bersamanya menutup 23 sampai 30 Juni, sehingga hari kerja terakhir bulan itu
 * 22 Juni. Libur keagamaan yang jatuh di akhir bulan bisa sepanjang itu.
 * Mengembalikan null bila bulan itu memang tidak punya berkas.
 */
export async function fetchKseiMonth(
  year: number,
  month: number,
): Promise<{ fileDate: string; rows: KseiRow[] } | null> {
  const end = lastDayOfMonth(year, month)
  for (let back = 0; back < 14; back++) {
    const d = new Date(end.getTime() - back * 86_400_000)
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue

    const url = `${KSEI_URL}/BalanceposEfek${ymd(d)}.zip`
    const res = await fetchWithTimeout(url, { label: 'KSEI', timeoutMs: 30_000 })
    // KSEI menjawab 500, bukan 404, untuk tanggal yang memang tidak punya
    // berkas — terbukti di Juni 2017 (Idul Fitri), Oktober 2020 (cuti bersama),
    // dan Juni 2023 (Idul Adha). Keduanya berarti "coba hari kerja sebelumnya".
    if (res.status === 404 || res.status === 500) continue
    if (!res.ok) throw new Error(`KSEI ${ymd(d)} menjawab HTTP ${res.status}`)

    const type = res.headers.get('content-type') ?? ''
    const buf = Buffer.from(await res.arrayBuffer())
    // Server kadang menjawab 200 dengan halaman HTML untuk berkas yang tidak
    // ada. Tanda tangan zip "PK" yang memastikan isinya memang berkas.
    if (!type.includes('zip') && buf.subarray(0, 2).toString() !== 'PK') continue

    const text = unzipSingleEntry(buf).toString('latin1')
    const rows = parseKsei(text)
    // Berkas yang terbuka tapi tidak menghasilkan satu saham pun hampir pasti
    // berarti formatnya berubah. Dilempar sebagai galat supaya bulan itu tidak
    // tercatat "berhasil" dengan nol baris.
    if (rows.length === 0 && /\|EQUITY\|/.test(text)) {
      throw new Error(`berkas ${ymd(d)} berisi saham tetapi tidak satu pun terbaca — format berubah?`)
    }
    return { fileDate: d.toISOString().slice(0, 10), rows }
  }
  return null
}

export function kseiAvailableAt(asOf: string): string {
  const d = new Date(`${asOf}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + KSEI_AVAILABILITY_LAG_DAYS)
  return d.toISOString().slice(0, 10)
}
