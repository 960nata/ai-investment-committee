'use client'

import { useState } from 'react'
import s from '@/components/simulator/simulator.module.css'

export function SimulatorSettingsClient({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    const next = !enabled
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/simulator', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ premiumEnabled: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setEnabled(body.data.premiumEnabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.settings}>
      <div>
        <strong>Akses pengguna Premium: {enabled ? 'TERBUKA' : 'TERTUTUP'}</strong>
        <p>
          {enabled
            ? 'Pengguna Premium aktif melihat menu Simulator Trading dan bisa memakainya dengan dompet $1.000 sendiri. Akun gratis tetap terkunci.'
            : 'Hanya admin yang bisa memakai simulator. Nyalakan untuk membukanya bagi pengguna Premium.'}
        </p>
        {error && <p style={{ color: 'var(--halted)' }}>{error}</p>}
      </div>
      <button type="button" className={`btn ${enabled ? 'btn-danger' : 'btn-primary'}`} disabled={saving} onClick={toggle}>
        {saving ? 'Menyimpan…' : enabled ? 'Tutup untuk Premium' : 'Buka untuk Premium'}
      </button>
    </div>
  )
}
