/**
 * Premium: pengaturan, pesanan Tripay, dan hak akses per akun.
 *
 * Tabelnya dibuat lazy dengan DDL `IF NOT EXISTS`, pola yang sama dengan
 * `donation-queries.ts`, dan baris pengaturannya disemai dalam keadaan
 * TERSEMBUNYI. Halaman /premium tidak muncul hanya karena kode ini ter-deploy;
 * ia muncul ketika admin menyalakannya.
 *
 * Satu keputusan penting: menyembunyikan halaman Premium TIDAK mencabut hak
 * pembeli. Sakelar admin mengatur apakah Premium dijual, bukan apakah orang
 * yang sudah membayar tetap mendapat yang ia bayar.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from './client'
import { appUser, premiumOrder, premiumSettings, type PremiumOrderRow } from './schema'
import {
  DEFAULT_BENEFITS,
  DEFAULT_LIMITS,
  DEFAULT_PLANS,
  parseStoredBenefits,
  parseStoredLimits,
  parseStoredPlans,
  type PremiumPlan,
  type PremiumSettingsInput,
  type TierLimits,
} from '@/lib/premium/plans'
import type { TripayCallback } from '@/lib/payment/tripay'

export interface PremiumSettings {
  isEnabled: boolean
  title: string
  message: string
  benefits: string[]
  plans: PremiumPlan[]
  limits: { free: TierLimits; premium: TierLimits }
  updatedAt: Date
}

const DEFAULTS = {
  title: 'AI Investdesk Premium',
  message:
    'Terminal inti tetap gratis untuk semua orang. Premium untuk yang ingin analisis lebih dalam, ' +
    'kuota lebih longgar, dan ikut membiayai server, data pasar, serta model AI.',
}

declare global {
  var __premiumTablesReady: boolean | undefined
}

export async function ensurePremiumTables(): Promise<void> {
  if (globalThis.__premiumTablesReady) return

  await db.execute(sql`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS premium_settings (
      id INTEGER PRIMARY KEY,
      is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      title VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
      plans JSONB NOT NULL DEFAULT '[]'::jsonb,
      limits JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // Perintah terpisah: kueri berparameter tidak boleh memuat dua pernyataan.
  await db.execute(sql`
    INSERT INTO premium_settings (id, is_enabled, title, message, benefits, plans, limits)
    VALUES (
      1, FALSE, ${DEFAULTS.title}, ${DEFAULTS.message},
      ${JSON.stringify(DEFAULT_BENEFITS)}::jsonb,
      ${JSON.stringify(DEFAULT_PLANS)}::jsonb,
      ${JSON.stringify(DEFAULT_LIMITS)}::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `)
  // Nama constraint FK disamakan dengan buatan drizzle-kit, supaya migrasi yang
  // dijalankan belakangan mengenalinya dan tidak menambah FK kembar.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS premium_order (
      id SERIAL PRIMARY KEY,
      merchant_ref VARCHAR(64) NOT NULL,
      user_id INTEGER NOT NULL,
      plan_id VARCHAR(40) NOT NULL,
      plan_label VARCHAR(60) NOT NULL,
      days INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
      tripay_reference VARCHAR(64),
      checkout_url TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT premium_order_user_id_app_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
    )
  `)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS premium_order_ref_uq ON premium_order (merchant_ref)`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS premium_order_user_idx ON premium_order (user_id, created_at)`,
  )
  globalThis.__premiumTablesReady = true
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

export async function getPremiumSettings(): Promise<PremiumSettings> {
  await ensurePremiumTables()
  const [row] = await db.select().from(premiumSettings).where(eq(premiumSettings.id, 1))

  return {
    isEnabled: row?.isEnabled ?? false,
    title: row?.title ?? DEFAULTS.title,
    message: row?.message ?? DEFAULTS.message,
    benefits: parseStoredBenefits(row?.benefits),
    plans: parseStoredPlans(row?.plans),
    limits: parseStoredLimits(row?.limits),
    updatedAt: row?.updatedAt ?? new Date(0),
  }
}

export async function savePremiumSettings(input: PremiumSettingsInput): Promise<PremiumSettings> {
  await ensurePremiumTables()
  await db
    .update(premiumSettings)
    .set({
      isEnabled: input.isEnabled,
      title: input.title,
      message: input.message,
      benefits: input.benefits,
      plans: input.plans,
      limits: input.limits,
      updatedAt: new Date(),
    })
    .where(eq(premiumSettings.id, 1))

  settingsCache = null
  return getPremiumSettings()
}

/**
 * Salinan pendek untuk jalur panas (tiap pertanyaan, tiap tambah watchlist).
 * Tiga puluh detik cukup singkat sehingga perubahan admin terasa langsung.
 */
let settingsCache: { at: number; value: PremiumSettings } | null = null

