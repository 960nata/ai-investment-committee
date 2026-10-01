/**
 * Email ke pengguna: alert yang terpicu dan ringkasan mingguan.
 *
 * Alasan keberadaannya sederhana: notifikasi yang hanya ada di dalam aplikasi
 * baru terbaca kalau pengguna sudah kembali, padahal yang dibutuhkan justru
 * alasan untuk kembali.
 *
 * Dikirim lewat REST API Resend dengan `fetch` biasa — tanpa SDK, tanpa
 * dependensi baru. Tanpa `RESEND_API_KEY` semua fungsi di sini diam dan
 * melaporkan `delivery: 'off'`; tidak ada yang gagal karena email belum diatur.
 *
 * Preferensi disimpan di dua kolom `app_user` yang ditambahkan oleh
 * `ensureMemberTables()` dan sengaja tidak dimasukkan ke skema Drizzle:
 * kalau ada di skema sebelum kolomnya benar-benar ada, setiap `select` ke
 * `app_user` — termasuk masuk — akan gagal di basis data yang belum diperbarui.
 */

import crypto from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { ensureMemberTables } from '@/lib/db/member-queries'
import { SITE_NAME } from '@/lib/brand'
import { fetchWithTimeout } from '@/lib/http/fetch'

export type Delivery = 'resend' | 'off'

export function emailDelivery(): Delivery {
  return process.env.RESEND_API_KEY ? 'resend' : 'off'
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

function secret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_SECRET_KEY || ''
}

/** Token berhenti langganan: HMAC atas id pengguna, tidak kedaluwarsa. */
export function unsubscribeToken(userId: number): string {
  return crypto.createHmac('sha256', secret()).update(`unsub:${userId}`).digest('hex').slice(0, 32)
}

export function verifyUnsubscribeToken(userId: number, token: string): boolean {
  if (!secret() || !/^[0-9a-f]{32}$/.test(token)) return false
  const expected = Buffer.from(unsubscribeToken(userId))
  return crypto.timingSafeEqual(expected, Buffer.from(token))
}

export function unsubscribeUrl(userId: number): string {
  return `${appUrl()}/api/v1/user/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`
}

export async function setEmailOptOut(userId: number, optOut: boolean): Promise<void> {
  await ensureMemberTables()
  await db.execute(sql`update app_user set email_opt_out = ${optOut} where id = ${userId}`)
}

export type EmailRecipient = {
  id: number
  email: string
  name: string
}

/** Pengguna aktif yang masih mau menerima email, atau null. */
export async function emailRecipient(userId: number): Promise<EmailRecipient | null> {
  await ensureMemberTables()
  const rows = await db.execute<EmailRecipient>(sql`
    select id, email, name from app_user
    where id = ${userId} and is_active and not email_opt_out
  `)
  return rows[0] ?? null
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Kerangka HTML email: polos, satu kolom, terbaca di klien email mana pun. */
export function emailLayout(userId: number, title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:800;font-size:14px;letter-spacing:.02em;color:#555;margin-bottom:12px">${escapeHtml(SITE_NAME)}</div>
<div style="background:#fff;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
<p style="font-size:12px;color:#777;line-height:1.5;margin-top:16px">
Alat analisis data, bukan anjuran investasi. Angka berupa peluang, bukan ramalan.<br>
<a href="${unsubscribeUrl(userId)}" style="color:#777">Berhenti menerima email</a>
</p>
</div></body></html>`
}

export { escapeHtml }

/** Kirim satu email. Melempar bila Resend menolak; diam bila email belum diatur. */
export async function sendEmail(input: {
  to: string
  userId: number
  subject: string
  html: string
}): Promise<Delivery> {
  const key = process.env.RESEND_API_KEY
  if (!key) return 'off'

  const from = process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`
  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    label: 'resend',
    timeoutMs: 15_000,
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(input.userId)}>` },
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Resend ${response.status}: ${text.slice(0, 200)}`)
  }
  return 'resend'
}

/** Alert terpicu → email. Tidak pernah melempar: email gagal tidak boleh menggagalkan alert. */
export async function emailAlert(
  userId: number,
  notification: { title: string; body: string; linkUrl: string | null },
): Promise<void> {
  if (emailDelivery() === 'off') return
  try {
    const to = await emailRecipient(userId)
    if (!to) return
    const link = notification.linkUrl ? `${appUrl()}${notification.linkUrl}` : appUrl()
    await sendEmail({
      to: to.email,
      userId,
      subject: notification.title,
      html: emailLayout(
        userId,
        notification.title,
        `<p style="line-height:1.6;margin:0 0 20px">${escapeHtml(notification.body)}</p>
<a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Buka di ${escapeHtml(SITE_NAME)}</a>`,
      ),
    })
  } catch (err) {
    console.warn('[Email] alert gagal dikirim:', err instanceof Error ? err.message : err)
  }
}
