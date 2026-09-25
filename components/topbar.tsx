'use client'

/**
 * Bar atas.
 *
 * Tiga hal, dan tidak lebih: di mana kita sekarang, seberapa segar datanya, dan
 * satu tindakan yang paling sering dipakai. Bar atas yang ikut memuat pencarian,
 * pemberitahuan, dan menu akun akan jadi tempat pembuangan untuk apa pun yang
 * tidak jelas tempatnya, dan itu yang membuatnya berhenti berguna.
 *
 * Nama pemegang sesi dan tombol keluar ditambahkan belakangan, dan sengaja
 * sebagai label datar plus satu tombol — bukan menu yang bisa tumbuh. Halaman
 * ini hanya bisa dibuka setelah masuk, jadi harus ada satu tempat yang
 * menjawab "saya masuk sebagai siapa" dan satu jalan keluar yang terlihat.
 * Tanpa itu orang mencarinya di seluruh halaman.
 *
 * Judul halaman dibaca dari alamat, bukan dikirim tiap halaman. Satu sumber
 * kebenaran, dan halaman baru cukup menambah satu baris di daftar navigasi.
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconClock, IconPulse, IconMenu, IconLock, IconClose } from './icons'
import { Lamp, type State } from './ui'
import { SECTIONS } from './rail'
import { useSidebar } from './sidebar-context'

const TITLES = new Map(
  SECTIONS.flatMap((s) => s.links).map((l) => [l.href, l.label] as const),
)

export interface TopbarStatus {
  state: State
  /** Contoh: "data per 2026-09-19 · 2 menit lalu". Null berarti belum terukur. */
  summary: string
}

export function Topbar({
  status,
  action,
  isAdmin = false,
  user = null,
}: {
  status: TopbarStatus
  action?: React.ReactNode
  isAdmin?: boolean
  /** Pemegang sesi. Null hanya mungkin terjadi pada sesi admin lewat PIN. */
  user?: { name: string; email: string } | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const title = TITLES.get(pathname) ?? 'Komite'
  const { toggle } = useSidebar()

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // Gagal menghubungi server bukan alasan menahan orang di dalam akunnya.
    }
    router.push('/')
    router.refresh()
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-rail-toggle"
        onClick={toggle}
        aria-label="Buka navigasi rel"
        title="Menu Navigasi"
      >
        <IconMenu size={16} />
      </button>

      <Link href="/" className="topbar-brand">
        <span className="mark-glyph">
          <IconPulse size={14} />
        </span>
        <span className="mark-name">Komite</span>
        <span className="mark-phase">f1</span>
      </Link>

      <span className="topbar-title">{title}</span>

      <span className="topbar-status">
        <Lamp state={status.state} />
        <IconClock size={13} />
        {status.summary}
      </span>

      {isAdmin && (
        <Link
          href="/admin"
          className="btn btn-quiet mono"
          style={{
            padding: '3px 8px',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            borderColor: 'var(--signal)',
            color: 'var(--signal)',
            textDecoration: 'none',
          }}
          title="Buka Dashboard Admin"
        >
          <IconLock size={12} />
          <span>Dashboard Admin</span>
        </Link>
      )}

      {action && <span className="topbar-action">{action}</span>}

      <span className="topbar-session">
        {user && (
          <span className="topbar-user mono" title={user.email}>
            {user.name}
          </span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-quiet mono topbar-logout"
          title="Keluar dari sesi ini"
        >
          <IconClose size={12} />
          <span>Keluar</span>
        </button>
      </span>
    </header>
  )
}
