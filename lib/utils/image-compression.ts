/**
 * Utilitas kompresi foto klien ke format WebP via HTML5 Canvas.
 *
 * Mengubah foto resolusi tinggi (misal kamera ponsel 5-15 MB) menjadi
 * berkas WebP ringan 512x512 piksel (~25-50 KB) langsung di peramban pengguna
 * dalam waktu 10-30 milidetik sebelum dikirim ke server.
 *
 * Menghemat kuota bandwidth, mempercepat waktu muat, dan memangkas beban server.
 */

export interface CompressionOptions {
  /** Lebar maksimal dalam piksel (default: 512 untuk foto profil) */
  maxWidth?: number
  /** Tinggi maksimal dalam piksel (default: 512 untuk foto profil) */
  maxHeight?: number
  /** Kualitas WebP dari 0.1 sampai 1.0 (default: 0.85) */
  quality?: number
  /** Jika true, foto dipotong di tengah jadi bujur sangkar 1:1 (ideal untuk avatar) */
  squareCrop?: boolean
}

export interface CompressionResult {
  /** Objek Blob terkompresi */
  blob: Blob
  /** Objek Berkas (File) siap kirim ke FormData */
  file: File
  /** URL data base64 untuk pratinjau instan */
  dataUrl: string
  /** Ukuran berkas asli dalam byte */
  originalSize: number
  /** Ukuran berkas setelah dikompresi WebP dalam byte */
  compressedSize: number
  /** Persentase penghematan ukuran berkas */
  savedPercent: number
  /** Lebar akhir piksel */
  width: number
  /** Tinggi akhir piksel */
  height: number
  /** Format keluaran ('image/webp' atau fallback 'image/jpeg') */
  format: string
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Kompres berkas gambar menjadi format WebP menggunakan HTML5 Canvas di browser.
 */
export async function compressImageToWebP(
  sourceFile: File,
  options: CompressionOptions = {},
): Promise<CompressionResult> {
  const {
    maxWidth = 512,
    maxHeight = 512,
    quality = 0.85,
    squareCrop = true,
  } = options

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar sumber.'))

    reader.onload = (event) => {
      const img = new Image()

      img.onerror = () => reject(new Error('Format berkas gambar tidak didukung oleh peramban.'))

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d', { willReadFrequently: false })

          if (!ctx) {
            reject(new Error('Gagal menginisialisasi konteks 2D canvas.'))
            return
          }

          let sX = 0
          let sY = 0
          let sWidth = img.naturalWidth || img.width
          let sHeight = img.naturalHeight || img.height

          let dWidth = maxWidth
          let dHeight = maxHeight

          if (squareCrop) {
            // Potong bujur sangkar terpusat di tengah gambar (Center-Crop 1:1)
            const minDim = Math.min(sWidth, sHeight)
            sX = (sWidth - minDim) / 2
            sY = (sHeight - minDim) / 2
            sWidth = minDim
            sHeight = minDim

            // Dimensi target
            const targetDim = Math.min(minDim, Math.max(maxWidth, maxHeight))
            dWidth = targetDim
            dHeight = targetDim
          } else {
            // Skala proporsional menjaga aspect ratio
            const ratio = Math.min(maxWidth / sWidth, maxHeight / sHeight, 1)
            dWidth = Math.round(sWidth * ratio)
            dHeight = Math.round(sHeight * ratio)
          }

          canvas.width = dWidth
          canvas.height = dHeight

          // Smoothing berkualitas tinggi
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'

          // Gambar ke canvas
          ctx.drawImage(img, sX, sY, sWidth, sHeight, 0, 0, dWidth, dHeight)

          // Cek dukungan ekspor WebP
          const targetMime = 'image/webp'
          const dataUrl = canvas.toDataURL(targetMime, quality)
          const actualFormat = dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Gagal mengekspor blob WebP dari canvas.'))
                return
              }

              const ext = actualFormat === 'image/webp' ? 'webp' : 'jpg'
              const cleanBaseName = sourceFile.name.replace(/\.[^/.]+$/, '')
              const newFileName = `${cleanBaseName}-compressed.${ext}`

              const compressedFile = new File([blob], newFileName, {
                type: actualFormat,
                lastModified: Date.now(),
              })

              const originalSize = sourceFile.size
              const compressedSize = blob.size
              const savedPercent = Math.max(
                0,
                Math.round(((originalSize - compressedSize) / originalSize) * 100),
              )

              resolve({
                blob,
                file: compressedFile,
                dataUrl,
                originalSize,
                compressedSize,
                savedPercent,
                width: dWidth,
                height: dHeight,
                format: actualFormat,
              })
            },
            actualFormat,
            quality,
          )
        } catch (err) {
          reject(err)
        }
      }

      img.src = event.target?.result as string
    }

    reader.readAsDataURL(sourceFile)
  })
}
