/**
 * Pengaturan halaman donasi.
 *
 * Tabelnya dibuat lazy dengan DDL `IF NOT EXISTS`, pola yang sama dengan
 * `ensureMemberTables()`, dan baris tunggalnya disemai dalam keadaan
 * TERSEMBUNYI. Halaman donasi tidak boleh muncul hanya karena kode ini
 * ter-deploy; ia muncul ketika admin menyalakannya.
 */

import { eq, sql } from 'drizzle-orm'
import { db } from './client'
import { donationSettings } from './schema'
import {
  parseStoredMethods,
  type DonationMethod,
  type DonationSettingsInput,
} from '@/lib/donation/providers'

export interface DonationSettings {
  isEnabled: boolean
  title: string
  message: string
  methods: DonationMethod[]
  updatedAt: Date
}

const DEFAULTS = {
  title: 'Dukung AI Investdesk',
  message:
    'AI Investdesk dibangun dan dijalankan secara mandiri. Donasi membantu membayar server, data pasar, ' +
    'dan kuota model AI supaya terminal ini tetap terbuka gratis untuk semua orang.',
}

declare global {
  var __donationTableReady: boolean | undefined
}

async function ensureDonationTable(): Promise<void> {
  if (globalThis.__donationTableReady) return
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS donation_settings (
      id INTEGER PRIMARY KEY,
      is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      title VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      methods JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // Perintah terpisah: kueri berparameter tidak boleh memuat dua pernyataan.
  await db.execute(sql`
    INSERT INTO donation_settings (id, is_enabled, title, message)
    VALUES (1, FALSE, ${DEFAULTS.title}, ${DEFAULTS.message})
    ON CONFLICT (id) DO NOTHING;
  `)
  globalThis.__donationTableReady = true
}

export async function getDonationSettings(): Promise<DonationSettings> {
  await ensureDonationTable()
  const [row] = await db.select().from(donationSettings).where(eq(donationSettings.id, 1))

  return {
    isEnabled: row?.isEnabled ?? false,
    title: row?.title ?? DEFAULTS.title,
    message: row?.message ?? DEFAULTS.message,
    methods: parseStoredMethods(row?.methods),
    updatedAt: row?.updatedAt ?? new Date(0),
  }
}

export async function saveDonationSettings(input: DonationSettingsInput): Promise<DonationSettings> {
  await ensureDonationTable()
  await db
    .update(donationSettings)
    .set({
      isEnabled: input.isEnabled,
      title: input.title,
      message: input.message,
      methods: input.methods,
      updatedAt: new Date(),
    })
    .where(eq(donationSettings.id, 1))

  publicCache = null
  return getDonationSettings()
}

/**
 * Salinan pendek untuk kaki halaman.
 *
 * Kaki halaman tampil di tiap halaman publik, dan menanyakan basis data di
 * tiap kunjungan hanya untuk satu tautan adalah pemborosan. Tiga puluh detik
 * cukup singkat sehingga sakelar admin terasa langsung berlaku.
 */
let publicCache: { at: number; value: DonationSettings } | null = null

export async function getPublicDonationSettings(): Promise<DonationSettings | null> {
  if (publicCache && Date.now() - publicCache.at < 30_000) {
    return publicCache.value.isEnabled ? publicCache.value : null
  }
  try {
    const value = await getDonationSettings()
    publicCache = { at: Date.now(), value }
    return value.isEnabled ? value : null
  } catch (err) {
    console.error('[donation] gagal membaca pengaturan:', err)
    return null
  }
}
