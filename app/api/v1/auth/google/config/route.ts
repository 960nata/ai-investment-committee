import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Menyediakan konfigurasi Firebase publik untuk inisialisasi Google Auth di browser.
 * Hanya mengekspos identifier publik (apiKey, authDomain, projectId, appId)
 * yang memang dirancang untuk klien web browser.
 */
export async function GET() {
  const apiKey =
    process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''
  const authDomain =
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    ''
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''
  const appId =
    process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ''

  if (!apiKey || !projectId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Kredensial Firebase belum disetel di variabel lingkungan server (.env).',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    config: {
      apiKey,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      projectId,
      appId,
    },
  })
}
