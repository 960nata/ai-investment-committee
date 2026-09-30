/**
 * Google AdSense — hanya unit iklan manual, tanpa Auto ads.
 *
 * Skrip `adsbygoogle.js` sengaja tidak dipasang di layout. Begitu skrip itu
 * ada di sebuah halaman, Google bebas menyelipkan iklan otomatis di mana saja
 * — termasuk beranda dan terminal dasbor. Di sini skripnya baru dimuat oleh
 * `AdsenseUnit`, yang hanya dirender di slot iklan yang disiapkan admin. Jadi
 * halaman tanpa slot tidak pernah memuat skrip Google sama sekali.
 */

/** Id penerbit. Bukan rahasia: tercetak di setiap halaman yang memuat iklan. */
export const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() || 'ca-pub-2633810911223281'

export interface AdsenseUnitConfig {
  client: string
  slot: string
  format?: string
  layout?: string
  layoutKey?: string
  fullWidthResponsive?: string
  style?: string
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match?.[1]?.trim() || undefined
}

/**
 * Baca kode unit iklan yang ditempel admin dari dasbor AdSense.
 *
 * Yang dicari hanya tag `<ins class="adsbygoogle">` beserta `data-ad-slot`-nya.
 * Kode tanpa `data-ad-slot` — misalnya cuma tag `<script>` Auto ads — sengaja
 * ditolak: memuatnya sama dengan menyalakan iklan otomatis di halaman itu.
 */
export function parseAdsenseSnippet(html: string | null | undefined): AdsenseUnitConfig | null {
  if (!html || !/adsbygoogle/i.test(html)) return null
  const ins = html.match(/<ins\b[^>]*>/i)?.[0]
  if (!ins) return null

  const slot = attr(ins, 'data-ad-slot')
  if (!slot) return null

  return {
    client: attr(ins, 'data-ad-client') ?? ADSENSE_CLIENT,
    slot,
    format: attr(ins, 'data-ad-format'),
    layout: attr(ins, 'data-ad-layout'),
    layoutKey: attr(ins, 'data-ad-layout-key'),
    fullWidthResponsive: attr(ins, 'data-full-width-responsive'),
    style: attr(ins, 'style'),
  }
}

/** Kode yang menyebut AdSense tetapi bukan unit manual (mis. skrip Auto ads). */
export function isAdsenseWithoutUnit(html: string | null | undefined): boolean {
  return !!html && /adsbygoogle/i.test(html) && parseAdsenseSnippet(html) === null
}
