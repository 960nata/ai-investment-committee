import Link from 'next/link'
import { getPublicDonationSettings } from '@/lib/db/donation-queries'

/**
 * Tautan ke /donasi di kaki halaman — hanya bila admin sudah menyalakannya.
 *
 * Komponen server tersendiri supaya kedua kaki halaman cukup menyisipkannya
 * tanpa ikut menjadi async atau membaca basis data sendiri.
 */
export async function DonationFooterLink({ className }: { className?: string }) {
  const settings = await getPublicDonationSettings()
  if (!settings) return null
  return (
    <Link href="/donasi" className={className} style={{ color: 'var(--signal)' }}>
      Dukung Kami ♥
    </Link>
  )
}
