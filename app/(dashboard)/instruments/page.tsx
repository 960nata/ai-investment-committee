/**
 * Daftar instrumen.
 *
 * Kolom yang paling berarti di sini bukan nama atau pasar, melainkan panjang
 * riwayat. Normalisasi persentil memakai jendela dua tahun instrumen itu
 * sendiri, jadi instrumen berriwayat pendek menghasilkan angka yang belum layak
 * dipercaya. Pita di kolom terakhir menunjukkan seberapa dekat tiap instrumen ke
 * ambang itu, sehingga yang belum siap terlihat tanpa perlu dijelaskan.
 */

import { IconLayers, IconRows } from '@/components/icons'
import { DatabaseNotice, Blank, Tag, Track } from '@/components/ui'
import {
  getCandleCountsByInstrument,
  listInstruments,
  type InstrumentView,
} from '@/lib/db/queries'
import { requireUser } from '@/lib/auth/user-auth'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Instrumen' }

/** Dua tahun hari perdagangan. Di bawah ini persentil dihitung dari sampel tipis. */
const HISTORY_TARGET = 504

interface Row extends InstrumentView {
  candleCount: number
  latestDate: string | null
}

export default async function InstrumentsPage() {
  // Penjagaan yang mengikat. `proxy.ts` sudah memantulkan pengunjung anonim
  // lebih dulu, tetapi pemeriksaan di sini yang menjamin halaman ini tidak
  // pernah merender data untuk orang tanpa sesi.
  await requireUser('/instruments')
  let rows: Row[] = []
  let error: string | null = null

  try {
    const instruments = await listInstruments(undefined, { includeDelisted: true })
    const counts = await getCandleCountsByInstrument(instruments.map((i) => i.id))
    rows = instruments.map((i) => ({
      ...i,
      candleCount: counts.get(i.id)?.count ?? 0,
      latestDate: counts.get(i.id)?.latestDate ?? null,
    }))
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const ready = rows.filter((r) => r.candleCount >= HISTORY_TARGET).length

  return (
    <>
      <header className="masthead">
        <p className="eyebrow">Cakupan data</p>
        <h1 className="headline">Instrumen</h1>
        <p className="standfirst">
          Aset yang dilacak beserta panjang riwayat harga yang sudah tersimpan sendiri.
        </p>
      </header>

      {error && <DatabaseNotice detail={error} />}

      {!error && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <IconRows size={14} />
              Terdaftar
            </span>
            <span className="panel-meta">
              {rows.length > 0
                ? `${ready} dari ${rows.length} punya riwayat dua tahun`
                : 'kosong'}
            </span>
          </div>

          {rows.length === 0 ? (
            <Blank icon={<IconLayers size={22} />} title="Belum ada instrumen">
              Jalankan <code>npm run db:seed</code> untuk mengisi daftar awal, lalu tunggu
              dispatcher berjalan pada jam berikutnya.
            </Blank>
          ) : (
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Simbol</th>
                    <th>Nama</th>
                    <th>Pasar</th>
                    <th className="num">Candle</th>
                    <th>Riwayat</th>
                    <th>Terakhir</th>
                    <th>Keadaan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="key">{row.symbol}</td>
                      <td>{row.name}</td>
                      <td>
                        <Tag>{row.market}</Tag>
                      </td>
                      <td className="num">{row.candleCount.toLocaleString('id-ID')}</td>
                      <td style={{ minWidth: 120 }}>
                        <Track
                          value={row.candleCount === 0 ? null : row.candleCount / HISTORY_TARGET}
                          state={row.candleCount >= HISTORY_TARGET ? 'ok' : 'degraded'}
                          ticks={14}
                          label={`riwayat ${row.symbol}`}
                        />
                      </td>
                      <td className="dim">{row.latestDate ?? '—'}</td>
                      <td>{readiness(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function readiness(row: Row) {
  if (row.delistedAt) return <Tag>delisting {row.delistedAt}</Tag>
  if (row.candleCount === 0) return <Tag>menunggu data</Tag>
  if (row.candleCount < HISTORY_TARGET) return <Tag tone="warn">riwayat pendek</Tag>
  return <Tag tone="ok">siap dianalisis</Tag>
}