async function cachedSettings(): Promise<PremiumSettings | null> {
  if (settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.value
  try {
    const value = await getPremiumSettings()
    settingsCache = { at: Date.now(), value }
    return value
  } catch (err) {
    console.error('[premium] gagal membaca pengaturan:', err)
    return null
  }
}

/** Pengaturan untuk halaman publik; null bila Premium sedang disembunyikan. */
export async function getPublicPremiumSettings(): Promise<PremiumSettings | null> {
  const value = await cachedSettings()
  return value?.isEnabled ? value : null
}

// ---------------------------------------------------------------------------
// Hak akses
// ---------------------------------------------------------------------------

export interface Entitlement {
  isPremium: boolean
  /** Benar bila admin sedang menjual Premium; hanya saat itu Premium boleh disebut ke pengguna. */
  forSale: boolean
  premiumUntil: Date | null
  limits: TierLimits
}

/**
 * Hak akses satu akun, dibaca dari basis data — bukan dari tiket sesi.
 * Tiket sesi dibuat saat masuk; pembayaran yang lunas lima menit kemudian
 * harus langsung berlaku tanpa memaksa orang keluar-masuk.
 *
 * Gagal membaca berarti diperlakukan sebagai akun gratis dengan batas bawaan,
 * bukan menolak semua: fitur tetap jalan, hanya tanpa kelonggaran Premium.
 */
export async function getEntitlement(userId: number): Promise<Entitlement> {
  const settings = await cachedSettings()
  const limits = settings?.limits ?? DEFAULT_LIMITS
  const forSale = settings?.isEnabled ?? false

  try {
    await ensurePremiumTables()
    const [row] = await db
      .select({ premiumUntil: appUser.premiumUntil })
      .from(appUser)
      .where(eq(appUser.id, userId))
    const until = row?.premiumUntil ?? null
    const isPremium = until !== null && until.getTime() > Date.now()
    return { isPremium, forSale, premiumUntil: until, limits: isPremium ? limits.premium : limits.free }
  } catch (err) {
    console.error('[premium] gagal membaca hak akses:', err)
    return { isPremium: false, forSale, premiumUntil: null, limits: limits.free }
  }
}

// ---------------------------------------------------------------------------
// Pesanan
// ---------------------------------------------------------------------------

export function newMerchantRef(userId: number): string {
  return `PRM-${userId}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

/** Tagihan belum dibayar dalam satu jam terakhir; penjaga agar satu akun tidak membanjiri Tripay. */
export async function countRecentUnpaid(userId: number): Promise<number> {
  await ensurePremiumTables()
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(premiumOrder)
    .where(
      and(
        eq(premiumOrder.userId, userId),
        eq(premiumOrder.status, 'UNPAID'),
        gte(premiumOrder.createdAt, new Date(Date.now() - 3600_000)),
      ),
    )
  return n
}

export async function createPendingOrder(input: {
  merchantRef: string
  userId: number
  plan: PremiumPlan
  method: string
}): Promise<void> {
  await ensurePremiumTables()
  await db.insert(premiumOrder).values({
    merchantRef: input.merchantRef,
    userId: input.userId,
    planId: input.plan.id,
    planLabel: input.plan.label,
    days: input.plan.days,
    amount: input.plan.price,
    method: input.method,
  })
}

export async function attachTripayReference(
  merchantRef: string,
  reference: string,
  checkoutUrl: string,
): Promise<void> {
  await db
    .update(premiumOrder)
    .set({ tripayReference: reference, checkoutUrl })
    .where(eq(premiumOrder.merchantRef, merchantRef))
}

export async function markOrderFailed(merchantRef: string): Promise<void> {
  await db
    .update(premiumOrder)
    .set({ status: 'FAILED' })
    .where(and(eq(premiumOrder.merchantRef, merchantRef), eq(premiumOrder.status, 'UNPAID')))
}

export async function getOrderForUser(userId: number, merchantRef: string): Promise<PremiumOrderRow | null> {
  await ensurePremiumTables()
  const [row] = await db
    .select()
    .from(premiumOrder)
    .where(and(eq(premiumOrder.userId, userId), eq(premiumOrder.merchantRef, merchantRef)))
  return row ?? null
}

/** Perpanjang dari yang lebih akhir: sekarang, atau sisa Premium yang masih berjalan. */
const extendSql = (days: number) =>
  sql`GREATEST(COALESCE(${appUser.premiumUntil}, NOW()), NOW()) + make_interval(days => ${days})`

export type CallbackOutcome = 'activated' | 'updated' | 'ignored' | 'unknown' | 'amount_mismatch'

/**
 * Terapkan callback Tripay.
 *
 * Idempoten: Tripay boleh mengirim callback yang sama berkali-kali (dan memang
 * mengulang bila jawaban kita lambat), jadi hanya transisi dari UNPAID yang
 * berlaku. Baris pesanan dikunci `FOR UPDATE` supaya dua callback yang tiba
 * bersamaan tidak memperpanjang Premium dua kali.
 */
export async function applyTripayCallback(cb: TripayCallback): Promise<CallbackOutcome> {
  await ensurePremiumTables()

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(premiumOrder)
      .where(eq(premiumOrder.merchantRef, cb.merchant_ref))
      .for('update')

    if (!order) return 'unknown'
    if (order.status !== 'UNPAID' && order.status !== 'EXPIRED') return 'ignored'

    if (cb.status === 'PAID') {
      // total_amount sudah termasuk biaya yang dibebankan ke pembeli, jadi
      // yang diperiksa hanya bahwa ia tidak kurang dari harga paket.
      if (!Number.isFinite(Number(cb.total_amount)) || Number(cb.total_amount) < order.amount) return 'amount_mismatch'

      await tx
        .update(premiumOrder)
        .set({
          status: 'PAID',
          tripayReference: cb.reference,
          paidAt: cb.paid_at ? new Date(cb.paid_at * 1000) : new Date(),
        })
        .where(eq(premiumOrder.id, order.id))
      await tx
        .update(appUser)
        .set({ premiumUntil: extendSql(order.days) })
        .where(eq(appUser.id, order.userId))
      return 'activated'
    }

    if (order.status === 'UNPAID') {
      await tx.update(premiumOrder).set({ status: cb.status }).where(eq(premiumOrder.id, order.id))
      return 'updated'
    }
    return 'ignored'
  })
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminOrderView {
  merchantRef: string
  email: string
  planLabel: string
  days: number
  amount: number
  method: string
  status: string
  createdAt: string
  paidAt: string | null
}

export async function listRecentOrders(limit = 50): Promise<AdminOrderView[]> {
  await ensurePremiumTables()
  const rows = await db
    .select({
      merchantRef: premiumOrder.merchantRef,
      email: appUser.email,
      planLabel: premiumOrder.planLabel,
      days: premiumOrder.days,
      amount: premiumOrder.amount,
      method: premiumOrder.method,
      status: premiumOrder.status,
      createdAt: premiumOrder.createdAt,
      paidAt: premiumOrder.paidAt,
    })
    .from(premiumOrder)
    .innerJoin(appUser, eq(appUser.id, premiumOrder.userId))
    .orderBy(desc(premiumOrder.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
  }))
}

export interface PremiumStats {
  activeMembers: number
  revenue30d: number
  paid30d: number
}

export async function getPremiumStats(): Promise<PremiumStats> {
  await ensurePremiumTables()
  const [[members], [paid]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(appUser)
      .where(sql`${appUser.premiumUntil} > NOW()`),
    db
      .select({
        n: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${premiumOrder.amount}), 0)::int`,
      })
      .from(premiumOrder)
      .where(
        and(eq(premiumOrder.status, 'PAID'), gte(premiumOrder.paidAt, new Date(Date.now() - 30 * 86400_000))),
      ),
  ])
  return { activeMembers: members.n, revenue30d: paid.total, paid30d: paid.n }
}

