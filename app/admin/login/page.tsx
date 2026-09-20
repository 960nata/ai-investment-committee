'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IconPulse, IconLock, IconArrowRight, IconAlert } from '@/components/icons'

export default function AdminLoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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
        setError(data.error || 'PIN otorisasi tidak valid.')
        setLoading(false)
        return
      }

      // Berhasil login, arahkan ke dashboard admin
      router.push('/admin')
      router.refresh()
    } catch (err) {
      setError('Gagal menghubungi server autentikasi.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--surface-0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="admin-card"
        style={{
          width: '100%',
          maxWidth: '400px',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              color: 'var(--signal)',
              marginBottom: '12px',
            }}
          >
            <IconLock size={20} />
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px' }}>
            Portal Otorisasi Komite
          </h1>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
            RESTRICTED ACCESS · ADMINISTRATOR ONLY
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
              marginBottom: '16px',
            }}
          >
            <IconAlert size={14} style={{ color: 'var(--halted)', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="pin-input"
              className="mono"
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--ink-soft)',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              PIN / Kunci Akses Rahasia:
            </label>
            <input
              id="pin-input"
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
              fontFamily: 'var(--mono)',
              fontSize: '13px',
              justifyContent: 'center',
            }}
          >
            {loading ? 'Memverifikasi...' : 'Buka Akses Admin'}
            <IconArrowRight size={14} />
          </button>
        </form>

        {/* Demo Credentials Info Box */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px',
            background: 'var(--surface-0)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
          }}
        >
          <div className="mono bold" style={{ color: 'var(--amber)', marginBottom: '8px' }}>
            KREDENSIAL DEMO SISTEM:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ color: 'var(--ink)' }}>1. Akun Administrator</strong>
                <div className="mono" style={{ color: 'var(--ink-mute)', fontSize: '10px' }}>
                  Kunci: <code style={{ color: 'var(--signal)' }}>komite-admin-2026</code>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-quiet mono"
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => setPin('komite-admin-2026')}
              >
                Gunakan Kunci Ini
              </button>
            </div>

            <div
              style={{
                paddingTop: '8px',
                borderTop: '1px dashed var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong style={{ color: 'var(--ink)' }}>2. User Biasa / Analis</strong>
                <div className="mono" style={{ color: 'var(--ink-mute)', fontSize: '10px' }}>
                  Akses publik tanpa PIN (Read-Only)
                </div>
              </div>
              <Link
                href="/ringkasan"
                className="btn btn-quiet mono"
                style={{ fontSize: '10px', padding: '3px 8px', textDecoration: 'none' }}
              >
                Buka Terminal &rarr;
              </Link>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '16px',
            paddingTop: '12px',
            textAlign: 'center',
          }}
        >
          <Link
            href="/"
            className="mono"
            style={{ fontSize: '11px', color: 'var(--ink-faint)', textDecoration: 'none' }}
          >
            &larr; Kembali ke Beranda Publik
          </Link>
        </div>
      </div>
    </div>
  )
}
