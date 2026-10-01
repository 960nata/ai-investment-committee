import type { NotificationItem } from './types'

const STORAGE_KEY = 'komite_notifications_read_v2'
const READ_ALL_TIME_KEY = 'komite_notifications_read_all_time_v2'
export const NOTIFICATIONS_UPDATED_EVENT = 'komite:notifications-updated'

export function getReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function getLastMarkAllReadTime(): number {
  if (typeof window === 'undefined') return 0
  try {
    const val = localStorage.getItem(READ_ALL_TIME_KEY)
    return val ? parseInt(val, 10) || 0 : 0
  } catch {
    return 0
  }
}

export function isItemRead(
  item: NotificationItem,
  readIds: Set<string>,
  lastMarkAllReadTime: number,
): boolean {
  if (item.isRead) return true
  if (readIds.has(item.id)) return true
  if (lastMarkAllReadTime > 0) {
    const itemTime = new Date(item.createdAt).getTime()
    if (!isNaN(itemTime) && itemTime <= lastMarkAllReadTime) {
      return true
    }
  }
  return false
}

export function markItemRead(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getReadIds()
    current.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(current)))
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, { detail: { id } }))
  } catch {
    // Abaikan kegagalan localStorage
  }

  // Laporkan ke backend di background jika ada relevansi (misal alert / admin notice)
  fetch('/api/v1/notifications/feed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'mark-read', id }),
  }).catch(() => {})
}

export function markAllRead(items: NotificationItem[]): void {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    localStorage.setItem(READ_ALL_TIME_KEY, now.toString())

    const current = getReadIds()
    items.forEach((item) => current.add(item.id))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(current)))

    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, { detail: { all: true } }))
  } catch {
    // Abaikan
  }

  // Laporkan ke server
  fetch('/api/v1/notifications/feed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'mark-all-read', ids: items.map((i) => i.id) }),
  }).catch(() => {})
}

export function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const diffMs = Date.now() - date.getTime()
    if (isNaN(diffMs) || diffMs < 0) return 'baru saja'

    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'baru saja'
    if (minutes < 60) return `${minutes} mnt lalu`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} jam lalu`

    const days = Math.floor(hours / 24)
    if (days === 1) return 'kemarin'
    if (days < 30) return `${days} hari lalu`

    const months = Math.floor(days / 30)
    return `${months} bln lalu`
  } catch {
    return 'baru saja'
  }
}
