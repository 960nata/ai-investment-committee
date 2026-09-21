/**
 * Unduh foto dari internet dan ubah menjadi AVIF.
 *
 * AVIF dipilih karena sampul warta adalah berkas terberat di halaman portal:
 * foto 1600 px yang semula 130 KB sebagai JPEG turun ke sekitar 25 KB tanpa
 * kehilangan mutu yang terlihat mata. Di jaringan seluler Indonesia, selisih
 * itu menentukan apakah hero card muncul seketika atau berkedip abu-abu dulu.
 *
 * Pengodean dikerjakan `sharp`, yang sudah ikut terpasang sebagai dependensi
 * opsional Next.js dan otomatis di-externalize dari bundel server. Bila ia
 * gagal dimuat — mis. di runtime tanpa binari nativnya — berkas aslinya tetap
 * diteruskan apa adanya: portal lebih baik menyimpan JPEG sendiri daripada
 * menggantungkan sampulnya pada tautan CDN pihak lain yang bisa mati.
 */

/** Lebar sampul terbesar yang benar-benar dipakai tata letak portal. */
const TARGET_WIDTH = 1600

/**
 * Mutu 50 pada AVIF setara sekitar mutu 75 pada JPEG. Di atas itu ukurannya
 * naik tajam tanpa perbedaan yang kasatmata pada foto bertekstur.
 */
const AVIF_QUALITY = 50

/**
 * Effort 4 menahan waktu pengodean di sekitar 300 ms untuk foto 1600 px.
 * Nilai 9 memangkas berkas beberapa persen lagi tapi bisa menembus batas
 * waktu fungsi serverless.
 */
const AVIF_EFFORT = 4

/** Unduhan di atas ini hampir pasti bukan foto berita, melainkan salah sasaran. */
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024

const DOWNLOAD_TIMEOUT_MS = 15_000

/**
 * Sebagian CDN foto menolak klien tanpa User-Agent peramban. Ini bukan
 * penyamaran untuk menembus pembatasan — sumber yang dipakai memang
 * mengizinkan pengunduhan, hanya saja penyaring bot bawaannya kasar.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface DownloadedImage {
  ok: boolean
  buffer?: Buffer
  contentType?: string
  error?: string
}

export interface AvifResult {
  ok: boolean
  buffer?: Buffer
  /** MIME hasil akhir — "image/avif", atau MIME asli bila sharp tidak tersedia. */
  contentType?: string
  /** Ekstensi berkas yang cocok dengan contentType. */
  extension?: string
  width?: number
  height?: number
  bytes?: number
  /** Ukuran berkas sebelum dikonversi, untuk dicatat di log. */
  originalBytes?: number
  /** true bila konversi dilewati dan berkas asli dipakai apa adanya. */
  usedOriginal?: boolean
  error?: string
}

/**
 * Unduh berkas gambar, dengan batas waktu dan batas ukuran.
 *
 * Content-Length diperiksa lebih dulu supaya berkas raksasa ditolak sebelum
 * satu bita pun masuk memori; sumber yang tidak mengirim header itu tetap
 * diperiksa lagi setelah bodinya terbaca.
 */
export async function downloadImage(url: string): Promise<DownloadedImage> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return { ok: false, error: `Sumber foto menolak unduhan (HTTP ${res.status})` }
    }

    const declaredSize = Number(res.headers.get('content-length') ?? 0)
    if (declaredSize > MAX_DOWNLOAD_BYTES) {
      return {
        ok: false,
        error: `Berkas terlalu besar (${Math.round(declaredSize / 1024 / 1024)} MB)`,
      }
    }

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return { ok: false, error: `Bukan berkas gambar (${contentType})` }
    }

    const buffer = Buffer.from(await res.arrayBuffer())

    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      return { ok: false, error: `Berkas terlalu besar (${Math.round(buffer.length / 1024 / 1024)} MB)` }
    }
    if (buffer.length < 1024) {
      return { ok: false, error: 'Berkas terlalu kecil, kemungkinan halaman galat' }
    }

    return { ok: true, buffer, contentType }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: controller.signal.aborted ? `Unduhan melewati ${DOWNLOAD_TIMEOUT_MS} ms` : message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Ubah buffer gambar apa pun menjadi AVIF 1600 px.
 *
 * `rotate()` tanpa argumen menerapkan orientasi EXIF sebelum metadata dibuang,
 * supaya foto dari kamera ponsel tidak terbit dalam keadaan terbalik.
 */
export async function convertToAvif(
  input: Buffer,
  originalContentType = 'image/jpeg',
): Promise<AvifResult> {
  const sharp = await loadSharp()

  if (!sharp) {
    return {
      ok: true,
      buffer: input,
      contentType: originalContentType,
      extension: extensionFor(originalContentType),
      bytes: input.length,
      originalBytes: input.length,
      usedOriginal: true,
    }
  }

  try {
    const pipeline = sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT, chromaSubsampling: '4:2:0' })

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

    return {
      ok: true,
      buffer: data,
      contentType: 'image/avif',
      extension: 'avif',
      width: info.width,
      height: info.height,
      bytes: data.length,
      originalBytes: input.length,
      usedOriginal: false,
    }
  } catch (err) {
    return {
      ok: false,
      error: `Konversi AVIF gagal: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Muat sharp tanpa memaksa bundler menautkannya secara statis.
 *
 * Kegagalan di sini bukan galat: sharp adalah dependensi opsional, dan
 * ketiadaannya hanya berarti sampul disimpan dalam format aslinya.
 */
type SharpFactory = (typeof import('sharp'))['default']
let sharpModule: SharpFactory | null | undefined

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule

  try {
    const mod = await import('sharp')
    sharpModule = mod.default
  } catch (err) {
    console.warn(
      '[AVIF] sharp tidak tersedia, sampul disimpan tanpa konversi:',
      err instanceof Error ? err.message : String(err),
    )
    sharpModule = null
  }

  return sharpModule
}

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('avif')) return 'avif'
  if (contentType.includes('tiff')) return 'tiff'
  return 'jpg'
}

/** Dipakai pengujian agar modul yang sudah dimuat bisa dilupakan. */
export function resetSharpCache(): void {
  sharpModule = undefined
}
