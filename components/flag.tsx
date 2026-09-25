import type { LocaleInfo } from '@/lib/i18n/locales'

/**
 * Bendera negara yang digambar murni dengan CSS — gradien dan clip-path, tanpa
 * emoji dan tanpa berkas ikon. Emoji bendera tidak tampil di Windows (yang
 * muncul dua huruf kode negara), dan berkas ikon berarti satu permintaan lagi
 * per bendera.
 *
 * Bendera ini penanda bahasa, bukan pernyataan kebangsaan; karena itu
 * dekoratif bagi pembaca layar, dan nama bahasanya selalu ditulis di sebelahnya.
 */
export function Flag({ code, size = 20 }: { code: LocaleInfo['flag']; size?: number }) {
  return (
    <span
      className={`flag flag-${code}`}
      style={{ '--flag-w': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    />
  )
}
