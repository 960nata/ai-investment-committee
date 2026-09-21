/**
 * Helper Supabase Storage untuk mengunggah dan mengelola aset gambar berita.
 *
 * Menggunakan Supabase Storage REST API langsung (native fetch) tanpa ketergantungan
 * pustaka eksternal tambahan, menjamin performa cepat, tanpa overhead, dan kompatibel
 * penuh dengan runtime Node.js dan Next.js Server Components / API Routes.
 */

import { convertToAvif, downloadImage } from '@/lib/media/avif'

const DEFAULT_SUPABASE_URL = 'https://gnluripxpvpxjektjntw.supabase.co'
const DEFAULT_BUCKET = 'ai investasi'

export interface UploadResult {
  ok: boolean
  publicUrl?: string
  error?: string
}

/** Hasil penyimpanan satu foto internet ke bucket sendiri. */
export interface StoredImageResult {
  ok: boolean
  publicUrl?: string
  /** Ukuran berkas setelah konversi. */
  bytes?: number
  /** Ukuran berkas asli sebelum konversi, untuk pelaporan penghematan. */
  originalBytes?: number
  width?: number
  height?: number
  /** false bila sharp tidak tersedia dan berkas disimpan dalam format aslinya. */
  isAvif?: boolean
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
 * Unduh foto dari internet, ubah ke AVIF, lalu unggah ke Supabase Storage.
 *
 * Ini jalur ketat: ia tidak pernah diam-diam mengembalikan URL internet asli.
 * Sampul yang masih menunjuk ke CDN orang lain adalah sampul yang suatu hari
 * berubah jadi kotak kosong tanpa ada yang tahu, jadi pemanggil harus melihat
 * kegagalannya dan memutuskan sendiri — mencoba kandidat foto berikutnya, atau
 * membatalkan penerbitan artikel.
 *
 * @param internetUrl URL berkas foto asli di internet
 * @param slugPrefix Prefix penamaan berkas, biasanya slug artikel
 */
export async function storeRemoteImageAsAvif(
  internetUrl: string,
  slugPrefix: string,
): Promise<StoredImageResult> {
  if (!isSupabaseStorageConfigured()) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.' }
  }

  const download = await downloadImage(internetUrl)
  if (!download.ok || !download.buffer) {
    return { ok: false, error: download.error ?? 'Unduhan foto gagal' }
  }

  const converted = await convertToAvif(download.buffer, download.contentType)
  if (!converted.ok || !converted.buffer) {
    return { ok: false, error: converted.error ?? 'Konversi AVIF gagal' }
  }

  const fileName = buildStoragePath(slugPrefix, converted.extension ?? 'avif')

  const upload = await uploadBufferToSupabase(
    converted.buffer,
    fileName,
    converted.contentType ?? 'image/avif',
  )

  if (!upload.ok || !upload.publicUrl) {
    return { ok: false, error: upload.error ?? 'Unggahan ke Supabase Storage gagal' }
  }

  const ratio = converted.originalBytes
    ? Math.round((1 - converted.buffer.length / converted.originalBytes) * 100)
    : 0

  console.log(
    `[SupabaseStorage] ${fileName} tersimpan — ` +
      `${formatKb(converted.originalBytes ?? 0)} → ${formatKb(converted.buffer.length)}` +
      `${ratio > 0 ? ` (hemat ${ratio}%)` : ''}` +
      `${converted.usedOriginal ? ' [tanpa konversi AVIF]' : ''}`,
  )

  return {
    ok: true,
    publicUrl: upload.publicUrl,
    bytes: converted.buffer.length,
    originalBytes: converted.originalBytes,
    width: converted.width,
    height: converted.height,
    isAvif: converted.contentType === 'image/avif',
  }
}

/**
 * Nama berkas dibuat unik per unggahan, bukan per slug.
 *
 * Menimpa berkas lama dengan nama yang sama akan membuat pembaca yang sudah
 * memuat halaman melihat foto lamanya dari cache CDN sampai TTL-nya habis.
 */
function buildStoragePath(slugPrefix: string, extension: string): string {
  const cleanPrefix =
    slugPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'warta'

  return `news/${cleanPrefix}-${Date.now().toString(36)}.${extension}`
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

/**
 * Bungkus lunak `storeRemoteImageAsAvif` untuk pemakaian yang tidak boleh
 * menggagalkan proses besar — penyemaian artikel bibit dan sinkronisasi massal.
 *
 * Di sini kegagalan berarti sampulnya tetap menunjuk ke internet, dan pemanggil
 * mengetahuinya lewat `isMirrored: false`.
 */
export async function mirrorInternetImageToSupabase(
  internetUrl: string,
  slugPrefix: string,
): Promise<{ url: string; isMirrored: boolean; error?: string }> {
  const { supabaseUrl } = getSupabaseStorageConfig()

  // Foto yang sudah tersimpan sebagai AVIF di bucket sendiri tidak perlu diulang.
  if (internetUrl.startsWith(supabaseUrl) && internetUrl.endsWith('.avif')) {
    return { url: internetUrl, isMirrored: true }
  }

  const stored = await storeRemoteImageAsAvif(internetUrl, slugPrefix)

  if (stored.ok && stored.publicUrl) {
    return { url: stored.publicUrl, isMirrored: true }
  }

  console.warn(
    `[SupabaseStorage] Gagal menyimpan foto ${internetUrl}: ${stored.error}. Pakai URL asli.`,
  )
  return { url: internetUrl, isMirrored: false, error: stored.error }
}
