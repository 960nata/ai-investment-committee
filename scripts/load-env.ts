/**
 * Pemuat .env untuk perkakas baris perintah.
 *
 * Next.js memuat `.env.local` sendiri, tetapi drizzle-kit dan skrip seed jalan di
 * luar Next dan tidak ikut kebagian. Pembacanya ditulis sendiri, sekitar tiga
 * puluh baris, supaya tidak ada satu paket pun yang ditambahkan hanya untuk ini.
 *
 * Variabel yang sudah ada di lingkungan tidak pernah ditimpa — di Vercel dan CI,
 * lingkungan asli yang benar, bukan file di dalam repo.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Urutan prioritas: yang pertama ditemukan menang untuk tiap kunci. */
const FILES = ['.env.local', '.env']

function parse(content: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    if (key === '') continue

    let value = line.slice(eq + 1).trim()

    // Nilai berkutip dipertahankan apa adanya; kutip itu sendiri dibuang.
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))

    if (quoted && value.length >= 2) {
      value = value.slice(1, -1)
    } else {
      // Komentar di akhir baris hanya berlaku pada nilai tanpa kutip.
      const hash = value.indexOf(' #')
      if (hash !== -1) value = value.slice(0, hash).trim()
    }

    out[key] = value
  }

  return out
}

export function loadEnv(cwd: string = process.cwd()): string[] {
  const loaded: string[] = []

  for (const file of FILES) {
    const path = resolve(cwd, file)
    if (!existsSync(path)) continue

    for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value
    }
    loaded.push(file)
  }

  return loaded
}

loadEnv()
