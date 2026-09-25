/**
 * Pemantau serangan.
 *
 * Halaman analitik pernah memuat bagian bernama "radar serangan siber" yang
 * seluruh isinya karangan — lengkap dengan alamat IP penyerang dan jumlah
 * serangan yang "dicegah WAF" yang tidak pernah ada. Bagian itu dihapus dengan
 * alasan yang ditulis di berkasnya: angka karangan di layar admin lebih
 * berbahaya daripada layar kosong, karena pembacanya mengambil keputusan
 * berdasarkan angka yang tidak pernah ada.
 *
 * Halaman ini penggantinya, dan perbedaannya cuma satu: sekarang penyaringnya
 * betulan ada. Tiap baris di sini datang dari blokir yang benar-benar
 * dijatuhkan `lib/http/shield.ts` lewat `proxy.ts`. Kalau Redis belum
 * dikonfigurasi, halaman ini mengatakannya dan tidak menampilkan apa-apa —
 * bukan menampilkan nol seolah-olah tidak ada serangan.
 */

import type { Metadata } from 'next'
import {
  IconActivity,
  IconAlert,
  IconBolt,
  IconClock,
  IconLock,
  IconRadar,
  IconShield,
} from '@/components/icons'
import {
  blockHistory,
  recentEvents,
  shieldIsPersistent,
  type SecurityEvent,
} from '@/lib/http/blocklist'
import { budgetStatus } from '@/lib/http/budget'
import { SIGNAL_LABELS } from '@/lib/http/shield'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Keamanan | Admin Komite',
  description:
    'Blokir yang dijatuhkan penyaring serangan, sebarannya per hari, dan sisa pagu belanja model hari ini.',
}

/** Lama blokir dalam kalimat, bukan dalam detik. */
function describeBan(seconds: number): string {
  if (seconds >= 86_400) {
    const days = Math.round(seconds / 86_400)
    return days === 1 ? 'sehari' : `${days} hari`
  }
  const hours = Math.round(seconds / 3600)
  return hours === 1 ? '1 jam' : `${hours} jam`
}

