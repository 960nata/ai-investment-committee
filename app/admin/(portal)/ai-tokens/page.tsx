import { notFound } from 'next/navigation'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { getAiTokensDashboardData } from '@/lib/ai/telemetry'
import { AiTokensDashboardClient } from '@/components/ai-tokens/ai-tokens-dashboard-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Analisis AI Token & API Keys — Admin AI Investdesk',
  description:
    'Dashboard telemetri dan analisis penggunaan kunci API AI (Gemini, Groq, OpenRouter), batas kuota 429 TooManyRequests, dan grafik ApexCharts.',
}

export default async function AdminAiTokensPage() {
  const isAdmin = await verifyAdminSession()
  if (!isAdmin) {
    notFound()
  }

  // Muatan pertama tetap tampil walau Redis sedang terganggu (dengan penanda
  // "Terganggu"); penyegaran berkala justru menolak angka memori agar tidak
  // menimpa data lengkap yang sudah tampil.
  const initialData = await getAiTokensDashboardData('24h', { allowMemoryFallback: true })

  return <AiTokensDashboardClient initialData={initialData} />
}
