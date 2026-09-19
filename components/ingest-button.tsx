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
import { IconBolt, IconRefresh } from './icons'

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
          `${body.itemsProcessed} simbol · ${body.candlesWritten} candle` +
            (body.quarantined > 0 ? ` · ${body.quarantined} dikarantina` : ''),
        )
        router.refresh()
      } catch (err) {
        setResult(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      {result && (
        <span
          className="mono"
          style={{ fontSize: 'var(--t-small)', color: 'var(--ink-mute)' }}
        >
          {result}
        </span>
      )}
      <button type="button" className="btn btn-signal" onClick={run} disabled={pending}>
        {pending ? (
          <>
            <span className="spin">
              <IconRefresh size={13} />
            </span>
            menarik data
          </>
        ) : (
          <>
            <IconBolt size={13} />
            tarik sekarang
          </>
        )}
      </button>
    </span>
  )
}
