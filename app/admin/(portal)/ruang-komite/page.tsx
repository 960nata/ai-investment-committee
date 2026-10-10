import { requireAdmin } from '@/lib/auth/admin-auth'
import { getCommitteeRoomSnapshot } from '@/lib/agents/committee-room'
import { CommitteeRoomClient } from '@/components/admin/committee-room-client'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Ruang Komite — Admin AI Investdesk',
  description: 'Sidang komite AI secara langsung: kursi agen, penyedia yang menjawab, dan umpan panggilan model.',
}

export default async function CommitteeRoomPage() {
  await requireAdmin()
  return <CommitteeRoomClient initial={await getCommitteeRoomSnapshot()} />
}
