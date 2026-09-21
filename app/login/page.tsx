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
  IconCheck,
} from '@/components/icons'

/**
 * useSearchParams() memaksa halaman ini keluar dari prarender statis, dan Next
 * menolak build bila bailout-nya tidak dibatasi. Suspense di bawah yang menahan
 * batas itu supaya kerangka halaman tetap terkirim lebih dulu.
 */
export default function UnifiedLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('mode') === 'admin' ? 'admin' : 'user'

  const [activeTab, setActiveTab] = useState<'user' | 'admin'>(defaultTab)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/v1/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'PIN otorisasi admin tidak valid.')
        setLoading(false)
        return
      }

      // Berhasil otorisasi admin, arahkan ke dashboard admin
      router.push('/admin')
      router.refresh()
    } catch {
      setError('Gagal menghubungi server autentikasi.')
      setLoading(false)
    }
  }

  return (
    <div
      suppressHydrationWarning
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--surface-0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
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
          PLATFORM ANALISIS PASAR &amp; PUSAT KENDALI
        </p>
      </div>

      {/* Main Login Card */}
      <div
        className="admin-card"
        suppressHydrationWarning
        style={{
          width: '100%',
          maxWidth: '440px',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          padding: '24px',
        }}
      >
        {/* Tab Selector: Pengguna vs Admin */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            background: 'var(--surface-0)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            marginBottom: '20px',
          }}
        >
          <button
            type="button"
            className="mono"
            onClick={() => {
              setActiveTab('user')
              setError(null)
            }}
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: activeTab === 'user' ? 'var(--surface-2)' : 'transparent',
              color: activeTab === 'user' ? 'var(--ink)' : 'var(--ink-mute)',
              border: activeTab === 'user' ? '1px solid var(--line-strong)' : '1px solid transparent',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <IconGauge size={13} />
            <span>Pengguna</span>
          </button>

          <button
            type="button"
            className="mono"
            onClick={() => {
              setActiveTab('admin')
              setError(null)
            }}
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: activeTab === 'admin' ? 'var(--surface-2)' : 'transparent',
              color: activeTab === 'admin' ? 'var(--signal)' : 'var(--ink-mute)',
              border: activeTab === 'admin' ? '1px solid var(--line-strong)' : '1px solid transparent',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <IconLock size={13} />
            <span>Administrator</span>
          </button>
        </div>

        {/* Tab 1: Pengguna / User Biasa */}
        {activeTab === 'user' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: 'var(--ink)' }}>
                Terminal Pasar &amp; Analisis AI
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
                Akses langsung ke seluruh grafik harga, rekomendasi 4 AI, dan data 400+ instrumen saham IDX, kripto, dan emas tanpa perlu kata sandi.
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '11px',
                color: 'var(--ink-soft)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconCheck size={13} style={{ color: 'var(--green)' }} />
                <span>Ringkasan &amp; Deliberasi 4 AI Terbuka</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconCheck size={13} style={{ color: 'var(--green)' }} />
                <span>Katalog Kripto, Saham IDX, Emas &amp; Komoditas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconCheck size={13} style={{ color: 'var(--green)' }} />
                <span>Warta Intelijen Pasar Makro &amp; Analisis Berita</span>
              </div>
            </div>

            <Link
              href="/ringkasan"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: '13px',
                textDecoration: 'none',
              }}
            >
              <IconGauge size={14} />
              <span>Buka Terminal Pasar</span>
              <IconArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Tab 2: Administrator */}
        {activeTab === 'admin' && (
          <form onSubmit={handleAdminSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: 'var(--signal)' }}>
                Portal Administrator
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
                Akses kendali khusus untuk menulis dan mengedit warta berita, mengunggah gambar, serta konfigurasi slot iklan.
              </p>
            </div>

            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'var(--halted-dim)',
                  border: '1px solid var(--halted)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              >
                <IconAlert size={14} style={{ color: 'var(--halted)', flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-pin-input"
                className="mono"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--ink-soft)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                }}
              >
                PIN / Kunci Akses Admin:
              </label>
              <input
                id="admin-pin-input"
                type="password"
                className="mono"
                placeholder="Masukkan PIN Admin..."
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--surface-0)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !pin}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: '13px',
                background: 'var(--signal)',
                color: '#000',
                fontWeight: 600,
              }}
            >
              <IconLock size={14} />
              <span>{loading ? 'Memverifikasi...' : 'Masuk sebagai Admin'}</span>
              <IconArrowRight size={14} />
            </button>

            {/* Quick Demo Credential Helper */}
            <div
              style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div className="mono">
                <span style={{ color: 'var(--ink-mute)' }}>PIN Demo: </span>
                <code style={{ color: 'var(--signal)' }}>komite-admin-2026</code>
              </div>
              <button
                type="button"
                className="btn btn-quiet mono"
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => setPin('komite-admin-2026')}
              >
                Gunakan PIN Ini
              </button>
            </div>
          </form>
        )}

        {/* Back Link */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)', textAlign: 'center' }}>
          <Link
            href="/"
            className="mono"
            style={{ fontSize: '11px', color: 'var(--ink-faint)', textDecoration: 'none' }}
          >
            &larr; Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
