/**
 * Arsip kerja AI: setiap sidang komite dan setiap warta, dengan siapa yang
 * mengerjakannya. Pemilih tab dan penyaring berupa tautan/form GET biasa supaya
 * halaman yang sedang dibuka ikut tersimpan di alamat.
 */

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-auth'
import { IconHistory } from '@/components/icons'
import {
  ARCHIVE_PAGE_SIZE,
  listNewsArchive,
  listSessionArchive,
  type NewsArchiveItem,
  type SessionArchiveItem,
} from '@/lib/db/work-archive-queries'
import styles from './archive.module.css'
import { formatWib } from './format'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Arsip Kerja AI — Admin AI Investdesk',
  description: 'Arsip sidang komite dan warta yang ditulis AI, beserta penyedia model yang mengerjakannya.',
}

interface Props {
  searchParams: Promise<{ tab?: string; page?: string; q?: string; verdict?: string }>
}

export default async function WorkArchivePage({ searchParams }: Props) {
  await requireAdmin()
  const params = await searchParams
  const tab = params.tab === 'berita' ? 'berita' : 'sidang'
  const page = Math.max(1, Number(params.page) || 1)
  const q = params.q?.trim() ?? ''
  const verdict = params.verdict ?? ''

  let error: string | null = null
  let sessions: { items: SessionArchiveItem[]; total: number } | null = null
  let news: { items: NewsArchiveItem[]; total: number } | null = null
  try {
    if (tab === 'sidang') sessions = await listSessionArchive({ page, symbol: q, verdict })
    else news = await listNewsArchive({ page, q })
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const total = sessions?.total ?? news?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE))
  const link = (p: number) => {
    const qs = new URLSearchParams({ tab, page: String(p) })
    if (q) qs.set('q', q)
    if (verdict) qs.set('verdict', verdict)
    return `/admin/arsip-kerja?${qs}`
  }

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <div className="admin-page-hero">
        <span className="admin-hero-glow" aria-hidden="true" />
        <div className="admin-page-hero-main">
          <div className="admin-eyebrow mono">
            <IconHistory size={13} />
            <span>ARSIP KERJA AI</span>
          </div>
          <h1 className="admin-page-headline">
            Arsip <span className="admin-headline-accent">Sidang &amp; Warta</span>
          </h1>
          <p className="admin-page-standfirst">
            Setiap hasil kerja AI dengan jejaknya: penyedia yang menjawab, lama kerjanya, dan siapa yang gagal lalu
            digantikan. Jejak penyedia tercatat untuk hasil yang dibuat sejak fitur ini aktif.
          </p>
        </div>
      </div>

      <nav className={styles.tabs} aria-label="Jenis arsip">
        <Link href="/admin/arsip-kerja?tab=sidang" className={`${styles.tab} ${tab === 'sidang' ? styles.tabActive : ''}`}>
          Sidang komite
        </Link>
        <Link href="/admin/arsip-kerja?tab=berita" className={`${styles.tab} ${tab === 'berita' ? styles.tabActive : ''}`}>
          Warta
        </Link>
        <Link href="/admin/ruang-komite" className={styles.tab}>
          Ruang komite (langsung)
        </Link>
      </nav>

      <form className={styles.filters} method="get">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder={tab === 'sidang' ? 'Cari simbol, mis. BBCA' : 'Cari judul warta'}
          className={styles.input}
        />
        {tab === 'sidang' && (
          <select name="verdict" defaultValue={verdict} className={styles.input} aria-label="Putusan">
            <option value="">Semua putusan</option>
            <option value="beli">beli</option>
            <option value="tahan">tahan</option>
            <option value="jual">jual</option>
            <option value="abstain">abstain</option>
          </select>
        )}
        <button className={styles.button}>Saring</button>
        <span className={styles.muted}>{total.toLocaleString('id-ID')} hasil</span>
      </form>

      {error && <p className={styles.empty}>Arsip gagal dimuat: {error}</p>}

      {sessions && <SessionTable items={sessions.items} />}
      {news && <NewsTable items={news.items} />}

      <div className={styles.pager}>
        <span>
          Halaman {page} dari {pages}
        </span>
        <span style={{ display: 'flex', gap: 14 }}>
          {page > 1 && <Link href={link(page - 1)}>← sebelumnya</Link>}
          {page < pages && <Link href={link(page + 1)}>berikutnya →</Link>}
        </span>
      </div>
    </div>
  )
}

