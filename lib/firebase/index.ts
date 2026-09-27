import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

/**
 * Konfigurasi Firebase Web SDK.
 * Murni dibaca dari variabel lingkungan (NEXT_PUBLIC_FIREBASE_*).
 * Jangan menaruh kunci atau rahasia mentah di dalam file kode.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
}

/**
 * Inisialisasi Firebase App secara singleton.
 * Hanya diinisialisasi jika API key tersedia di lingkungan.
 */
export const app: FirebaseApp | null =
  firebaseConfig.apiKey
    ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
    : null

/**
 * Instans Analytics (hanya tersedia di browser / client-side).
 */
export let analytics: Analytics | null = null

/**
 * Helper asynchronous untuk mengambil instans Analytics setelah diverifikasi
 * bahwa lingkungan peramban mendukung Firebase Analytics.
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined' || !app) return null
  if (analytics) return analytics

  try {
    const supported = await isSupported()
    if (supported) {
      analytics = getAnalytics(app)
    }
  } catch (err) {
    console.warn('Firebase Analytics tidak didukung di lingkungan ini:', err)
  }

  return analytics
}

// Inisialisasi otomatis di sisi klien jika peramban mendukung
if (typeof window !== 'undefined') {
  getFirebaseAnalytics().catch(() => {})
}
