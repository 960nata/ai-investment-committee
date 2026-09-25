'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconLock,
  IconArrowRight,
  IconAlert,
  IconShield,
  IconUser,
  IconEye,
  IconEyeOff,
  IconPulse,
} from '@/components/icons'

type AdminAuthMethod = 'pin' | 'account'

export default function AdminLoginPage() {
  const router = useRouter()
  const [method, setMethod] = useState<AdminAuthMethod>('pin')

  // State untuk PIN / Kunci Akses
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  // State untuk Akun Administrator
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [isUserAccountNotice, setIsUserAccountNotice] = useState(false)
  const [loading, setLoading] = useState(false)

  function switchMethod(nextMethod: AdminAuthMethod) {
    setMethod(nextMethod)
    setError(null)
    setIsUserAccountNotice(false)
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsUserAccountNotice(false)
    setLoading(true)

    try {
      const res = await fetch('/api/v1/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'PIN otorisasi administrator tidak valid.')
        setLoading(false)
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Gagal menghubungi server autentikasi.')
      setLoading(false)
    }
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsUserAccountNotice(false)
    setLoading(true)

    try {
      const res = await fetch('/api/v1/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        if (data.isUserAccount) {
          setIsUserAccountNotice(true)
        }
        setError(data.error || 'Surel atau kata sandi administrator salah.')
        setLoading(false)
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Gagal menghubungi server autentikasi.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0705',
        backgroundImage:
          'radial-gradient(circle at 50% 15%, rgba(250, 134, 42, 0.08) 0%, transparent 65%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      {/* Brand Header */}
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <Link href="/" className="landing-brand" style={{ display: 'inline-flex' }}>
          <span className="mark-glyph" style={{ background: 'rgba(250, 134, 42, 0.2)', borderColor: 'rgba(250, 134, 42, 0.5)' }}>
            <IconPulse size={18} style={{ color: 'var(--signal)' }} />
          </span>
          <span className="mark-name" style={{ fontSize: '20px' }}>
            Komite
          </span>
        </Link>
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span
            className="mono"
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--signal)',
              background: 'rgba(250, 134, 42, 0.12)',
              border: '1px solid rgba(250, 134, 42, 0.3)',
              padding: '2px 8px',
              borderRadius: '3px',
              textTransform: 'uppercase',
            }}
          >
            Pusat Kendali Otorisasi
          </span>
        </div>
      </div>

      {/* Main Admin Auth Card */}
      <div
        className="auth-card"
        style={{
          maxWidth: '420px',
          border: '1px solid rgba(250, 134, 42, 0.35)',
          background: 'rgba(18, 13, 10, 0.95)',
          boxShadow: '0 16px 50px rgba(0, 0, 0, 0.7), 0 0 25px rgba(250, 134, 42, 0.12)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: 'rgba(250, 134, 42, 0.12)',
              border: '1px solid rgba(250, 134, 42, 0.4)',
              color: 'var(--signal)',
              marginBottom: '10px',
              boxShadow: '0 0 16px rgba(250, 134, 42, 0.25)',
            }}
          >
            <IconLock size={20} />
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#ffffff' }}>
            Portal Administrator
          </h1>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
            RESTRICTED ACCESS · KHUSUS PENGELOLA &amp; REDAKSI
          </p>
        </div>

        {/* Method Switcher: Kunci Akses vs Akun Admin */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '3px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '18px',
          }}
        >
          <button
            type="button"
            className="mono"
            onClick={() => switchMethod('pin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: method === 'pin' ? 'rgba(250, 134, 42, 0.2)' : 'transparent',
              color: method === 'pin' ? '#ffffff' : 'var(--ink-mute)',
              border: method === 'pin' ? '1px solid rgba(250, 134, 42, 0.5)' : '1px solid transparent',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconShield size={12} />
            <span>Kunci Akses / PIN</span>
          </button>

          <button
            type="button"
            className="mono"
            onClick={() => switchMethod('account')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: method === 'account' ? 'rgba(250, 134, 42, 0.2)' : 'transparent',
              color: method === 'account' ? '#ffffff' : 'var(--ink-mute)',
              border: method === 'account' ? '1px solid rgba(250, 134, 42, 0.5)' : '1px solid transparent',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconUser size={12} />
            <span>Akun Admin</span>
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px 12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#fca5a5' }}>
              <IconAlert size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{ lineHeight: 1.5 }}>{error}</span>
            </div>

            {isUserAccountNotice && (
              <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed rgba(239, 68, 68, 0.25)' }}>
                <Link
                  href="/login"
                  className="btn btn-quiet mono"
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    color: '#ffffff',
                    background: 'rgba(239, 68, 68, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Buka Login Pengguna &rarr;</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Form Mode 1: Kunci Akses PIN */}
        {method === 'pin' && (
          <form onSubmit={handlePinSubmit} className="auth-form">
            <div className="auth-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="admin-pin" className="mono auth-label">
                  PIN / Kunci Akses Rahasia Admin
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
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
                  {showPin ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                  <span>{showPin ? 'Sembunyikan' : 'Lihat'}</span>
                </button>
              </div>
              <input
                id="admin-pin"
                type={showPin ? 'text' : 'password'}
                autoComplete="off"
                className="auth-input mono"
                placeholder="Masukkan PIN Master Admin..."
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                autoFocus
                style={{ borderColor: 'rgba(250, 134, 42, 0.3)' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !pin}
              className="btn btn-primary auth-submit"
              style={{
                background: 'var(--signal)',
                color: '#000000',
                boxShadow: '0 4px 14px rgba(250, 134, 42, 0.35)',
              }}
            >
              <IconLock size={14} />
              <span>{loading ? 'Memverifikasi...' : 'Buka Akses Admin'}</span>
              <IconArrowRight size={14} />
            </button>

            {process.env.NODE_ENV !== 'production' && (
              <div className="auth-demo-hint" style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
                <span className="mono" style={{ fontSize: '11px' }}>
                  PIN Demo: <code style={{ color: 'var(--signal)' }}>komite-admin-2026</code>
                </span>
                <button
                  type="button"
                  className="btn btn-quiet mono"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={() => setPin('komite-admin-2026')}
                >
                  Gunakan
                </button>
              </div>
            )}
          </form>
        )}

        {/* Form Mode 2: Akun Administrator */}
        {method === 'account' && (
          <form onSubmit={handleAccountSubmit} className="auth-form">
            <div className="auth-field">
              <label htmlFor="admin-email" className="mono auth-label">
                Alamat Surel Administrator
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                className="auth-input"
                placeholder="admin@komite.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="admin-password" className="mono auth-label">
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
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn btn-primary auth-submit"
              style={{
                background: 'var(--signal)',
                color: '#000000',
                boxShadow: '0 4px 14px rgba(250, 134, 42, 0.35)',
              }}
            >
              <IconShield size={14} />
              <span>{loading ? 'Memverifikasi...' : 'Masuk sebagai Administrator'}</span>
              <IconArrowRight size={14} />
            </button>
          </form>
        )}

        {/* Pemisah eksplisit untuk Pengguna Biasa */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink)' }}>
              Bukan Administrator?
            </div>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-mute)' }}>
              Masuk ke Terminal Analisis Pasar
            </div>
          </div>
          <Link
            href="/login"
            className="btn btn-quiet mono"
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              color: 'var(--ink)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Login Pengguna &rarr;
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
