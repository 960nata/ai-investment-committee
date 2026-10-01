/**
 * Tipe dan utilitas terpadu untuk notifikasi terminal:
 * Menggabungkan Warta/Berita Pasar, Pengumuman Admin, dan Alert Pengguna.
 */

export type NotificationType = 'berita' | 'admin' | 'pengumuman' | 'alert'
export type NotificationFilterType = 'semua' | 'berita' | 'admin' | 'pengumuman' | 'alert' | 'unread'

export interface UnifiedNotificationItem {
  /** ID unik gabungan, misal "news-12" atau "announcement-3" atau "alert-45" */
  id: string
  rawId: number
  type: NotificationType
  title: string
  body: string
  linkUrl: string
  url?: string
  createdAt: string
  isRead: boolean
  read?: boolean
  tone?: string // 'info' | 'beta' | 'penting' | 'neutral' | 'bullish' | 'bearish'
  category?: string
  sentiment?: string
  badgeLabel: string
}

/** Alias untuk UnifiedNotificationItem agar kompatibel dengan komponen notifikasi */
export type NotificationItem = UnifiedNotificationItem

export interface RawAnnouncement {
  id: number
  title: string
  body: string
  tone?: string
  linkUrl?: string | null
  linkLabel?: string | null
  startsAt?: string | Date | null
  createdAt?: string | Date | null
}

export interface RawNewsItem {
  id: number
  slug: string
  title: string
  summary: string
  category: string
  sentiment?: string
  impactScore?: number
  publishedAt: string | Date
  featuredImage?: { url: string; alt?: string } | null
}

export interface RawNotification {
  id: number
  title: string
  body: string
  linkUrl?: string | null
  readAt?: string | Date | null
  createdAt: string | Date
}

export const NOTIF_STORAGE_KEYS = {
  READ_IDS: 'investasi_notif_read_ids_v1',
  READ_ALL_AT: 'investasi_notif_read_all_v1',
  EVENT_CHANGED: 'investasi_notifications_changed',
} as const

/**
 * Format waktu relatif ringkas dalam bahasa Indonesia (misal: "Baru saja", "5m lalu", "2j lalu", "Kemarin").
 */
export function formatRelativeTime(dateInput: string | Date): string {
  const time = typeof dateInput === 'string' ? new Date(dateInput).getTime() : dateInput.getTime()
  if (isNaN(time)) return 'Baru saja'

  const diffMs = Date.now() - time
  if (diffMs < 0) return 'Baru saja'

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Baru saja'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m lalu`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}j lalu`

  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'Kemarin'
  if (diffDay < 7) return `${diffDay}h lalu`

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(time))
}

/**
 * Format tanggal lengkap Indonesia untuk halaman detail / kartu penuh.
 */
export function formatIndonesianDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Ambil daftar ID yang sudah dibaca dari localStorage.
 */
export function getStoredReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEYS.READ_IDS)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

/**
 * Ambil timestamp terakhir kali pengguna menekan "Tandai Semua Dibaca".
 */
export function getStoredReadAllTimestamp(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEYS.READ_ALL_AT)
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

/**
 * Simpan satu item sudah dibaca ke localStorage dan beri tahu listener.
 */
export function markItemReadInStorage(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const set = getStoredReadIds()
    set.add(id)
    localStorage.setItem(NOTIF_STORAGE_KEYS.READ_IDS, JSON.stringify(Array.from(set)))
    window.dispatchEvent(new CustomEvent(NOTIF_STORAGE_KEYS.EVENT_CHANGED, { detail: { id } }))
  } catch {
    // Abaikan jika localStorage diblokir
  }
}

/**
 * Tandai semua dibaca di localStorage dan beri tahu listener.
 */
export function markAllReadInStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    localStorage.setItem(NOTIF_STORAGE_KEYS.READ_ALL_AT, String(now))
    window.dispatchEvent(new CustomEvent(NOTIF_STORAGE_KEYS.EVENT_CHANGED, { detail: { all: true, at: now } }))
  } catch {
    // Abaikan jika localStorage diblokir
  }
}

