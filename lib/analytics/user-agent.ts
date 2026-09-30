/**
 * Nama peramban dan sistem operasi dari User-Agent.
 *
 * Sengaja kasar: yang dibutuhkan halaman analitik adalah "Chrome di Android",
 * bukan nomor versi. Urutan pemeriksaan penting — hampir semua peramban
 * menyebut "Safari" dan "Chrome" di UA-nya, jadi yang paling spesifik dicek
 * lebih dulu.
 */

export function browserOf(userAgent: string | null): string {
  if (!userAgent) return 'Tidak diketahui'
  const ua = userAgent
  if (/FBAN|FBAV|Instagram/i.test(ua)) return 'In-app (Meta)'
  if (/Line\//i.test(ua)) return 'In-app (LINE)'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
  if (/UCBrowser/.test(ua)) return 'UC Browser'
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Lainnya'
}

export function osOf(userAgent: string | null): string {
  if (!userAgent) return 'Tidak diketahui'
  const ua = userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows NT/.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Lainnya'
}

/**
 * Asal rujukan, hanya nama host-nya.
 *
 * Rujukan dari situs sendiri dibuang (itu perpindahan halaman, bukan sumber),
 * dan jalur serta kuerinya tidak disimpan — URL rujukan bisa membawa token
 * atau kata kunci pencarian pribadi.
 */
export function referrerHost(referrer: string | null | undefined, ownHost: string | null): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase()
    if (!host) return null
    if (ownHost && host === ownHost.replace(/^www\./, '').toLowerCase()) return null
    return host.slice(0, 128)
  } catch {
    return null
  }
}
