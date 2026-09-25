'use client'

/**
 * Pendaftaran akun.
 *
 * Syarat kata sandi diperiksa di peramban lebih dulu supaya orang tahu apa yang
 * kurang sebelum menekan tombol, tetapi pemeriksaan yang sebenarnya tetap ada di
 * server. Yang di sini soal kesopanan antarmuka; yang di sana soal keamanan.
 */

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  IconPulse,
  IconArrowRight,
  IconAlert,
  IconGauge,
  IconCheck,
} from '@/components/icons'

export default function DaftarPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}

/** Lihat catatan yang sama di `app/login/page.tsx`. */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/ringkasan'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/ringkasan'
  return raw
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Daftar syarat yang sama persis dengan yang diberlakukan server.
  const rules = useMemo(
    () => [
      { label: 'Minimal 8 karakter', met: password.length >= 8 },
      { label: 'Memuat huruf', met: /[a-zA-Z]/.test(password) },
      { label: 'Memuat angka', met: /[0-9]/.test(password) },
    ],
    [password],
  )

  const passwordOk = rules.every((rule) => rule.met)
  const canSubmit = name.trim().length >= 2 && email.includes('@') && passwordOk && !loading

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Pendaftaran gagal.')
        setLoading(false)
        return
      }

      // Pendaftaran yang berhasil sudah memasang sesi, jadi tidak perlu
      // menyuruh orang mengetik ulang kredensial yang baru saja mereka buat.
      router.push(nextPath)
      router.refresh()
    } catch {
      setError('Gagal menghubungi server pendaftaran.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
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

      <div className="auth-card" suppressHydrationWarning>
        {error && (
          <div className="auth-error">
            <IconAlert size={14} style={{ color: 'var(--halted)', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div>
            <h1 className="auth-title">Buat Akun Komite</h1>
            <p className="auth-lead">
              Gratis, tanpa kartu kredit. Sekali daftar, seluruh terminal terbuka: grafik harga,
              putusan empat agen AI, katalog instrumen, dan laboratorium backtest.
            </p>
          </div>

          <div className="auth-field">
            <label htmlFor="register-name" className="mono auth-label">
              Nama Panggilan
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              className="auth-input"
              placeholder="Nama yang ingin ditampilkan"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="register-email" className="mono auth-label">
              Alamat Surel
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              className="auth-input"
              placeholder="nama@surel.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="register-password" className="mono auth-label">
              Kata Sandi
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <ul className="auth-rules">
              {rules.map((rule) => (
                <li key={rule.label} data-met={rule.met}>
                  <IconCheck size={12} />
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" disabled={!canSubmit} className="btn btn-primary auth-submit">
            <IconGauge size={14} />
            <span>{loading ? 'Membuat akun...' : 'Daftar & Buka Terminal'}</span>
            <IconArrowRight size={14} />
          </button>

          <p className="auth-switch">
            Sudah punya akun? <Link href="/login">Masuk di sini</Link>
          </p>
        </form>

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