/**
 * Beri atau cabut Premium secara manual — untuk hadiah, penguji, atau
 * membereskan pembayaran yang callback-nya tidak pernah sampai. Pemberian
 * dicatat sebagai pesanan berstatus GRANTED supaya jejaknya tetap ada.
 */
export async function adminSetPremium(
  email: string,
  days: number,
): Promise<{ ok: true; premiumUntil: Date | null } | { ok: false; error: string }> {
  await ensurePremiumTables()
  const [user] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(sql`lower(${appUser.email}) = ${email.trim().toLowerCase()}`)
  if (!user) return { ok: false, error: 'Akun dengan email itu tidak ditemukan.' }

  if (days <= 0) {
    await db.update(appUser).set({ premiumUntil: null }).where(eq(appUser.id, user.id))
    return { ok: true, premiumUntil: null }
  }

  const merchantRef = `ADM-${user.id}-${Date.now().toString(36).toUpperCase()}`
  const [row] = await db.transaction(async (tx) => {
    await tx.insert(premiumOrder).values({
      merchantRef,
      userId: user.id,
      planId: 'admin',
      planLabel: `Pemberian admin (${days} hari)`,
      days,
      amount: 0,
      method: 'ADMIN',
      status: 'GRANTED',
      paidAt: new Date(),
    })
    return tx
      .update(appUser)
      .set({ premiumUntil: extendSql(days) })
      .where(eq(appUser.id, user.id))
      .returning({ premiumUntil: appUser.premiumUntil })
  })
  return { ok: true, premiumUntil: row?.premiumUntil ?? null }
}
