'use client'

/**
 * Isi bersama untuk `error.tsx` per halaman.
 *
 * Batas galat dipasang per segmen, bukan sekali di `app/(dashboard)/`, supaya
 * tidak ikut membungkus halaman yang tidak boleh berubah (berita/[slug]). Tiap
 * berkas `error.tsx` cukup meneruskan props-nya ke sini.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { IconAlert } from '@/components/icons'
import { Blank } from '@/components/ui'

export function SegmentError({
  error,
  retry,
  backHref = '/ringkasan',
  backLabel = 'Ke ringkasan',
}: {
  error: Error & { digest?: string }
  retry: () => void
  backHref?: string
  backLabel?: string
}) {
  useEffect(() => {
    console.error('[segment]', error)
  }, [error])

  return (
    <section className="panel">
      <Blank icon={<IconAlert size={22} />} title="Bagian ini gagal ditampilkan">
        Halaman lain tetap bisa dibuka. Coba lagi, atau kembali ke halaman sebelumnya.
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
          <Link href={backHref} className="btn">
            {backLabel}
          </Link>
        </div>
      </div>
    </section>
  )
}
