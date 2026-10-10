/**
 * Buku kas project: pemasukan dan pengeluaran dalam rupiah.
 *
 * Pembayaran Premium yang lunas disalin otomatis setiap kali halaman ini
 * dibuka; sisanya dicatat manual. Ringkasan bulanan yang sama ikut dibaca
 * rapat project sebagai bagian "keuangan".
 */

import { requireAdmin } from '@/lib/auth/admin-auth'
import { IconWallet } from '@/components/icons'
import { LedgerDelete, LedgerForm } from '@/components/admin/ledger-form'
import { rupiah } from '@/components/admin/project-format'
import {
  LEDGER_CATEGORIES,
  ledgerByMonth,
  listLedger,
  syncPremiumIncome,
  wibDate,
  type LedgerEntry,
  type LedgerMonth,
} from '@/lib/project/store'
import styles from '@/components/admin/project.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Buku Kas — Admin AI Investdesk',
  description: 'Rincian dana project: pemasukan, pengeluaran, dan saldo per bulan.',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export default async function LedgerPage() {
  await requireAdmin()

  let entries: LedgerEntry[] = []
  let months: LedgerMonth[] = []
  let synced = 0
  let error: string | null = null
  try {
    synced = await syncPremiumIncome()
    ;[entries, months] = await Promise.all([listLedger({ limit: 300 }), ledgerByMonth(24)])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const today = wibDate(new Date())
  const thisMonth = months.find((m) => m.month === today.slice(0, 7)) ?? { masuk: 0, keluar: 0 }
  const balance = months.reduce((n, m) => n + m.masuk - m.keluar, 0)

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconWallet size={13} />
            <span>RINCIAN DANA</span>
          </div>
          <h1 className="admin-page-headline">
            Buku <span className="admin-headline-accent">Kas</span>
          </h1>
          <p className="admin-page-standfirst">
            Pemasukan Premium tercatat otomatis dari pembayaran lunas{synced ? ` (${synced} baru disalin barusan)` : ''}.
            Biaya hosting, API, domain, dan lainnya dicatat manual di bawah. Rapat project membaca angka yang sama.
          </p>
        </div>
      </div>

      {error && <p className={`${styles.notice} ${styles.noticeBad}`}>Buku kas gagal dimuat: {error}</p>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Pemasukan bulan ini</div>
          <div className={`${styles.statValue} ${styles.up}`}>{rupiah(thisMonth.masuk)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Pengeluaran bulan ini</div>
          <div className={`${styles.statValue} ${styles.down}`}>{rupiah(thisMonth.keluar)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Selisih bulan ini</div>
          <div className={`${styles.statValue} ${thisMonth.masuk - thisMonth.keluar >= 0 ? styles.up : styles.down}`}>
            {rupiah(thisMonth.masuk - thisMonth.keluar)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Saldo 24 bulan</div>
          <div className={`${styles.statValue} ${balance >= 0 ? styles.up : styles.down}`}>{rupiah(balance)}</div>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Catat transaksi</h2>
        <LedgerForm categories={LEDGER_CATEGORIES} today={today} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Per bulan</h2>
        {months.length === 0 ? (
          <p className={styles.empty}>Belum ada catatan kas.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th className={styles.num}>Masuk</th>
                  <th className={styles.num}>Keluar</th>
                  <th className={styles.num}>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const [y, mo] = m.month.split('-').map(Number)
                  const net = m.masuk - m.keluar
                  return (
                    <tr key={m.month}>
                      <td className={styles.mono}>
                        {MONTHS[mo - 1]} {y}
                      </td>
                      <td className={`${styles.num} ${styles.up}`}>{rupiah(m.masuk)}</td>
                      <td className={`${styles.num} ${styles.down}`}>{rupiah(m.keluar)}</td>
                      <td className={`${styles.num} ${net >= 0 ? styles.up : styles.down}`}>{rupiah(net)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Catatan</h2>
        {entries.length === 0 ? (
          <p className={styles.empty}>Belum ada catatan.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Kategori</th>
                  <th>Keterangan</th>
                  <th className={styles.num}>Jumlah</th>
                  <th>Sumber</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className={styles.mono}>{e.entryDate}</td>
                    <td>{e.kind}</td>
                    <td>{e.category}</td>
                    <td>{e.description || '—'}</td>
                    <td className={`${styles.num} ${e.kind === 'masuk' ? styles.up : styles.down}`}>
                      {e.kind === 'masuk' ? '+' : '−'}
                      {rupiah(e.amount)}
                    </td>
                    <td className={styles.muted}>{e.source === 'premium' ? 'otomatis' : 'manual'}</td>
                    <td>{e.source === 'manual' && <LedgerDelete id={e.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
