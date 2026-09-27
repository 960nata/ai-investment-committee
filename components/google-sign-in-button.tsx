'use client'

/**
 * Tombol Autentikasi Google Sign-In (Firebase Auth).
 *
 * Menginisialisasi Firebase Web SDK di browser, memunculkan popup pemilihan akun Google,
 * lalu mengirimkan ID Token ke /api/v1/auth/google untuk membuat sesi pengguna aman.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconGoogle, IconAlert } from './icons'

interface GoogleSignInButtonProps {
  label?: string
  nextPath?: string
  onError?: (msg: string | null) => void
  disabled?: boolean
}

export function GoogleSignInButton({
  label = 'Masuk dengan Google',
  nextPath = '/ringkasan',
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function reportError(msg: string | null) {
    setLocalError(msg)
    if (onError) onError(msg)
  }

  async function handleGoogleLogin() {
    reportError(null)
    setLoading(true)

    try {
      // 1. Ambil konfigurasi web publik Firebase dari server
      const configRes = await fetch('/api/v1/auth/google/config')
      const configJson = await configRes.json()

      if (!configRes.ok || !configJson.ok || !configJson.config) {
        throw new Error(
          configJson.error ||
            'Konfigurasi autentikasi Google belum siap di server.',
        )
      }

      // 2. Impor modul Firebase Auth secara lazy (code-splitting)
      const { initializeApp, getApps, getApp } = await import('firebase/app')
      const { getAuth, GoogleAuthProvider, signInWithPopup } = await import(
        'firebase/auth'
      )

      const app =
        getApps().length === 0
          ? initializeApp(configJson.config)
          : getApp()

      const auth = getAuth(app)
      auth.languageCode = 'id'

      const provider = new GoogleAuthProvider()
      provider.addScope('email')
      provider.addScope('profile')
      provider.setCustomParameters({
        prompt: 'select_account',
      })

      // 3. Buka popup Google Sign-In
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      if (!user.email) {
        throw new Error(
          'Akun Google tidak menyediakan alamat surel yang sah.',
        )
      }

      const idToken = await user.getIdToken()
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const googleIdToken = credential?.idToken

      // 4. Verifikasi token ke server Komite & pasang sesi HTTP-only cookie
      const authRes = await fetch('/api/v1/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          googleIdToken,
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
        }),
      })

      const authJson = await authRes.json()

      if (!authRes.ok || !authJson.ok) {
        throw new Error(
          authJson.error || 'Gagal membuat sesi login dengan akun Google.',
        )
      }

      // 5. Berhasil: navigasi ke halaman tujuan
      router.push(nextPath)
      router.refresh()
    } catch (err: unknown) {
      setLoading(false)
      const errCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : ''
      const errMsg = err instanceof Error ? err.message : String(err)

      // Penanganan khusus kode status Firebase yang ramah pengguna
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request'
      ) {
        // Pengguna sengaja menutup jendela popup Google — tidak perlu error mencolok
        return
      }

      if (errCode === 'auth/popup-blocked') {
        reportError(
          'Jendela popup Google diblokir oleh peramban. Harap izinkan popup di peramban Anda.',
        )
        return
      }

      if (
        errCode === 'auth/operation-not-allowed' ||
        errCode === 'auth/configuration-not-found'
      ) {
        reportError(
          'Provider Google belum diaktifkan di Firebase Console. Buka Firebase Console > Authentication > Sign-in method > aktifkan Google.',
        )
        return
      }

      if (
        errCode === 'auth/unauthorized-domain' ||
        errMsg.includes('unauthorized-domain')
      ) {
        reportError(
          'Domain web ini belum didaftarkan di Firebase. Buka Firebase Console > Authentication > Settings > Authorized domains > Tambahkan domain web Anda.',
        )
        return
      }

      reportError(errMsg || 'Gagal masuk dengan Google. Coba lagi.')
    }
  }

  return (
    <div style={{ width: '100%' }}>
      {localError && !onError && (
        <div
          className="auth-error"
          style={{ marginBottom: '12px', fontSize: '12px' }}
        >
          <IconAlert size={14} style={{ color: 'var(--halted)', flexShrink: 0 }} />
          <span>{localError}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={disabled || loading}
        className="google-sign-in-btn"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          padding: '11px 16px',
          borderRadius: 'var(--radius-sm, 6px)',
          background: 'var(--surface-sunken, rgba(255, 255, 255, 0.05))',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
          color: 'var(--ink, #ffffff)',
          fontSize: '13.5px',
          fontWeight: 600,
          cursor: loading || disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: disabled ? 0.6 : 1,
          fontFamily: 'inherit',
        }}
      >
        <IconGoogle size={18} />
        <span>{loading ? 'Menghubungkan ke Google...' : label}</span>
      </button>
    </div>
  )
}
