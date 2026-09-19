'use client'

/**
 * Bar atas.
 *
 * Tiga hal, dan tidak lebih: di mana kita sekarang, seberapa segar datanya, dan
 * satu tindakan yang paling sering dipakai. Bar atas yang ikut memuat pencarian,
 * pemberitahuan, dan menu akun akan jadi tempat pembuangan untuk apa pun yang
 * tidak jelas tempatnya, dan itu yang membuatnya berhenti berguna.
 *
 * Judul halaman dibaca dari alamat, bukan dikirim tiap halaman. Satu sumber
 * kebenaran, dan halaman baru cukup menambah satu baris di daftar navigasi.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconClock, IconPulse } from './icons'
import { Lamp, type State } from './ui'
import { SECTIONS } from './rail'

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
}: {
  status: TopbarStatus
  action?: React.ReactNode
}) {
  const pathname = usePathname()
  const title = TITLES.get(pathname) ?? 'Komite'

  return (
    <header className="topbar">
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

      {action && <span className="topbar-action">{action}</span>}
    </header>
  )
}
