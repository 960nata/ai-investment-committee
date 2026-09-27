'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconUser,
  IconLock,
  IconClock,
  IconPulse,
  IconCandles,
  IconCheck,
  IconClose,
} from '@/components/icons'
import {
  compressImageToWebP,
  formatBytes,
  type CompressionResult,
} from '@/lib/utils/image-compression'

interface ProfileClientProps {
  initialUser: {
    id: number
    name: string
    email: string
    role: 'admin' | 'user'
    avatarUrl?: string | null
    createdAt?: string | Date
    lastLoginAt?: string | Date | null
  }
}

export function ProfileClient({ initialUser }: ProfileClientProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Profile data state
  const [name, setName] = useState(initialUser.name)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(
    initialUser.avatarUrl ?? null,
  )

  // Upload & compression state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isUpdatingName, setIsUpdatingName] = useState(false)

  // Feedback notifications
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fallback inisial
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join('') || 'U'

  // Tangani pemilihan berkas foto oleh pengguna
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setIsCompressing(true)
    setMessage(null)

    try {
      // Kompresi otomatis di sisi browser menggunakan HTML5 Canvas
      const result = await compressImageToWebP(file, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.85,
        squareCrop: true,
      })

      setCompressionResult(result)
      setMessage({
        type: 'success',
        text: `Foto berhasil dikompresi ke WebP! Ukuran terpangkas ${result.savedPercent}% (${formatBytes(result.originalSize)} ➔ ${formatBytes(result.compressedSize)}).`,
      })
    } catch (err) {
      console.error('[compression]', err)
      setMessage({
        type: 'error',
        text: 'Gagal mengompresi gambar. Pastikan format berkas valid (JPG, PNG, WebP).',
      })
      setCompressionResult(null)
    } finally {
      setIsCompressing(false)
    }
  }

  // Kirim berkas WebP yang sudah dikompresi ke endpoint backend
  async function handleUploadAvatar() {
    if (!compressionResult) return

    setIsUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('avatar', compressionResult.file)

      const res = await fetch('/api/v1/user/avatar', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal mengunggah foto profil.')
      }

      // Berhasil: perbarui avatar URL lokal & bersihkan preview
      setCurrentAvatarUrl(data.avatarUrl)
      setCompressionResult(null)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      setMessage({
        type: 'success',
        text: 'Foto profil WebP berhasil disimpan dan disinkronkan ke seluruh header!',
      })

      // Refresh router agar komponen server & topbar ikut termutakhirkan
      router.refresh()
    } catch (err) {
      console.error('[upload-avatar]', err)
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah foto.',
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Batal pratinjau foto baru
  function handleCancelPreview() {
    setCompressionResult(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setMessage(null)
  }

  // Simpan perubahan nama pengguna
  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) {
      setMessage({ type: 'error', text: 'Nama minimal harus terdiri dari 2 karakter.' })
      return
    }

    setIsUpdatingName(true)
    setMessage(null)

    try {
      const res = await fetch('/api/v1/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal memperbarui nama pengguna.')
      }

      setMessage({
        type: 'success',
        text: 'Nama profil berhasil diperbarui.',
      })
      router.refresh()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui nama profil.',
      })
    } finally {
      setIsUpdatingName(false)
    }
  }

  const previewAvatarUrl = compressionResult?.dataUrl || currentAvatarUrl
  const isSuperAdmin = initialUser.role === 'admin'

  return (
    <div className="profile-page-shell">
      {/* Notifikasi Status */}
      {message && (
        <div
          className={`profile-alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}
          role="alert"
        >
          <div className="alert-icon">
            {message.type === 'success' ? <IconCheck size={16} /> : <IconClose size={16} />}
          </div>
          <div className="alert-text">{message.text}</div>
          <button
            type="button"
            className="alert-dismiss"
            onClick={() => setMessage(null)}
            aria-label="Tutup notifikasi"
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* Hero Header Profil */}
      <header className="profile-header-card">
        <div className="profile-avatar-display-group">
          <div className="profile-avatar-large-circle">
            {previewAvatarUrl ? (
              <img
                src={previewAvatarUrl}
                alt={name}
                className="profile-avatar-large-img"
              />
            ) : (
              <span className="profile-avatar-large-initials mono">{initials}</span>
            )}
            <button
              type="button"
              className="profile-avatar-change-badge"
              onClick={() => fileInputRef.current?.click()}
              title="Ganti foto profil (Otomatis WebP)"
            >
              <IconCandles size={14} />
            </button>
          </div>

          <div className="profile-meta-info">
            <div className="profile-name-role-row">
              <h1 className="profile-display-name">{name}</h1>
              <span className={`badge-pill-role ${isSuperAdmin ? 'role-admin' : 'role-user'} mono`}>
                {isSuperAdmin ? <IconLock size={11} /> : <IconUser size={11} />}
                {isSuperAdmin ? 'ADMINISTRATOR' : 'ANALIS KOMITE'}
              </span>
            </div>
            <p className="profile-display-email mono">{initialUser.email}</p>
            <div className="profile-meta-tags mono">
              <span>UID #{initialUser.id}</span>
              <span>·</span>
              <span>Foto Format: {currentAvatarUrl ? 'WEBP' : 'STANDAR'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Grid 2 Kolom: Pengaturan Foto WebP & Informasi Akun */}
      <div className="profile-grid-layout">
        {/* Kolom Kiri: Upload Foto & Kompresi WebP */}
        <section className="profile-card profile-upload-card">
          <div className="card-header-strip">
            <div className="card-header-icon" style={{ color: 'var(--signal)' }}>
              <IconPulse size={16} />
            </div>
            <div>
              <h2 className="card-header-title">Foto Profil &amp; Kompresi WebP</h2>
              <p className="card-header-sub">
                Setiap foto yang dipilih dikompresi langsung ke format WebP 512×512 di peramban Anda.
              </p>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp, image/gif, image/heic, image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {/* Drag & Drop / Selection Dropzone */}
          <div
            className={`profile-dropzone ${compressionResult ? 'has-preview' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click()
              }
            }}
          >
            <div className="dropzone-content">
              <div className="dropzone-icon">
                <IconUser size={28} />
              </div>
              <div className="dropzone-title">
                {selectedFile ? 'Pilih foto lain' : 'Klik untuk memilih foto profil'}
              </div>
              <p className="dropzone-desc mono">
                JPG, PNG, HEIC atau WebP apa saja · Otomatis dipotong 1:1 dan dikompresi
              </p>
            </div>
          </div>

          {/* Panel Hasil Kompresi WebP Real-time */}
          {isCompressing && (
            <div className="compression-loading-box mono">
              <span className="badge-live-pulse" />
              <span>Sedang mengompresi gambar ke WebP via HTML5 Canvas...</span>
            </div>
          )}

          {compressionResult && !isCompressing && (
            <div className="compression-metrics-card">
              <div className="metrics-header-row">
                <span className="metrics-badge-webp mono">WEBP TERKOMPRESI</span>
                <span className="metrics-savings-pill mono">
                  -{compressionResult.savedPercent}% LEBIH RINGAN
                </span>
              </div>

              {/* Progress bar efisiensi */}
              <div className="metrics-progress-bar">
                <div
                  className="metrics-progress-fill"
                  style={{ width: `${Math.max(15, compressionResult.savedPercent)}%` }}
                />
              </div>

              <div className="metrics-stats-grid mono">
                <div className="metrics-stat-item">
                  <span className="metrics-stat-label">Ukuran Asli</span>
                  <span className="metrics-stat-value text-mute">
                    {formatBytes(compressionResult.originalSize)}
                  </span>
                </div>
                <div className="metrics-stat-arrow">➔</div>
                <div className="metrics-stat-item">
                  <span className="metrics-stat-label">Ukuran WebP</span>
                  <span className="metrics-stat-value text-green bold">
                    {formatBytes(compressionResult.compressedSize)}
                  </span>
                </div>
                <div className="metrics-stat-item">
                  <span className="metrics-stat-label">Dimensi Target</span>
                  <span className="metrics-stat-value">
                    {compressionResult.width} × {compressionResult.height} px
                  </span>
                </div>
              </div>

              {/* Tombol Aksi Upload */}
              <div className="metrics-action-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUploadAvatar}
                  disabled={isUploading}
                >
                  <IconCheck size={14} />
                  <span>{isUploading ? 'Sedang Menyimpan...' : 'Simpan Foto WebP'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={handleCancelPreview}
                  disabled={isUploading}
                >
                  <span>Batal</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Kolom Kanan: Pengaturan Identitas Akun */}
        <section className="profile-card profile-identity-card">
          <div className="card-header-strip">
            <div className="card-header-icon" style={{ color: 'var(--blue)' }}>
              <IconUser size={16} />
            </div>
            <div>
              <h2 className="card-header-title">Identitas Analis</h2>
              <p className="card-header-sub">
                Nama ini akan ditampilkan pada bar navigasi atas dan tanda tangan sidang evaluasi.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveName} className="profile-form">
            <div className="form-group">
              <label htmlFor="display-name" className="form-label mono">
                NAMA LENGKAP ANALIS
              </label>
              <input
                id="display-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masukkan nama tampilan"
                maxLength={80}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email-display" className="form-label mono">
                ALAMAT SUREL
              </label>
              <input
                id="email-display"
                type="email"
                className="form-input form-input-disabled mono"
                value={initialUser.email}
                disabled
              />
              <span className="form-hint mono">
                Surel terikat dengan akun dan tidak dapat diganti secara mandiri.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label mono">HAK AKSES / PERAN</label>
              <div className="role-status-display">
                <span className={`badge-pill-role ${isSuperAdmin ? 'role-admin' : 'role-user'} mono`}>
                  {isSuperAdmin ? <IconLock size={12} /> : <IconUser size={12} />}
                  {isSuperAdmin ? 'SUPER ADMINISTRATOR' : 'ANALIS KUANTITATIF'}
                </span>
                <span className="role-status-desc mono">
                  {isSuperAdmin
                    ? 'Akses penuh ke portal manajemen, server cron, dan pengaturan iklan'
                    : 'Akses penuh ke terminal komite, grafik data bursa, dan warta'}
                </span>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isUpdatingName || name.trim() === initialUser.name}
              >
                <span>{isUpdatingName ? 'Menyimpan...' : 'Perbarui Nama Profil'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Bagian Penjelasan Mekanisme Kompresi WebP */}
      <section className="profile-card profile-mechanism-card">
        <div className="card-header-strip">
          <div className="card-header-icon" style={{ color: 'var(--measured)' }}>
            <IconCandles size={16} />
          </div>
          <div>
            <h2 className="card-header-title">Mekanisme Kerja Kompresi WebP &amp; Upload Avatar</h2>
            <p className="card-header-sub">
              Bagaimana AI Investdesk memproses dan mengompresi foto profil secara instan tanpa membebani server
            </p>
          </div>
        </div>

        <div className="mechanism-steps-grid">
          <div className="mechanism-step-item">
            <div className="step-num mono">01</div>
            <h3 className="step-title">Center-Crop 1:1 di Browser</h3>
            <p className="step-desc">
              Peramban memuat foto ukuran apa pun (hingga 15 MB) dan menghitung dimensi tengah secara presisi
              agar wajah atau objek utama tetap berada di tengah lingkaran avatar tanpa melar atau gepeng.
            </p>
          </div>

          <div className="mechanism-step-item">
            <div className="step-num mono">02</div>
            <h3 className="step-title">Enkoding WebP via Canvas</h3>
            <p className="step-desc">
              HTML5 Canvas merender gambar dengan resolusi 512×512 piksel dan mengekspornya ke format{' '}
              <code>image/webp</code> dengan kualitas optimal 0.85, memangkas bobot file hingga 95-99% dalam
              waktu &lt;30 milidetik.
            </p>
          </div>

          <div className="mechanism-step-item">
            <div className="step-num mono">03</div>
            <h3 className="step-title">Supabase Storage Cloud</h3>
            <p className="step-desc">
              Berkas WebP kecil (~30 KB) dikirim ke endpoint <code>/api/v1/user/avatar</code> dan
              diunggah ke bucket penyimpanan awan Supabase dengan proteksi enkripsi dan CDN global.
            </p>
          </div>

          <div className="mechanism-step-item">
            <div className="step-num mono">04</div>
            <h3 className="step-title">Sinkronisasi Tiket Sesi</h3>
            <p className="step-desc">
              URL publik avatar baru ditulis ke PostgreSQL (<code>app_user</code>) dan cookie sesi{' '}
              <code>komite_user_session</code> langsung disegarkan seketika sehingga foto langsung
              muncul di header dashboard dan halaman publik tanpa perlu masuk ulang.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
