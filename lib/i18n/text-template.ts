/**
 * Pemilahan teks untuk penerjemah halaman (SiteTranslator).
 *
 * Dipisah dari komponennya supaya aturan "apa yang dikirim ke penerjemah"
 * bisa diuji tanpa peramban.
 */

/** Angka apa pun — harga, persen, jam, tanggal numerik — beserta tandanya. */
const NUMBER = /[+\-−]?\d[\d.,:]*%?/g

/**
 * Angka diganti placeholder sebelum dicari di cache atau dikirim.
 *
 * Tanpa ini "2971 candle", "12 candle", dan "3 mnt lalu" masing-masing jadi
 * kalimat unik: ratusan permintaan untuk satu halaman, harga yang berdenyut
 * tiap delapan detik dikirim ulang terus, dan batas laju serta kuota harian
 * habis sebelum teks yang sebenarnya sempat diterjemahkan. Dengan placeholder
 * semuanya jadi satu kunci, "{0} candle".
 */
export function template(core: string): { key: string; values: string[] } {
  const values: string[] = []
  const key = core.replace(NUMBER, (m) => `{${values.push(m) - 1}}`)
  return { key, values }
}

/** Pasang kembali angka ke terjemahan. Null kalau model menghilangkan placeholder. */
export function fill(translated: string, values: string[]): string | null {
  let out = translated
  for (let i = 0; i < values.length; i++) {
    if (!out.includes(`{${i}}`)) return null
    out = out.split(`{${i}}`).join(values[i])
  }
  return out
}

/**
 * Token yang tidak perlu diterjemahkan: placeholder, token tanpa huruf, ticker
 * bersufiks bursa (BBCA.JK, ^JKSE, GC=F, BTCUSDT), dan kode mata uang. Kata
 * berhuruf kapital biasa ("HALAMAN", "AKTIF") sengaja tidak termasuk — itu
 * label antarmuka yang memang harus diterjemahkan.
 */
const CODE =
  /^(\{\d+\}|[^\p{L}]+|[A-Z0-9-]+(\.[A-Z]{1,3}|=F|USDT)|\^[A-Z0-9]+|IDR|USD|USDT|EUR|JPY|KRW|GBP|AUD|INR|HKD|SGD|CNY|CHF|CAD)$/u

/** Teks tanpa kata yang bisa diterjemahkan: tidak dikirim. */
export function translatable(key: string): boolean {
  if (key.length < 2 || key.length > 1000) return false
  if (!/\p{L}/u.test(key.replace(/\{\d+\}/g, ''))) return false
  if (!/\s/.test(key) && /[.^=/]|USDT$|\{\d+\}/.test(key)) return false
  // Semua kata berupa kode atau angka — "{0} IDR", "BBCA.JK", "BTC / USDT".
  if (key.split(/\s+/).every((word) => CODE.test(word))) return false
  return true
}
