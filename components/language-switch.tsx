import Link from 'next/link'
import { Flag } from '@/components/flag'
import { LOCALE_INFO, localePath, type Locale } from '@/lib/i18n/locales'

/**
 * Pemilih bahasa: bendera CSS plus nama bahasa dalam bahasanya sendiri.
 *
 * Hanya bahasa yang benar-benar tersedia yang ditampilkan. Tautan ke versi
 * yang belum ditulis akan berakhir di halaman 404, dan itu lebih buruk daripada
 * tidak menawarkannya.
 */
export function LanguageSwitch({
  current,
  path,
  available,
  label = 'Bahasa',
}: {
  current: Locale
  /** Alamat halaman tanpa awalan bahasa, misalnya "/warta/judul-artikel". */
  path: string
  available: readonly Locale[]
  label?: string
}) {
  return (
    <nav className="lang-switch" aria-label={label}>
      {available.map((l) => (
        <Link
          key={l}
          href={localePath(l, path)}
          hrefLang={LOCALE_INFO[l].htmlLang}
          lang={LOCALE_INFO[l].htmlLang}
          aria-current={l === current ? 'true' : undefined}
        >
          <Flag code={LOCALE_INFO[l].flag} size={20} />
          {LOCALE_INFO[l].native}
        </Link>
      ))}
    </nav>
  )
}
