import { requireAdmin } from '@/lib/auth/admin-auth'
import { getAiTokensDashboardData } from '@/lib/ai/telemetry'
import { ANALIS, STRATEG, RISIKO, KETUA } from '@/lib/agents/roles'
import { AiActivityClient } from '@/components/ai-tokens/ai-activity-client'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Alur & Aktivitas AI — Admin AI Investdesk',
  description: 'Alur provider AI per fitur dan riwayat percobaan API.',
}

export default async function AiActivityPage() {
  await requireAdmin()
  // Muatan pertama tetap tampil walau Redis sedang terganggu (dengan penanda
  // "Terganggu"); penyegaran berkala justru menolak angka memori agar tidak
  // menimpa data lengkap yang sudah tampil.
  const data = await getAiTokensDashboardData('24h', { allowMemoryFallback: true })
  const committee = [ANALIS, STRATEG, RISIKO, KETUA].map((role) => ({
    name: role.title,
    provider: role.provider,
  }))
  return <AiActivityClient initialData={data} committee={committee} />
}
