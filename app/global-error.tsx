'use client'

/**
 * Jaring terakhir: hanya aktif bila root layout sendiri gagal dirender.
 *
 * Halaman normal tidak pernah melewati berkas ini, jadi tampilan halaman mana
 * pun (termasuk berita/[slug]) tidak berubah. Berkas ini menggantikan seluruh
 * dokumen dan tidak memuat globals.css, karena itu gayanya ditulis di tempat.
 */

import { useEffect } from 'react'

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[global]', error)
  }, [error])

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: '#0b0d10',
          color: '#e6e8eb',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <title>Terjadi galat</title>
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Situs gagal dimuat</h1>
          <p style={{ margin: '0 0 16px', color: '#9aa1a9', lineHeight: 1.5 }}>
            Ada galat di kerangka halaman. Coba lagi beberapa saat lagi.
          </p>
          {error.digest && (
            <p style={{ margin: '0 0 16px', fontSize: 11, color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
              kode {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #2a2f36', background: '#161a1f', color: 'inherit', cursor: 'pointer' }}
            >
              Coba lagi
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root layout sedang rusak, navigasi klien tidak bisa diandalkan */}
            <a href="/" style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #2a2f36', color: 'inherit', textDecoration: 'none' }}>
              Ke beranda
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
