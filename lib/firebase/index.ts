import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'

/**
 * Konfigurasi Firebase SDK (Private / Server-Side).
 * Menggunakan variabel lingkungan rahasia server (tanpa prefix NEXT_PUBLIC_)
 * agar tidak pernah dibocorkan ke bundel browser atau publik.
 */
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
}

/**
 * Inisialisasi Firebase App secara singleton di sisi server.
 */
export const app: FirebaseApp | null =
  firebaseConfig.apiKey
    ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
    : null
