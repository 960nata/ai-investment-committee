'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/*
 * Widget Cloudflare Turnstile.
 *
 * Skripnya disisipkan lewat `document.createElement`, bukan tag <script> di
 * JSX: CSP situs ini memakai 'strict-dynamic', jadi skrip yang dimuat oleh
 * bundel bernonce ikut dipercaya tanpa perlu mendaftarkan asal Cloudflare di
 * `script-src`.
 *
 * Tanpa `NEXT_PUBLIC_TURNSTILE_SITE_KEY` widget tidak tampil sama sekali, dan
 * server pun melewati pemeriksaannya (lihat `lib/auth/turnstile.ts`).
 */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme: 'auto'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  reset(id: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile tidak termuat'))
    script.onerror = () => {
      loading = null
      reject(new Error('Turnstile tidak termuat'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export interface TurnstileHandle {
  /** Token hanya sekali pakai; panggil ini setelah pengiriman yang gagal. */
  reset(): void
}

export const TurnstileWidget = forwardRef<
  TurnstileHandle,
  { action: string; onToken: (token: string | null) => void }
>(function TurnstileWidget({ action, onToken }, ref) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null)
      if (widgetId.current) window.turnstile?.reset(widgetId.current)
    },
  }))

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false

    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return
        widgetId.current = api.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: 'auto',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))

    return () => {
      cancelled = true
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [action])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={container} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
})
