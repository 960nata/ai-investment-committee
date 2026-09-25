'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Flag } from '@/components/flag'
import {
  LOCALES,
  LOCALE_INFO,
  SOURCE_LOCALE,
  localePath,
  type Locale,
} from '@/lib/i18n/locales'
import { LOCALE_EVENT, localeFromPath, readPreference, writePreference } from '@/lib/i18n/preference'

/*
 * Pemilih bahasa di header.
 *
 * Memilih bahasa menerjemahkan seluruh situs, bukan hanya halaman ini:
 * pilihannya disimpan, dan penerjemah halaman (SiteTranslator) menerapkannya
 * di setiap halaman yang dibuka sesudahnya — teks statis maupun isi dari basis
 * data.
 *
 * Halaman yang punya versi bahasa sendiri dari server (warta, panduan) dibuka
 * lewat alamat berawalannya, karena versi itu ditulis utuh oleh agen dan
 * terindeks mesin pencari. Halaman lain diterjemahkan di tempat.
 */

/** Pisahkan awalan bahasa dari alamat: "/en/warta/x" → "/warta/x". */
function basePathOf(pathname: string): string {
  const prefix = localeFromPath(pathname)
  if (!prefix) return pathname
  return pathname.slice(prefix.length + 1) || '/'
}

function hasNativeVersion(path: string): boolean {
  return path === '/panduan' || path === '/warta' || path.startsWith('/warta/')
}

const TITLE: Record<Locale, string> = {
  id: 'Pilih bahasa',
  en: 'Choose language',
  zh: '选择语言',
  ja: '言語を選択',
  ru: 'Выберите язык',
}

export function LanguageMenu({
  available,
  variant = 'header',
  onNavigate,
}: {
  /** Bahasa yang punya versi server untuk halaman ini (artikel warta). */
  available?: readonly Locale[]
  variant?: 'header' | 'drawer'
  onNavigate?: () => void
}) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const basePath = basePathOf(pathname)
  const [current, setCurrent] = useState<Locale>(SOURCE_LOCALE)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    const sync = () => setCurrent(localeFromPath(window.location.pathname) ?? readPreference())
    const frame = requestAnimationFrame(sync)
    const onChange = (e: Event) => setCurrent((e as CustomEvent<Locale>).detail)
    window.addEventListener(LOCALE_EVENT, onChange)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener(LOCALE_EVENT, onChange)
    }
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (l: Locale) => {
    setOpen(false)
    onNavigate?.()
    writePreference(l)
    setCurrent(l)

    // Versi server lebih baik daripada terjemahan di tempat: pindah ke sana bila
    // ada. Artikel yang belum ditulis dalam bahasa itu tetap di alamatnya dan
    // diterjemahkan di tempat.
    const native = hasNativeVersion(basePath) && (!available || available.includes(l))
    const target = native ? localePath(l, basePath) : localePath(SOURCE_LOCALE, basePath)
    if (target !== pathname) router.push(target)
  }

  const items = LOCALES.map((l) => (
    <button
      key={l}
      type="button"
      className={`lang-item-btn${l === current ? ' is-active' : ''}`}
      lang={LOCALE_INFO[l].htmlLang}
      aria-current={l === current ? 'true' : undefined}
      onClick={() => choose(l)}
      translate="no"
    >
      <Flag code={LOCALE_INFO[l].flag} size={variant === 'drawer' ? 22 : 20} />
      <span className="lang-menu-native">{LOCALE_INFO[l].native}</span>
      {l === SOURCE_LOCALE && <span className="lang-menu-tag">Asli</span>}
      <span className="lang-menu-tick" aria-hidden="true">
        {l === current ? '✓' : ''}
      </span>
    </button>
  ))

  if (variant === 'drawer') {
    return (
      <div className="lang-drawer" role="group" aria-label={TITLE[current]} translate="no">
        {items}
      </div>
    )
  }

  return (
    <div className="lang-menu" ref={root} translate="no">
      <button
        type="button"
        className={`lang-menu-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${TITLE[current]}: ${LOCALE_INFO[current].native}`}
        onClick={() => setOpen((o) => !o)}
        title="Terjemahkan Halaman / Translate Page"
      >
        <span className="lang-menu-globe" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </span>
        <Flag code={LOCALE_INFO[current].flag} size={18} />
        <span className="lang-menu-label">{LOCALE_INFO[current].native}</span>
        <span className="lang-menu-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="lang-menu-pop" id={menuId}>
          <div className="lang-menu-pop-header">
            <p className="lang-menu-title">{TITLE[current]}</p>
            <p className="lang-menu-subtitle">Terjemahan antarmuka & warta</p>
          </div>
          <div className="lang-menu-list">{items}</div>
        </div>
      )}
    </div>
  )
}
