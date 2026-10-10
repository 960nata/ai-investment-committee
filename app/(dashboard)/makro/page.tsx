/**
 * Makro (Beta) — suku bunga, inflasi, dan pertumbuhan ekonomi Indonesia dan
 * Amerika Serikat, dari FRED dan Bank Dunia.
 *
 * Deret ini sudah ditarik job `ingest-macro` untuk mengisi parameter model
 * jangka panjang. Halaman ini hanya memperlihatkannya kepada pengguna.
 */

import { IconGlobe } from '@/components/icons'
import { Blank, DatabaseNotice } from '@/components/ui'
import { BetaHead } from '@/components/member/page-head'
import { Sparkline } from '@/components/member/sparkline'
import { requireUser } from '@/lib/auth/user-auth'
import { lastMacro } from '@/lib/db/macro-queries'
import { MACRO_SERIES } from '@/lib/macro/sources'
import { getMacroCalendar, type CalendarResult } from '@/lib/macro/calendar'
import { MacroCalendar } from '@/components/member/macro-calendar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Makro' }

/** Deret tingkat (bukan persen) ditulis sebagai angka, sisanya persen. */
const LEVEL_SERIES = new Set(['FRED:CPIAUCSL', 'WB:IDN:NY.GDP.MKTP.CN', 'WB:USA:NY.GDP.MKTP.CN'])

const GROUPS: { title: string; match: (id: string) => boolean }[] = [
  { title: 'Indonesia', match: (id) => id.includes('IDN') || id === 'FRED:IRSTCI01IDM156N' },
  { title: 'Amerika Serikat', match: (id) => !(id.includes('IDN') || id === 'FRED:IRSTCI01IDM156N') },
]

function formatValue(id: string, v: number): string {
  if (!LEVEL_SERIES.has(id)) return `${v.toFixed(2).replace('.', ',')}%`
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T`
  return v.toLocaleString('id-ID', { maximumFractionDigits: 1 })
}

function formatDelta(id: string, now: number, prev: number): string {
  if (LEVEL_SERIES.has(id)) {
    const pct = prev !== 0 ? (now / prev - 1) * 100 : 0
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}% dari periode sebelumnya`
  }
  const d = now - prev
  return `${d >= 0 ? '+' : ''}${d.toFixed(2).replace('.', ',')} poin dari periode sebelumnya`
}

export default async function MacroPage({ searchParams }: { searchParams: Promise<{ kalender?: string }> }) {
  await requireUser('/makro')
  const showAll = (await searchParams).kalender === 'semua'
  const renderedAt = new Date().getTime()
  // Kalender berdiri sendiri: kegagalannya tidak boleh menyembunyikan deret makro.
  const calendar: CalendarResult = await getMacroCalendar().catch(() => ({ events: [], origin: 'stored' as const }))

  let series: { id: string; label: string; points: { date: string; value: number }[] }[] = []
  let error: string | null = null
  try {
    series = await Promise.all(
      MACRO_SERIES.map(async (s) => ({ id: s.id, label: s.label, points: (await lastMacro(s.id, 36)).reverse() })),
    )
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const hasData = series.some((s) => s.points.length > 0)

  return (
    <>
      <BetaHead
        eyebrow="Riset"
        title="Makro"
        lead="Suku bunga, inflasi, dan pertumbuhan ekonomi Indonesia dan Amerika Serikat — latar yang menentukan mahal-murahnya aset lain."
        note="Sumber: FRED (Federal Reserve Bank of St. Louis) dan Bank Dunia. Deret bulanan diperbarui harian; deret tahunan baru berubah setelah tahunnya berakhir."
      />
      <MacroCalendar data={calendar} showAll={showAll} now={renderedAt} />
      {error && <DatabaseNotice detail={error} />}
      {!error && !hasData && (
        <section className="panel">
          <Blank icon={<IconGlobe size={22} />} title="Belum ada data makro">
            Jalankan <code>npm run job ingest-macro</code> atau tunggu job terjadwal pukul 03.00 UTC.
          </Blank>
        </section>
      )}
      {!error &&
        hasData &&
        GROUPS.map((g) => (
          <section key={g.title} className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconGlobe size={14} />
                {g.title}
              </span>
            </div>
            <div className="macro-cards">
              {series
                .filter((s) => g.match(s.id))
                .map((s) => {
                  const last = s.points.at(-1)
                  const prev = s.points.at(-2)
                  return (
                    <div key={s.id} className="macro-card">
                      <div className="macro-card-title">{s.label}</div>
                      <div className="macro-card-value">{last ? formatValue(s.id, last.value) : '—'}</div>
                      <div className="macro-card-note">
                        {last ? `per ${last.date}` : 'belum ada data'}
                        {last && prev ? ` · ${formatDelta(s.id, last.value, prev.value)}` : ''}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Sparkline values={s.points.map((p) => p.value)} label={`Tren ${s.label}`} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        ))}
    </>
  )
}
