/**
 * Helper Supabase Storage untuk mengunggah dan mengelola aset gambar berita.
 *
 * Menggunakan Supabase Storage REST API langsung (native fetch) tanpa ketergantungan
 * pustaka eksternal tambahan, menjamin performa cepat, tanpa overhead, dan kompatibel
 * penuh dengan runtime Node.js dan Next.js Server Components / API Routes.
 */

const DEFAULT_SUPABASE_URL = 'https://gnluripxpvpxjektjntw.supabase.co'
const DEFAULT_BUCKET = 'ai investasi'

export interface UploadResult {
  ok: boolean
  publicUrl?: string
  error?: string
}

/**
 * Dapatkan konfigurasi Supabase Storage aktif dari environment variable.
 */
export function getSupabaseStorageConfig() {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).replace(/\/$/, '')

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET ||
    DEFAULT_BUCKET

  return { supabaseUrl, serviceRoleKey, bucket }
}

/**
 * Cek apakah kredensial Supabase Storage sudah tersedia.
 */
export function isSupabaseStorageConfigured(): boolean {
  const { serviceRoleKey } = getSupabaseStorageConfig()
  return Boolean(serviceRoleKey && serviceRoleKey.length > 20)
}

/**
 * Unggah buffer data gambar langsung ke Supabase Storage.
 *
 * @param buffer Data biner gambar
 * @param storagePath Path file tujuan di dalam bucket, misal "news/analisis-pasar-123.jpg"
 * @param contentType MIME type gambar, misal "image/jpeg"
 */
export async function uploadBufferToSupabase(
  buffer: Buffer | Uint8Array,
  storagePath: string,
  contentType = 'image/jpeg',
): Promise<UploadResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseStorageConfig()

  if (!serviceRoleKey) {
    return {
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment variable.',
    }
  }

  // Bersihkan storage path agar tidak diawali tanda slash
  const cleanPath = storagePath.replace(/^\/+/, '')
  const encodedBucket = encodeURIComponent(bucket)
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodedBucket}/${cleanPath}`

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer as BodyInit,
    })

    if (!res.ok) {
      const errText = await res.text()
      return {
        ok: false,
        error: `Supabase Storage error (${res.status}): ${errText}`,
      }
    }

    // Bangun URL publik permanen dari bucket Supabase Storage
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${cleanPath}`
    return {
      ok: true,
      publicUrl,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Unggah berkas File (dari FormData formulir browser) langsung ke Supabase Storage.
 */
export async function uploadImageFile(
  file: File,
  filenamePrefix = 'manual',
): Promise<UploadResult> {
  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop() || 'jpg'
    const cleanPrefix = filenamePrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 40)
    const storagePath = `news/${cleanPrefix}-${Date.now().toString(36)}.${ext}`
    return uploadBufferToSupabase(buffer, storagePath, file.type || 'image/jpeg')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Unduh foto asli dari internet (misal CDN Unsplash / berita), lalu langsung
 * unggah ke Supabase Storage sebelum artikel diterbitkan.
 *
 * Jika proses upload gagal (misal koneksi jaringan / kuota), fungsi ini secara
 * otomatis dan aman mengembalikan URL internet asli sebagai jaring pengaman
 * (graceful fallback) agar proses pembuatan artikel tidak terputus.
 *
 * @param internetUrl URL foto asli di internet
 * @param slugPrefix Prefix penamaan berkas berdasarkan slug artikel
 */
export async function mirrorInternetImageToSupabase(
  internetUrl: string,
  slugPrefix: string,
): Promise<{ url: string; isMirrored: boolean }> {
  // Jika URL sudah berasal dari Supabase Storage, tidak perlu di-mirror ulang
  const { supabaseUrl } = getSupabaseStorageConfig()
  if (internetUrl.startsWith(supabaseUrl)) {
    return { url: internetUrl, isMirrored: true }
  }

  try {
    console.log(`[SupabaseStorage] Mengunduh foto internet dari: ${internetUrl}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12_000)

    const response = await fetch(internetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 AI-News-Bot/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn(
        `[SupabaseStorage] Gagal mengunduh foto internet (HTTP ${response.status}). Gunakan URL asli.`,
      )
      return { url: internetUrl, isMirrored: false }
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Tentukan ekstensi berkas
    let ext = 'jpg'
    if (contentType.includes('png')) ext = 'png'
    else if (contentType.includes('webp')) ext = 'webp'
    else if (contentType.includes('gif')) ext = 'gif'

    // Format nama file rapi dan unik
    const cleanPrefix = slugPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 50)
    const fileName = `news/${cleanPrefix}-${Date.now().toString(36)}.${ext}`

    console.log(`[SupabaseStorage] Mengunggah foto ke Supabase Storage: ${fileName} (${buffer.length} bytes)...`)
    const uploadResult = await uploadBufferToSupabase(buffer, fileName, contentType)

    if (uploadResult.ok && uploadResult.publicUrl) {
      console.log(`[SupabaseStorage] Berhasil diunggah! URL Publik: ${uploadResult.publicUrl}`)
      return { url: uploadResult.publicUrl, isMirrored: true }
    } else {
      console.warn(
        `[SupabaseStorage] Gagal mengunggah ke Supabase Storage: ${uploadResult.error}. Gunakan URL asli.`,
      )
      return { url: internetUrl, isMirrored: false }
    }
  } catch (err) {
    console.warn('[SupabaseStorage] Error mirror foto ke Supabase Storage:', err)
    return { url: internetUrl, isMirrored: false }
  }
}
