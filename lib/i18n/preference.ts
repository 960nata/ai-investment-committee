/**
 * Pilihan bahasa pengunjung, di sisi peramban.
 *
 * Disimpan di localStorage — bukan cookie — karena hanya peramban yang
 * membacanya: halaman dirender dalam Bahasa Indonesia oleh server, lalu
 * penerjemah di peramban menggantinya. Alamat berawalan bahasa (/en/...)
 * menang atas pilihan tersimpan, supaya tautan yang dibagikan selalu terbuka
 * dalam bahasa tautannya.
 */

import { SOURCE_LOCALE, TRANSLATED_LOCALES, isLocale, type Locale } from './locales'

const KEY = 'komite_locale'
export const LOCALE_EVENT = 'komite:locale'

export function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split('/')[1]
  return (TRANSLATED_LOCALES as readonly string[]).includes(first) ? (first as Locale) : null
}

export function readPreference(): Locale {
  try {
    const v = localStorage.getItem(KEY)
    return v && isLocale(v) ? v : SOURCE_LOCALE
  } catch {
    return SOURCE_LOCALE
  }
}

export function writePreference(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // Mode privat atau penyimpanan diblokir: pilihannya tetap berlaku di halaman
    // ini lewat event, hanya tidak diingat di kunjungan berikutnya.
  }
  window.dispatchEvent(new CustomEvent<Locale>(LOCALE_EVENT, { detail: locale }))
}
