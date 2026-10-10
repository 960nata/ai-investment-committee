import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-auth'
import { getNewsArchive } from '@/lib/db/work-archive-queries'
import styles from '../../archive.module.css'
import { failoverChain, formatWib } from '../../format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rincian Warta — Arsip Kerja AI' }

const STEP_LABEL: Record<string, string> = {
  redaktur: 'Redaktur — memilih berita',
  penulis: 'Penulis — menyusun artikel',
}

export default async function NewsArchiveDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const data = await getNewsArchive(id)
  if (!data) notFound()
  const { article, locales, sources, traces } = data
  const tokens = traces.reduce((n, t) => n + (t.inputTokens ?? 0) + (t.outputTokens ?? 0), 0)

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <Link href="/admin/arsip-kerja?tab=berita" className={styles.back}>
        ← Arsip warta
      </Link>
      <h1 className="admin-page-headline">{article.title}</h1>
      <p className={styles.prose}>{article.summary}</p>

      <div className={styles.summary}>
        <Stat label="ID" value={article.id} />
        <Stat label="Dibuat (WIB)" value={formatWib(article.createdAt)} />
        <Stat label="Kategori" value={article.category} />
        <Stat label="Sentimen" value={article.sentiment} />
        <Stat label="Dampak" value={`${article.impactScore}/10`} />
        <Stat label="Dibaca" value={article.viewsCount.toLocaleString('id-ID')} />
        <Stat label="Bahasa" value={['id', ...locales].join(', ')} />
        <Stat label="Token AI" value={traces.length ? tokens.toLocaleString('id-ID') : 'tidak tercatat'} />
      </div>

      <p className={styles.prose}>
        <Link href={`/berita/${article.slug}`} target="_blank">
          Buka artikel publik ↗
        </Link>{' '}
        · <Link href={`/admin/berita/${article.id}/edit`}>Sunting di CMS</Link>
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Jejak kerja AI</h2>
        {traces.length === 0 ? (
          <p className={styles.empty}>
            Tidak tercatat. Artikel ini dibuat sebelum jejak kerja aktif, atau ditulis manual di CMS.
          </p>
        ) : (
          traces.map((t) => (
            <article key={t.id} className={styles.turn}>
              <header className={styles.turnHead}>
                <span className={styles.turnAgent}>
                  {STEP_LABEL[t.step] ?? (t.step.startsWith('terjemah-') ? `Penerjemah — ${t.step.slice(9).toUpperCase()}` : t.step)}
                </span>
                <span className={styles.mono}>
                  {t.providerId}/{t.model}
                </span>
                {t.latencyMs !== null && <span>{(t.latencyMs / 1000).toFixed(1)} dtk</span>}
                <span>
                  {t.inputTokens ?? 0}→{t.outputTokens ?? 0} tok
                </span>
                <span>{formatWib(t.createdAt)}</span>
              </header>
              {t.failovers.length > 0 && (
                <div className={styles.chain}>DIGANTIKAN: {failoverChain(t.failovers, t.providerId)}</div>
              )}
            </article>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sumber berita ({sources.length})</h2>
        {sources.length === 0 ? (
          <p className={styles.empty}>Artikel ini tidak mencantumkan sumber berita asli.</p>
        ) : (
          <ol className={styles.list}>
            {sources.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener nofollow">
                  {s.title}
                </a>{' '}
                <span className={styles.muted}>{s.source}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  )
}
