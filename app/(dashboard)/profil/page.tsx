import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/user-auth'
import { getAppUserByEmail } from '@/lib/db/news-queries'
import { ProfileClient } from '@/components/profile-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Profil Pengguna · AI Investdesk',
  description: 'Kelola foto profil WebP dan identitas analis di platform komite investasi.',
}

export default async function ProfilePage() {
  const session = await requireUser('/profil')
  const user = await getAppUserByEmail(session.email)

  const initialUser = {
    id: user?.id ?? session.uid,
    name: user?.name ?? session.name,
    email: user?.email ?? session.email,
    role: (user?.role ?? session.role) as 'admin' | 'user',
    avatarUrl: user?.avatarUrl ?? session.avatarUrl ?? null,
    createdAt: user?.createdAt?.toISOString() ?? new Date().toISOString(),
    lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
  }

  return <ProfileClient initialUser={initialUser} />
}
