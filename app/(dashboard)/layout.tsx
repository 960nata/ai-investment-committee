/**
 * Kerangka aplikasi.
 *
 * Server Component. Kesegaran data dibaca di sini supaya bar atas bisa
 * menampilkannya di tiap halaman tanpa satu pun effect di klien. Hanya rel
 * navigasi dan bar atas yang berjalan di peramban, dan keduanya hanya karena
 * butuh mengetahui alamat halaman yang sedang dibuka.
 *
 * Kegagalan basis data tidak boleh menjatuhkan seluruh kerangka. Kalau kueri
 * gagal, bar atas berkata "terputus" dan halaman di dalamnya tetap tergambar
 * beserta keterangan cara memperbaikinya.
 */

import { IngestButton } from '@/components/ingest-button'
import { Rail } from '@/components/rail'
import { Topbar, type TopbarStatus } from '@/components/topbar'
import { SidebarProvider } from '@/components/sidebar-context'
import { describeAge, getDataFreshness } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const status = await freshnessStatus()

  return (
    <SidebarProvider>
      <div className="app" suppressHydrationWarning>
        <Topbar
          status={status}
          action={
            process.env.NODE_ENV !== 'production' ? (
              <IngestButton job="ingest-crypto-daily" />
            ) : undefined
          }
        />
        <div className="shell" suppressHydrationWarning>
          <Rail />
          <main className="main" suppressHydrationWarning>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}

async function freshnessStatus(): Promise<TopbarStatus> {
  try {
    const { latestCandleDate, ageMinutes, freshness } = await getDataFreshness()

    if (freshness === 'empty') {
      return { state: 'unknown', summary: 'belum ada data' }
    }

    // Data basi diberi nama terang-terangan. Pembaca yang tidak tahu datanya
    // mati akan mengambil keputusan berdasarkan angka mati.
    return {
      state: freshness === 'fresh' ? 'ok' : 'halted',
      summary:
        `data per ${latestCandleDate} · ${describeAge(ageMinutes)}` +
        (freshness === 'stale' ? ' · basi' : ''),
    }
  } catch {
    return { state: 'halted', summary: 'basis data terputus' }
  }
}
