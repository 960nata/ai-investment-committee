'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { IconAlert } from '@/components/icons'

export default function KalkulatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[KalkulatorError]', error)
  }, [error])

  return (
    <div className="landing-shell">
      <header className="landing-nav-container" style={{ padding: '16px 24px', borderBottom: '1px solid var(--line)' }}>
        <Link href="/" className="landing-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
          <span style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: 16 }}>AI INVESTDESK</span>
          <span style={{ color: 'var(--ink-mute)', fontSize: 13 }}>/ Kalkulator</span>
        </Link>
      </header>

      <main className="lp calc-lp-main" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lp-inner" style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--down)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <IconAlert size={26} />
          </div>

          <h1 style={{ fontSize: 'var(--t-head)', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
            Kalkulator Belum Bisa Dimuat
          </h1>

          <p style={{ fontSize: 'var(--t-body)', color: 'var(--ink-mute)', margin: '0 0 var(--space-4) 0', lineHeight: 1.6 }}>
            Terjadi kendala sementara saat menyiapkan data kalkulator. Silakan muat ulang halaman ini atau kembali ke beranda.
          </p>

          {error.digest && (
            <p className="mono" style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-faint)', margin: '0 0 var(--space-4) 0' }}>
              Kode rujukan: {error.digest}
            </p>
          )}

          <div style={{ display: 'inline-flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => reset()}
              style={{
                background: 'var(--signal)',
                color: '#000',
                fontWeight: 600,
                padding: '10px 20px',
                borderRadius: 'var(--radius)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Muat Ulang Halaman
            </button>
            <Link
              href="/"
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--line)',
                background: 'var(--surface-1)',
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </main>

      <footer style={{ padding: '24px', textAlign: 'center', borderTop: '1px solid var(--line)', color: 'var(--ink-faint)', fontSize: 'var(--t-micro)' }}>
        © {new Date().getFullYear()} AI Investdesk · Terminal Riset & Probabilitas Pasar
      </footer>
    </div>
  )
}
