/**
 * Halaman 404.
 *
 * Sengaja dirender saat permintaan datang, bukan dibuat saat build. Nonce CSP
 * hanya bisa disuntikkan ke halaman yang dirender per permintaan; halaman yang
 * sudah jadi sejak build tidak punya nonce, sehingga skripnya akan diblokir
 * kebijakan keamanan dan navigasi dari sini berhenti bekerja.
 *
 * Isinya juga tidak memberi tahu apa pun tentang jalur yang dicari. Halaman 404
 * yang membedakan "tidak ada" dari "ada tapi tidak boleh diakses" adalah cara
 * termurah memetakan bagian dalam sebuah aplikasi.
 */

import Link from 'next/link'
import { connection } from 'next/server'
import { IconArrowRight } from '@/components/icons'

export const metadata = { title: 'Tidak ditemukan' }

export default async function NotFound() {
  await connection()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-5)',
      }}
    >
      <div style={{ maxWidth: 400 }}>
        <p className="eyebrow">Galat 404</p>
        <h1 className="headline" style={{ marginTop: 'var(--space-2)' }}>
          Tidak ditemukan
        </h1>
        <p className="standfirst" style={{ fontSize: 'var(--t-body)' }}>
          Alamat yang kamu buka tidak ada di sini.
        </p>
        <Link href="/" className="btn" style={{ marginTop: 'var(--space-4)' }}>
          kembali ke ringkasan
          <IconArrowRight size={13} />
        </Link>
      </div>
    </div>
  )
}
