import { redirect } from 'next/navigation'
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
    redirect('/admin/login')
  }

  const initialData = await getAiTokensDashboardData('24h')

  return <AiTokensDashboardClient initialData={initialData} />
}
