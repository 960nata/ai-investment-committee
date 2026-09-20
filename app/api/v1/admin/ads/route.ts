import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession, isRequestAdminAuthenticated } from '@/lib/auth/admin-auth'
import { getAdSettings, updateAdSetting, getAdSettingBySlot } from '@/lib/db/news-queries'

export const dynamic = 'force-dynamic'

/**
 * Ambil daftar pengaturan slot iklan.
 * (Bisa diakses publik / reader untuk mengetahui slot iklan yang aktif, atau admin untuk konfigurasi).
 */
export async function GET() {
  try {
    const slots = await getAdSettings()
    return NextResponse.json({ ok: true, data: slots })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Perbarui konfigurasi slot iklan (Khusus Admin).
 */
export async function PATCH(req: NextRequest) {
  const isAuthed = (await verifyAdminSession()) || isRequestAdminAuthenticated(req)
  if (!isAuthed) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak. Diperlukan sesi Admin.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { slotName, isEnabled, adCodeHtml, targetUrl, imageUrl, sponsorName, title, description } = body

    if (!slotName) {
      return NextResponse.json({ ok: false, error: 'slotName wajib dicantumkan.' }, { status: 400 })
    }

    const existing = await getAdSettingBySlot(slotName)
    if (!existing) {
      return NextResponse.json({ ok: false, error: `Slot iklan ${slotName} tidak ditemukan.` }, { status: 404 })
    }

    const updated = await updateAdSetting(slotName, {
      isEnabled: typeof isEnabled === 'boolean' ? isEnabled : existing.isEnabled,
      adCodeHtml: adCodeHtml !== undefined ? adCodeHtml : existing.adCodeHtml,
      targetUrl: targetUrl !== undefined ? targetUrl : existing.targetUrl,
      imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
      sponsorName: sponsorName !== undefined ? sponsorName : existing.sponsorName,
      title: title !== undefined ? title : existing.title,
      description: description !== undefined ? description : existing.description,
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
