'use client'

/**
 * Batas galat untuk halaman ringkasan (grafik saham).
 *
 * Tanpa berkas ini, satu galat di komponen mana pun — grafik yang menolak
 * datanya, harga live yang datang cacat — menjatuhkan halaman ke layar bawaan
 * Next "This page couldn't load", lengkap dengan sidebar dan navigasinya. Di
 * sini galatnya ditahan di area isi: menu tetap ada, dan pesannya tertulis
 * supaya bisa dilaporkan, bukan sekadar "coba muat ulang".
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { IconAlert } from '@/components/icons'
import { Blank } from '@/components/ui'

export default function RingkasanError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <section className="panel">
      <Blank icon={<IconAlert size={22} />} title="Bagian ini gagal ditampilkan">
        Halaman lain tetap bisa dibuka. Coba lagi, atau kembali ke ringkasan.
      </Blank>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center' }}>
          {error.message || 'Galat tanpa pesan'}
          {error.digest && ` · kode ${error.digest}`}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => retry()}>
            Coba lagi
          </button>
          <Link href="/ringkasan" className="btn">
            Ke ringkasan
          </Link>
        </div>
      </div>
    </section>
  )
}
