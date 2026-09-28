/**
 * Diagnostik env produksi — hanya ADA/TIDAK ADA, tidak pernah nilainya.
 *
 * Dipakai untuk memastikan deploy yang melayani domain benar-benar membaca
 * variabel yang diset di dashboard Vercel. Nama dan identitas deploy (project,
 * environment, commit) bukan rahasia; nilai variabel tidak pernah dikirim,
 * bahkan panjangnya pun tidak.
 */

import { NextResponse } from 'next/server'
import { NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const CHECKED = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SESSION_SECRET',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_APP_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'GEMINI_API_KEY',
  'CRON_SECRET',
  'QSTASH_TOKEN',
] as const

export async function GET() {
  const present = Object.fromEntries(CHECKED.map((k) => [k, Boolean(process.env[k]?.trim())]))
  return NextResponse.json(
    {
      deploy: {
        environment: process.env.VERCEL_ENV ?? null,
        projectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
        deploymentUrl: process.env.VERCEL_URL ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        repo: process.env.VERCEL_GIT_REPO_SLUG ?? null,
        region: process.env.VERCEL_REGION ?? null,
      },
      present,
    },
    { headers: NO_STORE },
  )
}
