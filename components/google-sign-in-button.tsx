'use client'

/**
 * Tombol Autentikasi Google Sign-In (Firebase Auth).
 *
 * Menginisialisasi Firebase Web SDK di browser, memunculkan popup pemilihan akun Google,
 * lalu mengirimkan ID Token ke /api/v1/auth/google untuk membuat sesi pengguna aman.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Auth, AuthProvider, UserCredential } from 'firebase/auth'
import { IconGoogle, IconAlert } from './icons'

interface PreparedAuth {
  auth: Auth
  provider: AuthProvider
  signInWithPopup: (auth: Auth, provider: AuthProvider) => Promise<UserCredential>
  credentialFromResult: (result: UserCredential) => { idToken?: string } | null
}

/**
 * Konfigurasi dan SDK Firebase disiapkan sebelum tombol diklik. Peramban
 * seluler (terutama Safari iOS) hanya mengizinkan popup yang dibuka langsung
 * dari ketukan pengguna; kalau di antaranya ada `await fetch` atau `import()`,
 * izin itu sudah kedaluwarsa dan popup diblokir.
 */
async function prepareAuth(): Promise<PreparedAuth> {
  const configRes = await fetch('/api/v1/auth/google/config')
  const configJson = await configRes.json()

  if (!configRes.ok || !configJson.ok || !configJson.config) {
    throw new Error(
      configJson.error || 'Konfigurasi autentikasi Google belum siap di server.',
    )
  }

  const { initializeApp, getApps, getApp } = await import('firebase/app')
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')

  const app = getApps().length === 0 ? initializeApp(configJson.config) : getApp()
  const auth = getAuth(app)
  auth.languageCode = 'id'

  const provider = new GoogleAuthProvider()
  provider.addScope('email')
  provider.addScope('profile')
  provider.setCustomParameters({ prompt: 'select_account' })

  return {
    auth,
    provider,
    signInWithPopup,
    credentialFromResult: (result) => GoogleAuthProvider.credentialFromResult(result),
  }
}

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

  const prepared = useRef<Promise<PreparedAuth> | null>(null)
  const readyAuth = useRef<PreparedAuth | null>(null)

  useEffect(() => {
    const pending = prepareAuth()
    pending.then(
      (ready) => {
        readyAuth.current = ready
      },
      // Galat persiapan baru ditampilkan saat tombol diklik, bukan saat halaman dibuka.
      () => {},
    )
    prepared.current = pending
  }, [])

  async function handleGoogleLogin() {
    reportError(null)
    setLoading(true)

    try {
      let ready = readyAuth.current
      if (!ready) {
        // Jalur lambat: persiapan belum selesai. Popup mungkin tetap diblokir di
        // seluler, tapi klik berikutnya akan memakai jalur cepat di atas.
        if (!prepared.current) prepared.current = prepareAuth()
        try {
          ready = await prepared.current
          readyAuth.current = ready
        } catch (err) {
          // Coba siapkan ulang di klik berikutnya, misalnya setelah jaringan pulih.
          prepared.current = null
          throw err
        }
      }

      // Tanpa `await` apa pun sebelum baris ini di jalur cepat, sehingga popup
      // masih terhitung sebagai hasil ketukan pengguna.
      const result = await ready.signInWithPopup(ready.auth, ready.provider)
      const user = result.user

      if (!user.email) {
        throw new Error(
          'Akun Google tidak menyediakan alamat surel yang sah.',
        )
      }

      const idToken = await user.getIdToken()
      const googleIdToken = ready.credentialFromResult(result)?.idToken

      // Verifikasi token ke server Komite & pasang sesi HTTP-only cookie
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

      // Berhasil: navigasi ke halaman tujuan
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
          'Jendela popup Google diblokir peramban. Ketuk tombolnya sekali lagi, atau izinkan popup untuk situs ini.',
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
