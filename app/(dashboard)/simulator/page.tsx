/**
 * Simulator Trading (Premium) — dompet virtual, harga realtime, desk AI.
 *
 * Akses diperiksa di server pada tiap muatan: admin harus sudah membukanya
 * untuk Premium, dan akun ini harus sedang Premium. API-nya memeriksa ulang
 * hal yang sama, jadi halaman ini bukan satu-satunya penjaga.
 */

import Link from 'next/link'
import { BetaHead } from '@/components/member/page-head'
import { SimulatorClient } from '@/components/simulator/simulator-client'
import { loadSimInstrumentOptions } from '@/components/simulator/load-options'
import { requireUser } from '@/lib/auth/user-auth'
import { ACCESS_MESSAGE, resolveSimAccess } from '@/lib/simulator/access'
import s from '@/components/simulator/simulator.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Simulator Trading', robots: { index: false, follow: false } }

export default async function SimulatorPage() {
  await requireUser('/simulator')
  const access = await resolveSimAccess()

  const head = (
    <BetaHead
      eyebrow="Premium"
      title="Simulator Trading AI"
      lead="Latih strategi dengan dompet virtual $1.000 dan harga realtime. Binary option, investasi harian, bulanan, dan tahunan punya dompet terpisah — dan desk empat AI bisa menganalisis pasar, melacak jejak bandar, lalu trading untukmu."
      note="Uang virtual, bukan saran investasi. Hasil simulasi tidak menjamin hasil di pasar nyata."
    />
  )

  if (!access.ok) {
    return (
      <>
        {head}
        <div className={s.lock}>
          <h2>{ACCESS_MESSAGE[access.reason]}</h2>
          <p>
            {access.reason === 'premium'
              ? 'Aktifkan Premium untuk membuka simulator: dompet $1.000 per mode yang bisa direset kapan saja, binary option kripto realtime, dan desk AI yang bersidang lalu mengeksekusi trade.'
              : 'Fitur ini sedang disiapkan. Pantau pengumuman di dashboard.'}
          </p>
          {access.reason === 'premium' && (
            <Link href="/premium" className="btn btn-primary">
              Lihat paket Premium
            </Link>
          )}
        </div>
      </>
    )
  }

  const instruments = await loadSimInstrumentOptions().catch(() => [])
  return (
    <>
      {head}
      <SimulatorClient instruments={instruments} />
    </>
  )
}
