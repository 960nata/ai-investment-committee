'use client'

import { useEffect } from 'react'
import { getFirebaseAnalytics } from '@/lib/firebase'

/**
 * Komponen inisialisasi Firebase di sisi peramban.
 * Memastikan Firebase App dan Firebase Analytics terpasang saat aplikasi dimuat.
 */
export function FirebaseInit() {
  useEffect(() => {
    getFirebaseAnalytics().catch(() => {})
  }, [])

  return null
}