function SessionTable({ items }: { items: SessionArchiveItem[] }) {
  if (items.length === 0) return <p className={styles.empty}>Belum ada sidang yang cocok.</p>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Waktu (WIB)</th>
            <th>Aset</th>
            <th>Status</th>
            <th>Putusan</th>
            <th className={styles.num}>Keyakinan</th>
            <th>Penyedia</th>
            <th className={styles.num}>Giliran</th>
            <th className={styles.num}>Token</th>
            <th>Digantikan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td className={styles.mono}>
                <Link href={`/admin/arsip-kerja/sidang/${s.id}`}>{s.id}</Link>
              </td>
              <td className={styles.mono}>{formatWib(s.startedAt)}</td>
              <td>
                <Link href={`/admin/arsip-kerja/sidang/${s.id}`} className={styles.mono}>
                  {s.symbol}
                </Link>{' '}
                <span className={styles.muted}>{s.market}</span>
              </td>
              <td>
                <span className={`${styles.tag} ${styles[`t_${s.status}`] ?? ''}`}>{s.status}</span>
              </td>
              <td>{s.verdict ? <span className={`${styles.tag} ${styles[`t_${s.verdict}`] ?? ''}`}>{s.verdict}</span> : '—'}</td>
              <td className={styles.num}>{s.confidence ?? '—'}</td>
              <td className={styles.mono}>{s.providers.join(', ') || '—'}</td>
              <td className={styles.num}>{s.turns}</td>
              <td className={styles.num}>{s.tokens.toLocaleString('id-ID')}</td>
              <td>
                {s.replaced === null ? (
                  <span className={styles.muted}>tidak tercatat</span>
                ) : s.replaced > 0 ? (
                  <span className={`${styles.tag} ${styles.replaced}`}>{s.replaced} giliran</span>
                ) : (
                  <span className={styles.muted}>tidak ada</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NewsTable({ items }: { items: NewsArchiveItem[] }) {
  if (items.length === 0) return <p className={styles.empty}>Belum ada warta yang cocok.</p>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Dibuat (WIB)</th>
            <th>Judul</th>
            <th>Kategori</th>
            <th>Sentimen</th>
            <th className={styles.num}>Sumber</th>
            <th className={styles.num}>Bahasa</th>
            <th>Dikerjakan oleh</th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => {
            const replaced = n.steps.filter((s) => s.failovers.length > 0).length
            return (
              <tr key={n.id}>
                <td className={styles.mono}>{n.id}</td>
                <td className={styles.mono}>{formatWib(n.createdAt)}</td>
                <td>
                  <Link href={`/admin/arsip-kerja/berita/${n.id}`}>{n.title}</Link>
                </td>
                <td className={styles.muted}>{n.category}</td>
                <td>
                  <span className={`${styles.tag} ${styles[`t_${n.sentiment}`] ?? ''}`}>{n.sentiment}</span>
                </td>
                <td className={styles.num}>{n.sources}</td>
                <td className={styles.num}>{1 + n.locales}</td>
                <td className={styles.mono}>
                  {n.steps.length === 0 ? (
                    <span className={styles.muted}>tidak tercatat</span>
                  ) : (
                    <>
                      {[...new Set(n.steps.map((s) => s.providerId))].join(', ')}
                      {replaced > 0 && <span className={`${styles.tag} ${styles.replaced}`} style={{ marginLeft: 6 }}>{replaced} digantikan</span>}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
