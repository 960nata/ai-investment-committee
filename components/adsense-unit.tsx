'use client'

/**
 * Satu unit iklan AdSense manual.
 *
 * Skrip Google dimuat di sini, sekali per halaman, bukan di layout — lihat
 * `lib/ads/adsense.ts` untuk alasannya. `<script>` di dalam
 * `dangerouslySetInnerHTML` tidak pernah dijalankan peramban, jadi kode unit
 * yang ditempel mentah tidak akan pernah tampil; komponen inilah yang
 * menggantikannya.
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { AdsenseUnitConfig } from '@/lib/ads/adsense'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const SCRIPT_ID = 'adsbygoogle-js'

function ensureScript(client: string) {
  if (document.getElementById(SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
  document.head.appendChild(script)
}

/** `style` dari kode AdSense ("display:block") jadi objek gaya React. */
function toStyle(raw: string | undefined): React.CSSProperties {
  const style: Record<string, string> = { display: 'block' }
  for (const part of (raw ?? '').split(';')) {
    const [key, value] = part.split(':').map((s) => s?.trim())
    if (!key || !value) continue
    style[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return style as React.CSSProperties
}

export function AdsenseUnit({ config }: { config: AdsenseUnitConfig }) {
  const pathname = usePathname()
  const ref = useRef<HTMLModElement>(null)

  useEffect(() => {
    const el = ref.current
    // Unit yang sudah diisi Google tidak boleh di-push lagi — AdSense
    // melempar "All ins elements already have ads".
    if (!el || el.getAttribute('data-adsbygoogle-status')) return
    ensureScript(config.client)
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // Pemblokir iklan atau kuota unit: slotnya dibiarkan kosong.
    }
  }, [config.client, pathname])

  return (
    <ins
      // Elemen baru tiap pindah halaman, supaya artikel berikutnya dapat iklan baru.
      key={pathname}
      ref={ref}
      className="adsbygoogle"
      style={toStyle(config.style)}
      data-ad-client={config.client}
      data-ad-slot={config.slot}
      data-ad-format={config.format}
      data-ad-layout={config.layout}
      data-ad-layout-key={config.layoutKey}
      data-full-width-responsive={config.fullWidthResponsive}
    />
  )
}
