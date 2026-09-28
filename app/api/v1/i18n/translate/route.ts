/**
 * POST /api/v1/i18n/translate
 *
 * Terjemahan teks antarmuka untuk pemilih bahasa di header. Membaca cache di
 * Postgres lebih dulu; hanya kalimat yang belum pernah diterjemahkan yang
 * dikirim ke model. Kuota per pemanggil dijaga `proxy.ts`, dan pagu harian
 * karakter baru — per alamat, per akun, dan untuk seluruh tamu — dijaga
 * `reserveTranslateChars` di `lib/http/budget.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MAX_REQUEST_CHARS,
  MAX_TEXTS,
  MAX_TEXT_LENGTH,
  translateUiTexts,
} from '@/lib/i18n/ui-translate'
import { TRANSLATED_LOCALES } from '@/lib/i18n/locales'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { callerHash, callerIp } from '@/lib/http/blocklist'
import { badRequest, failure, NO_STORE } from '@/lib/http/errors'

export const dynamic = 'force-dynamic'

const Body = z.object({
  locale: z.enum(TRANSLATED_LOCALES as [string, ...string[]]),
  texts: z
    .array(z.string().min(1).max(MAX_TEXT_LENGTH))
    .min(1)
    .max(MAX_TEXTS)
    .refine((texts) => texts.reduce((sum, t) => sum + t.length, 0) <= MAX_REQUEST_CHARS),
})

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return badRequest(
      `Kirim {locale, texts}: maksimal ${MAX_TEXTS} teks, ${MAX_TEXT_LENGTH} karakter per teks, ` +
        `${MAX_REQUEST_CHARS} karakter per permintaan`,
    )
  }

  try {
    const user = await getCurrentUser()
    const result = await translateUiTexts(
      parsed.texts,
      parsed.locale as (typeof TRANSLATED_LOCALES)[number],
      { ipHash: callerHash(callerIp(req)), userId: user?.uid },
    )
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (err) {
    return failure('api/v1/i18n/translate', err)
  }
}