/** Jarak waktu dalam kalimat pendek. */
function describeAge(epochSeconds: number): string {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - epochSeconds) / 60))
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} mnt lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.round(hours / 24)} hari lalu`
}

function countByReason(events: SecurityEvent[]): Array<[string, number]> {
  const tally = new Map<string, number>()
  for (const event of events) {
    tally.set(event.reason, (tally.get(event.reason) ?? 0) + 1)
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])
}

export default async function AdminSecurityPage() {
  const persistent = shieldIsPersistent()

  const [events, history, budget] = await Promise.all([
    recentEvents(50),
    blockHistory(14),
    budgetStatus(),
  ])

  const today = history.at(-1)?.total ?? 0
  const fortnight = history.reduce((sum, day) => sum + day.total, 0)
  const peak = Math.max(1, ...history.map((day) => day.total))
  const repeatOffenders = events.filter((event) => event.strike > 1).length

  const budgetPct =
    budget.publicCeiling > 0
      ? Math.min(100, Math.round((budget.publicUsed / budget.publicCeiling) * 100))
      : 0

  return (
    <div className="admin-page-content" suppressHydrationWarning>
      {/* 1. KEPALA HALAMAN */}
      <div className="admin-page-hero" suppressHydrationWarning>
        <span className="admin-hero-glow" aria-hidden="true" />

        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span>PENYARING PERMINTAAN</span>
          </div>

          <h1 className="admin-page-headline">
            Pemantau <span className="admin-headline-accent">Serangan</span>
          </h1>

          <p className="admin-page-standfirst">
            Tiap baris di halaman ini adalah blokir yang benar-benar dijatuhkan, bukan contoh.
            Permintaan disaring di <span className="mono">proxy.ts</span> sebelum menyentuh route
            mana pun &mdash; pemindaian alamat, perkakas serangan, dan muatan suntikan ditolak
            tanpa memakai satu pun perintah berbayar.
          </p>
        </div>

        <div className="admin-hero-chips mono" suppressHydrationWarning>
          <div className="admin-hero-chips-head">
            <IconLock size={11} />
            <span>STATUS LAPISAN</span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${persistent ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Daftar blokir</span>
            <span className={`admin-hero-chip-value ${persistent ? 'ok' : 'warn'}`}>
              {persistent ? 'Tersimpan' : 'Memori saja'}
            </span>
          </div>

          <div className="admin-hero-chip">
            <span className={`chip-indicator ${budget.tracked ? 'ok' : 'warn'}`} />
            <span className="admin-hero-chip-name">Pagu model</span>
            <span className={`admin-hero-chip-value ${budget.tracked ? 'ok' : 'warn'}`}>
              {budget.tracked ? 'Dihitung' : 'Turun kelas'}
            </span>
          </div>

          <div className="admin-hero-chips-foot">14 HARI TERAKHIR</div>
        </div>
      </div>

      {/* 2. PERINGATAN KALAU PENYIMPANANNYA BELUM ADA */}
      {!persistent && (
        <div className="ga-notice ga-notice-error">
          <IconAlert size={18} />
          <div>
            <h2 className="ga-notice-title">Redis belum dikonfigurasi</h2>
            <p className="ga-notice-body">
              Penyaringnya tetap bekerja &mdash; pola serangan dikenali dan ditolak seperti biasa,
              sebab pengenalannya tidak butuh penyimpanan apa pun. Yang hilang adalah ingatannya:
              blokir hanya berlaku selama instance yang sedang melayani masih hidup, pelanggar
              berulang tidak dikenali sebagai pengulang, dan tidak ada insiden yang bisa
              ditampilkan di bawah.
            </p>
            <p className="ga-notice-body">
              Pagu belanja model turun ke penghitung di memori proses, dengan pagu seperempatnya
              supaya beberapa instance yang berjalan bersamaan tidak menjumlahkan diri melewati
              pagu yang dimaksud. Tombol rapat komite tetap hidup, tetapi angka di kartu &ldquo;pagu
              model publik&rdquo; hanya mewakili satu instance dan akan tampak melompat-lompat. Isi{' '}
              <span className="mono">UPSTASH_REDIS_REST_URL</span> dan{' '}
              <span className="mono">UPSTASH_REDIS_REST_TOKEN</span> untuk menghidupkan keduanya
              sepenuhnya.
            </p>
          </div>
        </div>
      )}

      {/* 3. ANGKA POKOK */}
      <div className="admin-stats-grid">
        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">BLOKIR HARI INI</span>
            <span className="admin-stat-icon-wrap">
              <IconShield size={16} />
            </span>
          </div>
          <div className="admin-stat-number">{today}</div>
          <div className="admin-stat-meta mono">
            <span className={`admin-stat-badge ${today === 0 ? 'safe' : 'active'}`}>
              {today === 0 ? 'Tenang' : 'Ada aktivitas'}
            </span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">BLOKIR 14 HARI</span>
            <span className="admin-stat-icon-wrap">
              <IconRadar size={16} />
            </span>
          </div>
          <div className="admin-stat-number">{fortnight}</div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge safe">Puncak {peak}/hari</span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">PELANGGAR ULANG</span>
            <span className="admin-stat-icon-wrap">
              <IconActivity size={16} />
            </span>
          </div>
          <div className="admin-stat-number">{repeatOffenders}</div>
          <div className="admin-stat-meta mono">
            <span className="admin-stat-badge safe">dari {events.length} insiden tercatat</span>
          </div>
        </article>

        <article className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label mono">PAGU MODEL PUBLIK</span>
            <span className="admin-stat-icon-wrap">
              <IconBolt size={16} />
            </span>
          </div>
          <div className="admin-stat-number">
            {budget.publicUsed}
            <span style={{ fontSize: '0.45em', opacity: 0.55 }}> / {budget.publicCeiling}</span>
          </div>
          <div className="admin-stat-meta mono">
            <span className={`admin-stat-badge ${budgetPct >= 80 ? 'active' : 'safe'}`}>
              {budgetPct}% terpakai
            </span>
          </div>
        </article>
      </div>

      {/* 4. SEBARAN HARIAN */}
      <section>
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            <IconClock size={14} /> Sebaran blokir per hari
          </h2>
          <span className="admin-section-line" aria-hidden="true" />
        </div>

        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          {history.length === 0 ? (
            <p className="ga-notice-body mono" style={{ margin: 0, opacity: 0.6 }}>
              Belum ada riwayat untuk ditampilkan.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${history.length}, 1fr)`,
                alignItems: 'end',
                gap: '4px',
                height: '120px',
              }}
            >
              {history.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.total} blokir`}
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}
                >
                  <div
                    style={{
                      marginTop: 'auto',
                      height: `${Math.max(2, (day.total / peak) * 100)}%`,
                      borderRadius: '3px 3px 0 0',
                      background:
                        day.total === 0
                          ? 'color-mix(in srgb, currentColor 12%, transparent)'
                          : 'linear-gradient(180deg, var(--accent, #d4a15a), color-mix(in srgb, var(--accent, #d4a15a) 45%, transparent))',
                    }}
                  />
                  <span
                    className="mono"
                    style={{ fontSize: '0.6rem', opacity: 0.45, textAlign: 'center' }}
                  >
                    {day.date.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. JENIS SERANGAN */}
      {events.length > 0 && (
        <section>
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              <IconAlert size={14} /> Jenis yang tercatat
            </h2>
            <span className="admin-section-line" aria-hidden="true" />
          </div>

          <div className="admin-health-grid">
            {countByReason(events).map(([reason, count]) => (
              <div className="admin-health-item" key={reason}>
                <span>{SIGNAL_LABELS[reason as keyof typeof SIGNAL_LABELS] ?? reason}</span>
                <strong className="mono">{count}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. INSIDEN TERAKHIR */}
      <section>
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            <IconRadar size={14} /> Insiden terakhir
          </h2>
          <span className="admin-section-line" aria-hidden="true" />
        </div>

        <div className="admin-table-card">
          <div className="admin-table-card-head">
            <div>
              <h3 className="admin-table-title">Blokir yang dijatuhkan</h3>
              <p className="admin-table-subtitle">
                Satu baris per blokir, bukan per permintaan. Penyerang yang terus mengetuk setelah
                diblokir tidak menambah baris di sini &mdash; kalau tidak, satu pemindai akan
                menenggelamkan seluruh catatan sendirian.
              </p>
            </div>
          </div>

          <div className="admin-table-container">
            {events.length === 0 ? (
              <p
                className="ga-notice-body mono"
                style={{ padding: '2rem 1.25rem', margin: 0, opacity: 0.6 }}
              >
                {persistent
                  ? 'Belum ada blokir tercatat. Itu kabar baik, bukan kesalahan.'
                  : 'Tidak ada yang bisa dibaca tanpa Redis.'}
              </p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Jenis</th>
                    <th>Asal</th>
                    <th>Sasaran</th>
                    <th>Bukti</th>
                    <th>Hukuman</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.at}-${index}`}>
                      <td className="mono" style={{ whiteSpace: 'nowrap', opacity: 0.7 }}>
                        {describeAge(event.at)}
                      </td>
                      <td>
                        {SIGNAL_LABELS[event.reason] ?? event.reason}
                        {event.strike > 1 && (
                          <span className="mono" style={{ opacity: 0.55, fontSize: '0.75em' }}>
                            {' '}
                            &middot; ke-{event.strike}
                          </span>
                        )}
                      </td>
                      <td className="mono">{event.from}</td>
                      <td className="mono" style={{ opacity: 0.8 }}>
                        {event.method} {event.path}
                      </td>
                      <td
                        className="mono"
                        style={{
                          opacity: 0.6,
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={event.evidence ?? ''}
                      >
                        {event.evidence ?? '—'}
                      </td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {describeBan(event.banSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
