import type { UserSession } from './session'

interface AccountState {
  id: number
  email: string
  name: string
  role: string
  avatarUrl: string | null
  isActive: boolean
}

/** A signed cookie identifies the account; current database state grants access. */
export function reconcileSession(session: UserSession, account: AccountState | undefined): UserSession | null {
  if (!account?.isActive || account.id !== session.uid || account.email !== session.email) return null
  return { ...session, name: account.name, role: account.role === 'admin' ? 'admin' : 'user', avatarUrl: account.avatarUrl }
}
