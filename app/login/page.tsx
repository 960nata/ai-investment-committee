'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  IconPulse,
  IconLock,
  IconArrowRight,
  IconAlert,
  IconGauge,
  IconEye,
  IconEyeOff,
} from '@/components/icons'

/**
 * useSearchParams() memaksa halaman ini keluar dari prarender statis, dan Next
 * menolak build bila bailout-nya tidak dibatasi. Suspense di bawah yang menahan
 * batas itu supaya kerangka halaman tetap terkirim lebih dulu.
 */
export default function UserLoginPage() {
  return (
    <Suspense fallback={null}>
      <UserLoginForm />
    </Suspense>
  )
}

/**
 * Alamat tujuan setelah masuk.
 *
 * Hanya jalur relatif yang diterima. Alamat lengkap dari luar — termasuk yang
 * diawali `//` dan dibaca peramban sebagai host lain — akan mengubah halaman
 * masuk jadi papan loncat ke situs mana pun, dan tautan seperti itu terlihat
 * sah persis sampai detik terakhir.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/ringkasan'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/ringkasan'
  return raw
}

function UserLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleUserSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Surel atau kata sandi salah.')
        setLoading(false)
        return
      }

      router.push(nextPath)
      router.refresh()
    } catch {
      setError('Gagal menghubungi server autentikasi.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      {/* Brand Header */}
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <Link href="/" className="landing-brand" style={{ display: 'inline-flex' }}>
          <span className="mark-glyph">
            <IconPulse size={18} />
          </span>
          <span className="mark-name" style={{ fontSize: '20px' }}>
            Komite
          </span>
        </Link>
        <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '6px' }}>
          PLATFORM ANALISIS PASAR &amp; KONSENSUS AI
        </p>
      </div>

      <div className="auth-card" suppressHydrationWarning>
        {error && (
          <div className="auth-error">
            <IconAlert size={14} style={{ color: 'var(--halted)', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUserSubmit} className="auth-form">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'rgba(79, 157, 142, 0.15)',
                  color: 'var(--accent, #4f9d8e)',
                }}
              >
                <IconGauge size={14} />
              </span>
              <h1 className="auth-title" style={{ margin: 0 }}>
                Masuk ke Terminal
              </h1>
            </div>
            <p className="auth-lead">
              Grafik harga langsung, putusan 4 agen AI, dan katalog 400+ instrumen analisis kuantitatif.
            </p>
          </div>

          <div className="auth-field">
            <label htmlFor="login-email" className="mono auth-label">
              Alamat Surel
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="auth-input"
              placeholder="nama@surel.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label htmlFor="login-password" className="mono auth-label">
                Kata Sandi
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ink-mute)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--mono)',
                  padding: 0,
                }}
              >
                {showPassword ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                <span>{showPassword ? 'Sembunyikan' : 'Lihat'}</span>
              </button>
            </div>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn btn-primary auth-submit"
          >
            <IconGauge size={14} />
            <span>{loading ? 'Memverifikasi...' : 'Masuk ke Terminal'}</span>
            <IconArrowRight size={14} />
          </button>

          <p className="auth-switch">
            Belum punya akun? <Link href="/daftar">Daftar gratis</Link>
          </p>
        </form>

        {/* Pemisah eksplisit untuk akses Administrator */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(250, 134, 42, 0.05)',
            border: '1px solid rgba(250, 134, 42, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--signal)' }}>
              <IconLock size={15} />
            </span>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink)' }}>
                Pengelola atau Redaksi?
              </div>
              <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-mute)' }}>
                Login Administrator terpisah
              </div>
            </div>
          </div>
          <Link
            href="/admin/login"
            className="btn btn-quiet mono"
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderColor: 'rgba(250, 134, 42, 0.4)',
              color: 'var(--signal)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Portal Admin &rarr;
          </Link>
        </div>

        <div className="auth-foot">
          <Link href="/" className="mono">
            &larr; Kembali ke Beranda
          </Link>
          <Link href="/warta" className="mono">
            Baca Warta Terbuka &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
