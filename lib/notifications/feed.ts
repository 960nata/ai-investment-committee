import { desc, and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  announcement,
  announcementDismissal,
  marketNews,
  userNotification,
} from '@/lib/db/schema'
import { ensureNewsTable } from '@/lib/db/news-queries'
import { ensureMemberTables, createAnnouncement } from '@/lib/db/member-queries'
import { seedInitialNewsArticles } from '@/lib/agents/news-agent'
import type { NotificationItem, NotificationType } from './types'

let seededAnnouncements = false

/**
 * Pastikan ada pengumuman awal dari admin jika tabel masih kosong.
 */
export async function seedInitialAnnouncementsIfEmpty(): Promise<void> {
  if (seededAnnouncements) return
  await ensureMemberTables()

  try {
    const existing = await db.select({ id: announcement.id }).from(announcement).limit(1)
    if (existing.length === 0) {
      await createAnnouncement({
        title: 'Selamat datang di Terminal AI Investment Committee',
        body: 'Sistem komite intelijen multi-agen kini memantau 447+ instrumen pasar saham IDX, US, Global, dan Crypto secara real-time.',
        tone: 'info',
        linkUrl: '/ringkasan',
        linkLabel: 'Buka Ringkasan',
        isActive: true,
        startsAt: new Date(),
        endsAt: null,
      })
      await createAnnouncement({
        title: 'Pembaruan Analisis Konsensus Komite v2.4 Aktif',
        body: 'Integrasi korelasi makro-ekonomi global, komoditas energi data center, dan deteksi arus kepemilikan asing KSEI telah diaktifkan.',
        tone: 'beta',
        linkUrl: '/instruments',
        linkLabel: 'Jelajahi Instrumen',
        isActive: true,
        startsAt: new Date(),
        endsAt: null,
      })
      await createAnnouncement({
        title: 'Pemeliharaan Rutin Server Data Pipeline AI',
        body: 'Penyegaran data candle dan penyesuaian aksi korporasi berjalan otomatis setiap penutupan bursa pukul 17:00 WIB.',
        tone: 'info',
        linkUrl: '/pipeline',
        linkLabel: 'Cek Status Pipeline',
        isActive: true,
        startsAt: new Date(),
        endsAt: null,
      })
    }
    seededAnnouncements = true
  } catch (err) {
    console.error('[NotificationFeed] Gagal seeding pengumuman:', err)
  }
}

/**
 * Mengambil feed gabungan: Berita Pasar AI, Pemberitahuan dari Admin, dan Alert Pengguna.
 */
export async function getUnifiedNotificationFeed(userId?: number | null): Promise<NotificationItem[]> {
  try {
    await Promise.all([
      ensureNewsTable(),
      ensureMemberTables(),
      seedInitialNewsArticles().catch(() => {}),
      seedInitialAnnouncementsIfEmpty().catch(() => {}),
    ])

    // Ambil berita terbaru (limit 15)
    const newsPromise = db
      .select({
        id: marketNews.id,
        slug: marketNews.slug,
        title: marketNews.title,
        summary: marketNews.summary,
        category: marketNews.category,
        sentiment: marketNews.sentiment,
        publishedAt: marketNews.publishedAt,
      })
      .from(marketNews)
      .orderBy(desc(marketNews.publishedAt))
      .limit(15)

    // Ambil pengumuman admin yang aktif
    const announcementPromise = db
      .select({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        tone: announcement.tone,
        linkUrl: announcement.linkUrl,
        linkLabel: announcement.linkLabel,
        startsAt: announcement.startsAt,
        createdAt: announcement.createdAt,
      })
      .from(announcement)
      .where(
        and(
          eq(announcement.isActive, true),
          sql`${announcement.startsAt} <= NOW()`,
          sql`(${announcement.endsAt} IS NULL OR ${announcement.endsAt} > NOW())`,
        ),
      )
      .orderBy(desc(announcement.startsAt))
      .limit(10)

    // Ambil penutupan pengumuman admin jika ada user
    const dismissalsPromise = userId
      ? db
          .select({ announcementId: announcementDismissal.announcementId })
          .from(announcementDismissal)
          .where(eq(announcementDismissal.userId, userId))
      : Promise.resolve([])

    // Ambil alert pengguna jika ada user
    const alertsPromise = userId
      ? db
          .select({
            id: userNotification.id,
            title: userNotification.title,
            body: userNotification.body,
            linkUrl: userNotification.linkUrl,
            readAt: userNotification.readAt,
            createdAt: userNotification.createdAt,
          })
          .from(userNotification)
          .where(eq(userNotification.userId, userId))
          .orderBy(desc(userNotification.createdAt))
          .limit(15)
      : Promise.resolve([])

    const [newsRows, announcementRows, dismissals, alertRows] = await Promise.all([
      newsPromise.catch(() => []),
      announcementPromise.catch(() => []),
      dismissalsPromise.catch(() => []),
      alertsPromise.catch(() => []),
    ])

    const dismissedSet = new Set(dismissals.map((d) => d.announcementId))

    const items: NotificationItem[] = []

    // 1. Format Berita
    for (const news of newsRows) {
      items.push({
        id: `news-${news.id}`,
        type: 'berita',
        title: news.title,
        body: news.summary,
        linkUrl: `/berita/${news.slug}`,
        createdAt: news.publishedAt.toISOString(),
        badgeLabel: 'Berita AI',
        category: news.category,
        sentiment: news.sentiment,
        isRead: false, // Ditentukan di client localStorage / read timestamp
        rawId: news.id,
      })
    }

    // 2. Format Pemberitahuan Admin
    for (const ann of announcementRows) {
      items.push({
        id: `admin-${ann.id}`,
        type: 'admin',
        title: ann.title,
        body: ann.body,
        linkUrl: ann.linkUrl || '/ringkasan',
        createdAt: (ann.startsAt || ann.createdAt).toISOString(),
        badgeLabel: ann.tone === 'penting' ? 'Admin: Penting' : ann.tone === 'beta' ? 'Admin: Beta' : 'Pengumuman Admin',
        tone: ann.tone,
        isRead: dismissedSet.has(ann.id),
        rawId: ann.id,
      })
    }

    // 3. Format Alert Sistem
    for (const alert of alertRows) {
      items.push({
        id: `alert-${alert.id}`,
        type: 'alert',
        title: alert.title,
        body: alert.body,
        linkUrl: alert.linkUrl || '/alert',
        createdAt: alert.createdAt.toISOString(),
        badgeLabel: 'Alert Sistem',
        isRead: alert.readAt !== null,
        rawId: alert.id,
      })
    }

    // Urutkan semua notifikasi berdasarkan waktu terbaru
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return items
  } catch (err) {
    console.error('[NotificationFeed] Gagal memuat notification feed:', err)
    return []
  }
}