/**
 * Gabungkan seluruh sumber data (berita, pengumuman admin, alert pengguna)
 * menjadi satu larik notifikasi terurut waktu terbaru.
 */
export function buildUnifiedNotifications({
  announcements = [],
  news = [],
  notifications = [],
  readIds = new Set<string>(),
  readAllTimestamp = 0,
}: {
  announcements?: RawAnnouncement[]
  news?: RawNewsItem[]
  notifications?: RawNotification[]
  readIds?: Set<string>
  readAllTimestamp?: number
}): UnifiedNotificationItem[] {
  const items: UnifiedNotificationItem[] = []

  // 1. Pengumuman Admin
  for (const a of announcements) {
    const id = `announcement-${a.id}`
    const dateVal = a.startsAt || a.createdAt || new Date()
    const itemTime = new Date(dateVal).getTime()
    const isRead = readIds.has(id) || (readAllTimestamp > 0 && itemTime <= readAllTimestamp)

    let badgeLabel = 'Pengumuman Admin'
    if (a.tone === 'penting') badgeLabel = 'Pemberitahuan Penting'
    else if (a.tone === 'beta') badgeLabel = 'Pembaruan Beta'

    items.push({
      id,
      rawId: a.id,
      type: 'admin',
      title: a.title,
      body: a.body,
      linkUrl: a.linkUrl || '/notifikasi',
      url: a.linkUrl || '/notifikasi',
      createdAt: typeof dateVal === 'string' ? dateVal : new Date(dateVal).toISOString(),
      isRead,
      read: isRead,
      tone: a.tone || 'info',
      category: 'Admin',
      badgeLabel,
    })
  }

  // 2. Berita & Warta Pasar AI
  for (const n of news) {
    const id = `news-${n.id}`
    const dateVal = n.publishedAt || new Date()
    const itemTime = new Date(dateVal).getTime()
    const isRead = readIds.has(id) || (readAllTimestamp > 0 && itemTime <= readAllTimestamp)

    const catLabel =
      n.category === 'teknologi-ai'
        ? 'AI & Tech'
        : n.category === 'energi-komoditas'
          ? 'Energi & Komoditas'
          : n.category === 'saham-idx'
            ? 'Saham IDX'
            : n.category === 'crypto-fintech'
              ? 'Kripto & Fintech'
              : 'Ekonomi Makro'

    items.push({
      id,
      rawId: n.id,
      type: 'berita',
      title: n.title,
      body: n.summary,
      linkUrl: `/warta/${n.slug}`,
      url: `/warta/${n.slug}`,
      createdAt: typeof dateVal === 'string' ? dateVal : new Date(dateVal).toISOString(),
      isRead,
      read: isRead,
      tone: n.sentiment || 'neutral',
      category: catLabel,
      sentiment: n.sentiment,
      badgeLabel: 'Warta Pasar AI',
    })
  }

  // 3. Alert Akun / Sistem
  for (const notif of notifications) {
    const id = `alert-${notif.id}`
    const dateVal = notif.createdAt || new Date()
    const itemTime = new Date(dateVal).getTime()
    const isRead =
      Boolean(notif.readAt) || readIds.has(id) || (readAllTimestamp > 0 && itemTime <= readAllTimestamp)

    items.push({
      id,
      rawId: notif.id,
      type: 'alert',
      title: notif.title,
      body: notif.body,
      linkUrl: notif.linkUrl || '/alert',
      url: notif.linkUrl || '/alert',
      createdAt: typeof dateVal === 'string' ? dateVal : new Date(dateVal).toISOString(),
      isRead,
      read: isRead,
      tone: 'info',
      category: 'Sinyal Alert',
      badgeLabel: 'Sinyal Alert',
    })
  }

  // Urutkan waktu terbaru dulu
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return items
}
