import { db } from '@/lib/db/client'
import { appUser } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { UserSession } from './session'
import { reconcileSession } from './verified-session'

export async function verifyAccountSession(session: UserSession): Promise<UserSession | null> {
  const [account] = await db.select({
    id: appUser.id, email: appUser.email, name: appUser.name, role: appUser.role,
    avatarUrl: appUser.avatarUrl, isActive: appUser.isActive,
  }).from(appUser).where(eq(appUser.id, session.uid)).limit(1)
  return reconcileSession(session, account)
}
