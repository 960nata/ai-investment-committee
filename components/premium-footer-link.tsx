import Link from 'next/link'
import { getPublicPremiumSettings } from '@/lib/db/premium-queries'

/**
 * Tautan ke /premium di kaki halaman — hanya bila admin sudah menyalakannya.
 * Pasangan `DonationFooterLink`, dengan alasan yang sama.
 */
export async function PremiumFooterLink({ className }: { className?: string }) {
  const settings = await getPublicPremiumSettings()
  if (!settings) return null
  return (
    <Link href="/premium" className={className} style={{ color: 'var(--signal)' }}>
      Premium ♛
    </Link>
  )
}
