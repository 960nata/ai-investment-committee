'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconClose } from '@/components/icons'

export function AdminLogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    if (!confirm('Akhiri sesi Administrator Komite?')) return
    setLoading(true)

    try {
      await fetch('/api/v1/admin/auth', { method: 'DELETE' })
      router.push('/admin/login')
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="btn btn-quiet"
      style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--halted)' }}
      title="Keluar dari sesi Admin"
    >
      <IconClose size={12} />
      <span>{loading ? 'Keluar...' : 'Keluar'}</span>
    </button>
  )
}
