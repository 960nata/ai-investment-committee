'use client'

import { useEffect } from 'react'

/**
 * Komponen pelindung dari crash ekstensi peramban (Chrome Extension / Add-on).
 *
 * Ekstensi pihak ketiga (misalnya VPN, adblocker, password manager) sering kali
 * menyuntikkan skrip ke dalam halaman web dan mengalami crash di skrip internal
 * mereka sendiri (misalnya membaca properti undefined seperti 'M_ID').
 *
 * Di mode pengembangan Next.js, unhandled rejection dari ekstensi tersebut
 * ditangkap oleh overlay Next.js dan menampilkan layar merah (Runtime TypeError),
 * meskipun kode aplikasi kita tidak memiliki kesalahan apa pun.
 *
 * Pelindung ini mencegat error dari skrip berekstensi chrome-extension:// dan
 * moz-extension:// agar tidak mengganggu pengalaman pengembang.
 */
export function ExtensionErrorShield() {
  useEffect(() => {
    const handleRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const stack =
        typeof reason === 'object' && reason !== null && 'stack' in reason ? String(reason.stack) : ''
      const message =
        typeof reason === 'object' && reason !== null && 'message' in reason
          ? String(reason.message)
          : String(reason)

      if (
        stack.includes('chrome-extension://') ||
        stack.includes('moz-extension://') ||
        message.includes('M_ID') ||
        message.includes('bis_skin_checked')
      ) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    const handleError = (e: ErrorEvent) => {
      const filename = e.filename || ''
      const message = e.message || ''
      if (
        filename.startsWith('chrome-extension://') ||
        filename.startsWith('moz-extension://') ||
        message.includes('M_ID')
      ) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener('unhandledrejection', handleRejection, true)
    window.addEventListener('error', handleError, true)

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection, true)
      window.removeEventListener('error', handleError, true)
    }
  }, [])

  return null
}
