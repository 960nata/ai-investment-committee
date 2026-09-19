'use client'

/**
 * Pemicu ingest manual — alat pengembangan.
 *
 * Endpoint yang dipanggil tertutup di produksi. Di sana data hanya masuk lewat
 * dispatcher cron dan QStash, karena jalur itulah yang punya retry, pencatatan
 * batch, dan verifikasi tanda tangan. Tombol ini ada supaya seluruh rantai bisa
 * dicoba di mesin sendiri tanpa menunggu jam berikutnya.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function IngestButton({ job }: { job: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function run() {
    setResult(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/jobs/${job}?market=CRYPTO`)
        const body = await response.json()

        if (!response.ok) {
          setResult(body.error ?? `HTTP ${response.status}`)
          return
        }

        setResult(
          `${body.itemsProcessed} simbol, ${body.candlesWritten} candle` +
            (body.quarantined > 0 ? `, ${body.quarantined} dikarantina` : ''),
        )
        router.refresh()
      } catch (err) {
        setResult(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {result && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{result}</span>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={run}
        disabled={pending}
        style={{ fontSize: 12 }}
      >
        {pending ? (
          <>
            <span className="loading-spinner" />
            Memuat…
          </>
        ) : (
          'Ingest sekarang'
        )}
      </button>
    </div>
  )
}
