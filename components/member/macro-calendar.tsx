/**
 * Kalender makro pekan ini, dikelompokkan per hari dalam WIB.
 *
 * Bawaannya hanya peristiwa berdampak tinggi dan sedang untuk mata uang yang
 * menggerakkan pasar Indonesia; "semua" membuka sisanya. Pemilihnya tautan
 * biasa, jadi pilihan ikut tersimpan di alamat.
 */

import Link from 'next/link'
import type { CalendarResult, MacroEvent } from '@/lib/macro/calendar'

const MAJOR = new Set(['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'All'])

const DAY: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' }
const HOUR: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }

export function MacroCalendar({ data, showAll, now }: { data: CalendarResult; showAll: boolean; now: number }) {
  const events = data.events.filter((e) =>
    showAll ? true : (e.impact === 'High' || e.impact === 'Medium') && MAJOR.has(e.country),
  )

  const days = new Map<string, MacroEvent[]>()
  for (const e of events) {
    const key = new Date(e.date).toLocaleDateString('id-ID', DAY)
    days.set(key, [...(days.get(key) ?? []), e])
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Kalender makro pekan ini</span>
        <span className="mcal-switch mono">
          <Link href="/makro" className={!showAll ? 'active' : ''}>
            penting
          </Link>
          <Link href="/makro?kalender=semua" className={showAll ? 'active' : ''}>
            semua
          </Link>
        </span>
      </div>
      <p className="mcal-note">
        Jam dalam WIB. Sumber: Forex Factory{data.origin === 'stored' ? ' (salinan tersimpan — umpan sedang tidak bisa diambil)' : ''}.
        Jadwal Indonesia (RDG Bank Indonesia, inflasi BPS) belum tercakup sumber ini.
      </p>
      {events.length === 0 && <p className="mcal-note">Tidak ada peristiwa yang cocok pada pekan ini.</p>}
      {[...days.entries()].map(([day, list]) => (
        <div key={day} className="mcal-day">
          <div className="mcal-day-title mono">{day}</div>
          <table className="mcal-table">
            <tbody>
              {list.map((e) => {
                const past = Date.parse(e.date) < now
                return (
                  <tr key={`${e.title}-${e.country}-${e.date}`} className={past ? 'past' : ''}>
                    <td className="mono mcal-time">{new Date(e.date).toLocaleTimeString('id-ID', HOUR).replace('.', ':')}</td>
                    <td className="mono mcal-cur">{e.country}</td>
                    <td>
                      <span className={`mcal-impact ${e.impact.toLowerCase()}`} title={`Dampak: ${e.impact}`} />
                      {e.title}
                    </td>
                    <td className="mono mcal-num" title="Perkiraan">
                      {e.forecast || '—'}
                    </td>
                    <td className="mono mcal-num" title="Sebelumnya">
                      {e.previous || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
